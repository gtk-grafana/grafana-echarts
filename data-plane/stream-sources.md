# Stream family: which data sources can feed it

Companion to [stream.md](./stream.md), which defines the contract. This one
answers the practical question: **what do real Grafana data sources return, and
does it render as a theme river?** Every claim below is about the two frame shapes
that doc defines — shape 1 (time + N numeric fields, one layer per field) and shape
2 (time + 1 numeric + a label column, one layer per label value).

The short version: **a range query that groups by one label is already compatible,
with no reshape.** The interesting work is only ever reducing cardinality.

## When is a theme river the right panel?

It answers _"how did the composition change over time"_ — the mix, not the
magnitudes. Good fits share three properties:

- **Parts of a whole**, where the total is meaningful (request rate by status, log
  volume by level, spend by service, queue depth by consumer).
- **A handful of layers.** Two to about a dozen. Beyond that the thin bands stop
  being distinguishable — and unlike a legend-heavy line chart, there is no value
  axis to fall back on.
- **Non-negative values.** Stacking mixed signs produces a baseline that no longer
  reads as a total (see the divergences in [stream.md](./stream.md)).

It is the wrong panel when you need to read values off an axis, compare against a
threshold, or watch a single series — use the cartesian family for those.

## Prometheus — compatible as-is

A **range query** returns `TimeSeriesMulti`: one frame per series, each with a time
field and one numeric field carrying the series' labels. That is shape 1, and the
converter merges every frame with no join (`forEachTimeSeriesField`).

```promql
# Traffic composition by response class — the canonical stream graph
sum by (code) (rate(http_requests_total{job="$job"}[$__rate_interval]))
```

```promql
# Cost/usage composition by workload
sum by (namespace) (rate(container_cpu_usage_seconds_total[$__rate_interval]))
```

Layer names come from `getFieldDisplayName`, so a **Legend** field of `{{code}}` in
the query editor names the ribbons.

Two caveats:

- **Instant queries do not work.** One timestamp gives a degenerate river; use the
  part-to-whole family for a snapshot composition. The suggestion scorer withholds
  the stream panel for instant data.
- **Aggregate deliberately.** `sum by (pod)` on a large cluster is hundreds of
  layers. Either narrow the query (`topk`), or reduce server-side — see
  [SQL expressions](#sql-expressions--the-general-reshape) below.

## Loki — compatible as-is, and the best fit in the family

A **metric query** returns the same `TimeSeriesMulti` shape. Log volume by level is
the use case the panel exists for: the mix of levels over time is exactly what a
river reads well, and core Grafana has no panel for it.

```logql
# Log volume by level
sum by (level) (count_over_time({app="$app"} | json | __error__="" [$__auto]))
```

```logql
# Error composition by route
sum by (route) (rate({app="$app"} |= "error" | json [$__auto]))
```

**Raw log frames are not compatible.** A `Logs`-kind frame has no numeric field to
stack; it has to be aggregated into a metric query first (which is what the
log-volume histogram above the Explore results does internally).

## SQL (PostgreSQL / MySQL) — compatible in both shapes

One query, two shapes, depending on the **Format** setting:

```sql
SELECT
  $__timeGroupAlias(created_at, '$__interval'),
  service,
  sum(cost) AS value
FROM spend
WHERE $__timeFilter(created_at)
GROUP BY 1, 2
ORDER BY 1
```

- **Format as: Time series** — Grafana pivots the label column, producing one frame
  per `service`: **shape 1**.
- **Format as: Table** — the frame stays long (`time`, `service`, `value`):
  **shape 2**, pivoted by the converter on the `service` column.

Both render identically. Shape 2 is worth knowing because it is what you get by
default from anything table-shaped, including every SQL expression.

Ordering does not matter to the converter (each point carries its timestamp), but
`ORDER BY 1` keeps the layer order predictable, since layers appear in
first-appearance order.

## SQL expressions — the general reshape

[SQL expressions](https://grafana.com/docs/grafana/latest/panels-visualizations/query-transform-data/sql-expressions/)
are server-side, MySQL-dialect queries over the results of other queries,
referenced by RefID. They are **enabled by default** (no feature toggle) and need a
**backend** data source.

The detail that matters here: referencing a RefID converts a non-tabular response
to a tabular **FullLong** frame — label keys become columns, the metric value lands
in `__value__`, plus a `time` column for time series data. **That output is shape
2**, which is why the long pivot exists.

### Reduce cardinality

```sql
-- A: sum by (pod) (rate(container_cpu_usage_seconds_total[$__rate_interval]))
SELECT time, namespace, SUM(__value__) AS value
FROM A
GROUP BY time, namespace
```

### Top N layers, everything else as "other"

The cardinality fix. Keeps the total honest — dropping the tail would understate it:

```sql
WITH totals AS (
  SELECT service, SUM(__value__) AS total FROM A GROUP BY service
),
ranked AS (
  SELECT service FROM totals ORDER BY total DESC LIMIT 5
)
SELECT
  time,
  CASE WHEN A.service IN (SELECT service FROM ranked) THEN A.service ELSE 'other' END AS service,
  SUM(A.__value__) AS value
FROM A
GROUP BY 1, 2
```

### Build a composite label

The converter pivots on the **first string field only**, so collapse multiple label
columns yourself:

```sql
SELECT time, CONCAT(service, ' / ', region) AS layer, SUM(__value__) AS value
FROM A
GROUP BY 1, 2
```

### Limits worth knowing

- One SQL expression per panel; it can reference queries but not other expressions.
- Each expression query must include a time range.
- **Input cells** (rows × columns across all referenced queries) are capped by
  `sql_expression_cell_limit`, default **100 000** — reachable on a wide range at a
  fine interval. Output cells and query length have their own caps, and the
  default timeout is 10 s.
- Avoid `SELECT *`: the engine treats a changed column set as a schema change, so
  naming columns explicitly survives label churn and no-data responses better.

## Transformations — the no-SQL alternative

Two core transformations cover most reshaping without an expression:

- **Partition by values** on the label column turns one long frame into one frame
  per layer — i.e. converts shape 2 into shape 1. Useful when you want the layer
  names to come from field display names (and so honour a **Display name**
  override).
- **Group by** with a `time` and a label grouping plus a numeric aggregation
  collapses duplicate `(label, time)` rows _before_ the converter's own summing
  rule applies — the explicit way to control that aggregation.

Both are also how a long frame can be fed to the _other_ families, which do not
pivot.

## Not compatible

| Source / shape                             | Why                                                                               |
| ------------------------------------------ | --------------------------------------------------------------------------------- |
| Prometheus/Loki **instant** queries        | One timestamp — nothing to stream. Use part-to-whole.                             |
| Loki **raw logs** (`Logs` kind)            | No numeric field to stack; aggregate first.                                       |
| **Numeric** kind (no time field)           | The family's axis is time by contract; `frameToStream` returns `null`.            |
| **Heatmap** kind (`heatmap-rows`/`-cells`) | Bucketed cells, not layers — use the heatmap family.                              |
| Traces / node graph / flame graph          | Out-of-contract shapes with no time-ordered numeric series; see the roadmap docs. |

## TestData DB (what the provisioned dashboards use)

Only TestData is provisioned (`provisioning/datasources/datasources.yml`), so
`provisioning/dashboards/stream/themeriver-basic.json` fakes the shapes above:

- **Shape 1** — `random_walk` with `seriesCount: 4`, `min: 0`, `max: 100`,
  `startValue: 50`: one frame per series, positive values (a random walk crossing
  zero would distort the stack).
- **Shape 2** — `csv_content` with a `time,level,count` CSV. `csv_content` returns
  every column as a string, so the panel adds a `convertFieldType` transformation
  (`time` → time, `count` → number); the dashboard's time range is absolute to
  match the fixed timestamps.
