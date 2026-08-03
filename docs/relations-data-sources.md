# Data sources for graph / flow / relations charts

Which Grafana data sources can produce data for the **graph / flow / relations**
chart family (ECharts `graph`, `sankey`, `chord`), and how to reshape the ones that
cannot.

The frame format itself is specced in
[../data-plane/node-graph.md](../data-plane/node-graph.md); the proposed panel is in
[../todo/node-graph.md](../todo/node-graph.md). This doc is about **sourcing** the
data, which is the practical blocker: the family needs a nodes + edges frame pair,
and the three data sources most Grafana users have — Prometheus, Loki and SQL —
emit none.

> **Two target formats.** Everything from [The short version](#the-short-version) to
> [Aggregation is the hidden requirement](#aggregation-is-the-hidden-requirement)
> describes sourcing the **legacy row format** (`graph-*-long`) — the only one the panel
> reads today. [Sourcing the wide form](#sourcing-the-wide-form) at the end describes the
> field-based [`graph-*-wide` contract](../data-plane/graph-wide.md), which is materially
> cheaper to source and which nothing reads yet. Both sections are kept: the legacy
> recipes stay correct and stay needed.

## The short version

A relations chart needs **one row per edge**: a source, a target, and ideally a
weight. That is a `GROUP BY` over two dimensions. Any data source that can group by
two labels/columns can feed this family; it just needs the columns renamed to the
`source` / `target` / `mainstat` convention.

## What each source can do

| Source                       | How                                       | Emits the frame pair? |
| ---------------------------- | ----------------------------------------- | --------------------- |
| **Tempo** (service graph)    | metrics-generator → service-graph view    | Yes, natively         |
| **AWS X-Ray**                | Service map query                         | Yes, natively         |
| **TestData DB**              | `scenarioId: "node_graph"`                | Yes (frontend-built)  |
| **Prometheus**               | instant query, two grouping labels        | No — reshape          |
| **Loki**                     | instant metric query over structured logs | No — reshape          |
| **SQL** (Postgres/MySQL/…)   | an edges table, or `GROUP BY src, dst`    | No — rename fields    |
| **Infinity / JSON API**      | arbitrary JSON                            | No — reshape          |
| Elasticsearch, CloudWatch, … | terms-on-terms aggregation                | No — reshape          |

Only the first three need no work. Everything else produces a flat table whose
columns happen to describe edges, and the gap is purely naming.

### TestData DB — the fixture source

`scenarioId: "node_graph"` takes a `nodes` object with `type`, `count` and `seed`:

| `nodes.type`       | Output                                                     |
| ------------------ | ---------------------------------------------------------- |
| `random` (default) | Generated nodes + edges frames; honours `count` and `seed` |
| `response_small`   | A saved, deterministic service-map response                |
| `response_medium`  | A larger saved service-map response                        |
| `feature_showcase` | Exercises every optional field (`arc__*`, `icon`, …)       |
| `random edges`     | **A single edges frame** — the edges-only case             |

Two things worth knowing before relying on it:

- **`random` is not fully reproducible.** `seed` only drives the edge topology; the
  per-node stats, `icon`, `noderadius` and `highlighted` values come from bare
  `Math.random()`. Prefer `response_small` / `response_medium` for anything that
  should look the same twice.
- **`random` deliberately creates cycles** — `generateRandomNodes` has a loop
  commented _"Add some random edges to create possible cycle"_. That makes it a
  useful adversarial fixture for sankey (which
  [throws in production on cyclic input](../data-plane/node-graph.md#pitfalls-for-a-converter)),
  and a reason not to point a naive sankey at it.

## Use case 1 — Prometheus

Prometheus has no graph kind, but it has something better than a contrived example:
**Tempo's metrics-generator publishes service-graph edges as ordinary Prometheus
counters.** `traces_service_graph_request_total` carries `client` and `server`
labels — which _is_ a source/target pair — and the counter is the weight.

```promql
sum by (client, server) (rate(traces_service_graph_request_total[$__range]))
```

Run it as an **instant** query. One row per edge, with `client`, `server` and
`Value`. As a `graph` it is the service topology; as a `sankey` it is request volume
between services.

The same shape appears in any metric with two "endpoint" labels — for example HTTP
calls broken down by caller and callee:

```promql
sum by (source_workload, destination_workload) (rate(istio_requests_total[$__range]))
```

Reshape it with [SQL Expressions](#reshaping-with-sql-expressions).

## Use case 2 — Loki

Edges can be derived from structured logs whenever a line records both ends of a
call. With `logfmt` or `json` parsing, group by both fields in an **instant** metric
query:

```logql
sum by (service, upstream) (
  count_over_time({job="api"} | logfmt | __error__="" [$__range])
)
```

That yields one row per `service → upstream` pair with a call count. Add a filter to
weight by failures instead, which makes a far more useful sankey — the ribbons show
where errors concentrate:

```logql
sum by (service, upstream) (
  count_over_time({job="api"} | logfmt | __error__="" | level="error" [$__range])
)
```

`__error__=""` drops lines the parser could not read, so malformed lines do not
silently become an edge to an empty-string node.

## Use case 3 — SQL

SQL is the easiest case, because the aggregation is native and the column names are
yours to choose. Either the edges already exist as a table, or one `GROUP BY`
produces them:

```sql
SELECT
  CONCAT(caller, '->', callee) AS id,
  caller                       AS source,
  callee                       AS target,
  COUNT(*)                     AS mainstat
FROM service_calls
WHERE ts BETWEEN $__timeFrom() AND $__timeTo()
GROUP BY caller, callee;
```

Because the field names already match the convention, this needs **no reshaping** —
the panel consumes it directly. An optional second query supplies node metadata:

```sql
SELECT service AS id, service AS title, team AS subtitle
FROM services;
```

This is the cheapest path to a real relations chart and worth reaching for first.

## Reshaping with SQL Expressions

Prometheus and Loki return the right _rows_ with the wrong _column names_, and no
`id` column. **SQL Expressions** fix that server-side: a SQL query whose tables are
other queries in the same panel.

Verified against Grafana's source (`pkg/expr/sql/`):

- **Enabled by the `sqlExpressions` feature toggle**, which is at GA stage with
  `Expression: "true"` — on by default in current Grafana.
- **The dialect is MySQL.** The engine is
  [`github.com/dolthub/go-mysql-server`](https://github.com/dolthub/go-mysql-server),
  so MySQL functions and syntax apply — not Postgres.
- **Each upstream query's `refId` is a table name.** A query with `refId: A` is
  referenced as `FROM A`.
- **The SQL is checked against an allow-list** (`parser_allow.go`) before it runs.
  CTEs, `UNION`, joins, `GROUP BY` and `CASE` are permitted; arbitrary functions are
  not — verify anything unusual against that file.
- **There are output caps**: a query timeout and a `MaxOutputCells` limit.
- **32-bit ARM hosts have no SQL Expressions.** `dummy_arm.go` returns
  `"sql expressions not supported in arm"`. Its build constraint is `//go:build arm`,
  and Go treats `arm` (32-bit) and `arm64` as distinct `GOARCH` values, so **arm64
  hosts — including Apple Silicon — are unaffected** and compile the real
  implementation.

### Two frames means two expressions

The panel wants an edges frame and (optionally) a nodes frame, so that is **two SQL
Expression queries** over the same upstream query.

Given a Prometheus instant query `A` returning `client`, `server`, `Value`:

```sql
-- B: the edges frame
SELECT CONCAT(client, '->', server) AS id,
       client                       AS source,
       server                       AS target,
       `Value`                      AS mainstat
FROM A
```

```sql
-- C: the nodes frame — union both endpoint columns, then de-duplicate
SELECT DISTINCT n.id AS id, n.id AS title
FROM (SELECT client AS id FROM A
      UNION
      SELECT server AS id FROM A) AS n
```

`Value` is backtick-quoted because it is the conventional name Prometheus gives the
value column and is capitalised; `UNION` (not `UNION ALL`) plus `DISTINCT` collapses
services that appear as both caller and callee.

The nodes query is **optional** — Grafana derives the node set from `source`/`target`
when no nodes frame is present, so query `B` alone renders. Add `C` when nodes need
titles, subtitles or their own stats.

### Cast numeric columns inside the SQL

SQL Expressions run **server-side, before** frontend transformations. So the
`convertFieldType` transformation this repo normally uses to turn CSV strings into
numbers **cannot** prepare data for an expression — by the time it runs, the
expression has already executed.

Cast in the SQL instead:

```sql
CAST(calls AS DECIMAL(20, 4)) AS mainstat
```

MySQL `CAST` is a no-op on a value that is already numeric, so this is safe whether
the column arrived typed (Prometheus `Value`) or as text (`csv_content`). `CAST` is
permitted by the allow-list (`ConvertExpr` / `ConvertType`). It matters most for
sankey and chord, which size their ribbons from the link value and collapse to zero
height without a number.

### Why this forces field-shape detection

The output frames of `B` and `C` are named by refId. They are **not** called `nodes`
or `edges`, and a SQL Expression cannot set `meta.preferredVisualisationType`. So of
the three signals Grafana uses to detect and classify node-graph frames, only one
survives: **field shape**. An edges frame is recognised by carrying `source` (and
`target`); anything else is a nodes frame.

That is why the converter proposed in
[../todo/node-graph.md](../todo/node-graph.md) treats field shape as the primary
signal rather than a fallback — the most realistic reshaping path in Grafana produces
frames with no other identifying marks. The same applies to the provisioned
`csv_content` fixtures, which cannot set frame metadata either.

## Aggregation is the hidden requirement

One caveat that catches people out: the **legacy row format** wants **one row per unique
edge**, not one row per event or per timestamp. (The wide form does not — a range query
is a row dimension there; see [below](#sourcing-the-wide-form).)

- Use **instant** queries in Prometheus and Loki, not range queries. A range query
  returns a time series per label pair, i.e. many rows per edge.
- If a range query is unavoidable, reduce it first — a `Reduce` expression or a
  `Group by` transformation collapses it to one row per series.
- In SQL, `GROUP BY` both endpoint columns.

A sankey given per-timestamp rows will either draw duplicate parallel ribbons or
collapse, depending on how duplicates are merged.

## Sourcing the wide form

The [`graph-*-wide` contract](../data-plane/graph-wide.md) makes one node one **field**
and one edge one **field**. That changes the sourcing story more than it changes the
rendering story, because the shape it wants is the shape Prometheus, Loki and
`rowsToFields` already produce.

Every recipe below was run against Grafana 13.1.0; the observed outputs are recorded in
the contract's [Verified behaviours](../data-plane/graph-wide.md#verified-behaviours)
table, and the live panels are in
`provisioning/dashboards/relations/graph-wide.json`.

### Prometheus / Loki — zero reshaping, one setting

Same query as [Use case 1](#use-case-1--prometheus):

```promql
sum by (client, server) (rate(traces_service_graph_request_total[$__range]))
```

Then, in the query editor:

| Setting    | Value                     | Why                                                                  |
| ---------- | ------------------------- | -------------------------------------------------------------------- |
| **Format** | `Time series`             | One frame per series, i.e. one frame per edge                        |
| **Legend** | `{{client}}-->{{server}}` | **Required.** This is the edge id and the override target            |
| **Type**   | Instant _or_ Range        | Either. A range query is simply a row dimension the reduce collapses |

No SQL Expressions, no `id` column, no `CONCAT`, no instant-only restriction. The
endpoints stay in `field.labels` as `client` / `server`, which the contract accepts as
the endpoint label keys directly.

**The legend format is not optional in practice.** Without it, `getFieldDisplayName`
pushes both the frame name and the label set and the display name comes out doubled —
`{client="a", server="b"} {client="a", server="b"}` (observed). It renders, but it is not
an id anyone would write an override against. Worse, the raw field name is `Value` on
every frame, so `byName: Value` matches **every** edge at once.

The same applies to the Loki queries in [Use case 2](#use-case-2--loki): set
`{{service}}-->{{upstream}}` as the legend and the reshaping disappears.

### SQL and CSV — Rows to fields

For anything shaped like a table, core's **Rows to fields** transformation performs the
pivot. On the canonical `id,source,target,mainstat` shape it needs **no options at all**:

| Column                                          | Becomes               | How                                                         |
| ----------------------------------------------- | --------------------- | ----------------------------------------------------------- |
| first `string` column                           | the field **name**    | automatic — so `id` must be the **first** string column     |
| first `number` column                           | the field's **value** | automatic — so `mainstat` must be the **first** numeric one |
| `color`, `unit`, `min`, `max`, `decimals`       | real **field config** | automatic — the lowercased column name is a config handler  |
| anything else (`source`, `target`, `detail__*`) | `field.labels`        | automatic — the documented fall-through                     |
| `title`                                         | `config.displayName`  | needs one explicit mapping                                  |

Two rules that are easy to get wrong:

- **Add `Convert field type` first for `csv_content`.** CSV columns arrive as strings, and
  with no numeric column `rowsToFields` silently returns its input unchanged. This is the
  same `convertFieldType` step the part-to-whole long-format dashboards use.
- **Column order matters.** Auto-detection takes the _first_ string and _first_ numeric
  column. `source,target,id,mainstat` would name the output fields after `source` values.
  Reorder with `Organize fields`, or state the mapping explicitly.

**The natively-long sources need explicit mappings, not zero config.** Tempo, AWS X-Ray
and TestData emit `id` columns that are opaque row keys, not names. Measured against
TestData `node_graph` `response_small` (a saved X-Ray service map), zero-config
`Rows to fields` produces node fields called `0` … `16` with the service name demoted to a
`Name` label, and edge fields whose value comes from `secondarystat` because X-Ray's
`mainstat` is a **string** (`"Success 100.00%"`). The usable recipe there is four
mappings:

| Frame | Mapping                                                                                                        |
| ----- | -------------------------------------------------------------------------------------------------------------- |
| nodes | `title` → **Field name**, `secondarystat` → **Field value**                                                    |
| edges | `sourceName` / `targetName` left unmapped (they become the endpoint labels), `secondarystat` → **Field value** |

So the wide form is dramatically cheaper to source from Prometheus, Loki and SQL, and
modestly more fiddly from the datasources that already emit the long form natively.

The SQL from [Use case 3](#use-case-3--sql) needs no change at all — it already emits
`id` first and `mainstat` last, so adding one `Rows to fields` transformation converts it.
And because the pivot is a **user-added transformation**, it runs _before_
`applyFieldOverrides`, which is what makes the resulting per-edge fields overridable. A
panel doing the same reshaping internally could not: see
[../todo/graph-wide-migration.md](../todo/graph-wide-migration.md).

### JSON, Infinity and CSV — labels via Extract fields

A datasource that returns a JSON object per row — Infinity, JSON API, a SQL `json` column,
or a quoted CSV cell — reaches real labels without any datasource change:

```csv
id,meta,mainstat
e1,"{""source"":""a"",""target"":""b""}",10
e2,"{""source"":""a"",""target"":""b""}",20
```

| Step | Transformation                                  | Effect                                                                |
| ---- | ----------------------------------------------- | --------------------------------------------------------------------- |
| 1    | **Extract fields** — source `meta`, format JSON | adds `source` / `target` **columns**                                  |
| 2    | **Organize fields** — exclude `meta`            | drops the raw JSON column so it does not become a label itself        |
| 3    | **Convert field type** — `mainstat` → number    | as always, before `Rows to fields`                                    |
| 4    | **Rows to fields**                              | `id` → field name, `mainstat` → value, `source`/`target` → **labels** |

Verified end to end. This is the only route to **parallel edges** — two edges over the same
pair — because it keeps the ids distinct while the endpoints repeat, which a plain CSV header
cannot express. It works identically whether the column arrives as a `string` or as
`FieldType.other` (a real object), so no stringification is needed.

### Dense graphs — Grouping to matrix

For a dense topology, `Grouping to matrix` (Column = `target`, Row = `source`, Cell value
= `mainstat`) turns the legacy edges frame into an adjacency matrix: one field per target
node instead of one per edge, so the field count grows as N rather than N². Observed
specifics — the key column is named `source\target`, columns appear in first-appearance
order, and the frame is not square — are in the contract's
[adjacency matrix section](../data-plane/graph-wide.md#dense-graphs-the-adjacency-matrix-variant),
along with the trade-off: node overrides work, per-edge overrides do not, because an edge
is a cell.

### Per-node metadata from a second query

`Config from query results` sets `min`, `max`, `unit`, `decimals`, `displayName`, `color`
and one `thresholds` step — but its config frame is reduced to a **single row**, so every
field its `applyTo` matcher selects receives the _same_ config (observed: two node fields
both got `displayName: Gateway`). It is the wrong tool for per-node metadata. `Rows to
fields` is the per-row path.

## References

- Node graph frame format (legacy rows): [../data-plane/node-graph.md](../data-plane/node-graph.md)
- Field-based contract: [../data-plane/graph-wide.md](../data-plane/graph-wide.md)
- Rewrite plan: [../todo/graph-wide-migration.md](../todo/graph-wide-migration.md)
- Proposed panel: [../todo/node-graph.md](../todo/node-graph.md)
- Rows to fields:
  https://grafana.com/docs/grafana/latest/panels-visualizations/query-transform-data/transform-data/#rows-to-fields
- Grouping to matrix:
  https://grafana.com/docs/grafana/latest/panels-visualizations/query-transform-data/transform-data/#grouping-to-matrix
- ECharts series coverage and verdicts:
  [../data-plane/echarts-coverage.md](../data-plane/echarts-coverage.md)
- Grafana SQL Expressions docs:
  https://grafana.com/docs/grafana/latest/panels-visualizations/query-transform-data/
- SQL Expressions engine and allow-list (Grafana source):
  https://github.com/grafana/grafana/tree/main/pkg/expr/sql
- Tempo service graphs (`traces_service_graph_request_total`):
  https://grafana.com/docs/tempo/latest/metrics-generator/service_graphs/
- TestData `node_graph` generator:
  https://github.com/grafana/grafana/blob/main/public/app/plugins/datasource/grafana-testdata-datasource/nodeGraphUtils.ts
- Node graph panel Data API:
  https://grafana.com/docs/grafana/latest/panels-visualizations/visualizations/node-graph/#data-api
