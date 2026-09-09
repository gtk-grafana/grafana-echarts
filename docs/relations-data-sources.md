# Data sources for graph / flow / relations charts

Which Grafana data sources can produce data for the **graph / flow / relations**
chart family (ECharts `graph`, `sankey`, `chord`), and how to source or reshape the
ones that don't emit it natively.

The panel reads the field-based [`graph-*-wide` contract](../data-plane/graph-wide.md) —
one node is one field, one edge is one field. It still supports the row form specced in
[../data-plane/graph-long.md](../data-plane/graph-long.md), converting it automatically
above the panel; the panel's original design record is
[../todo/node-graph.md](../todo/node-graph.md). This doc is about **sourcing** the data,
which is the practical blocker either way: the family needs edges (and, optionally,
nodes), and the three data sources most Grafana users have — Prometheus, Loki and SQL —
emit neither shape natively.

> **Two source formats, one target.** [Sourcing the wide form](#sourcing-the-wide-form)
> below is the cheaper path for Prometheus, Loki and SQL — it needs no `id` column, no
> SQL Expressions and no instant-only restriction. [Sourcing the row
> form](#sourcing-the-row-form) covers the sources that still emit rows natively (Tempo,
> AWS X-Ray, TestData), hosts before Grafana **13.2**, or when you want row-shaped output
> so core's Node graph panel and this one can read the same query side by side.
>
> The panel converts a row-format response to the wide contract automatically, above the
> panel, so every recipe under "Sourcing the row form" still works unchanged even if you
> never read this doc's first half. That conversion needs Grafana **13.2 or later**
> ([grafana/grafana#129992](https://github.com/grafana/grafana/pull/129992)); on an older
> host the panel reports that it cannot read row frames, and the workaround is to add a
> **Rows to fields** transformation by hand, with the caveats in
> [SQL and CSV — Rows to fields](#sql-and-csv--rows-to-fields).
>
> **On 13.2+ the conversion cannot be got in front of.** It is registered as a pipeline
> _prefix_, so it runs before anything in the Transform tab. A transformation that consumes
> the row columns — `groupingToMatrix`, or a hand-added `rowsToFields` — therefore sees
> frames that are already wide and silently returns them unchanged. Measured on panel 17 of
> `provisioning/dashboards/relations/graph-wide.json`. Transformations that operate on the
> _wide_ frames still work normally, `joinByField` among them (see
> [Prometheus / Loki](#prometheus--loki--one-setting-and-one-transformation)).

## Sourcing the wide form

The [`graph-*-wide` contract](../data-plane/graph-wide.md) makes one node one **field**
and one edge one **field**. That changes the sourcing story more than it changes the
rendering story, because the shape it wants is the shape Prometheus, Loki and
`rowsToFields` already produce.

Every recipe below was run against Grafana 13.1.0; the observed outputs are recorded in
the contract's [Verified behaviours](../todo/graph-wide-history.md#verified-behaviours)
table, and the live panels are in
`provisioning/dashboards/relations/graph-wide.json`.

### Prometheus / Loki — one setting and one transformation

Same query as [Use case 1](#use-case-1--prometheus):

```promql
sum by (client, server) (rate(traces_service_graph_request_total[$__range]))
```

Then, in the query editor:

| Setting    | Value                     | Why                                                                  |
| ---------- | ------------------------- | -------------------------------------------------------------------- |
| **Format** | `Time series`             | One frame per series, i.e. one frame per edge                        |
| **Legend** | `{{client}}-->{{server}}` | The edge id and the override target — see below                      |
| **Type**   | Instant _or_ Range        | Either. A range query is simply a row dimension the reduce collapses |

**The whole topology draws with no transformation at all.** A `Time series` response is
_many_ frames — one per series, so one per edge — and the reader collects **every** frame
that looks like edges, so a nine-edge query draws nine edges. That is the contract's
[multi format](../data-plane/graph-multi.md), and it holds on a
stock host with no feature flags.

What you still need the legend format for is **identity**. Without one, every frame's value
field is called `Value`, so all nine marks share one name: `byName: 'Value'` matches all of
them at once, the override picker lists `Value` once per frame, and a per-edge unit, colour
or data link is unreachable. The plugin's own conversion
(`converters/longToWide.ts`) pivots the response above the panel and gives each edge the
legend format as its `field.name` — but it runs only where the host allows panel-registered
transformations (`grafana.panelPluginTransformations`), so a legend format is the portable
answer.

**A join is no longer required, and is usually the wrong tool.** For the record, what it
does: `joinByField` on `Time`

```json
{ "id": "joinByField", "options": { "byField": "Time", "mode": "outer" } }
```

collapses the frames into one, and `joinDataFrames` renames a field called `Value` to its
**frame name**, keeping its labels — so with a legend format the joined frame's field names
are the edge ids. Two caveats measured against live Mimir: a Prometheus range query sets no
frame name, so **without** a legend format the join produces a frame whose fields are all
still called `Value`; and a join cannot union two frames that are already wide, which the
reader can.

**Edges and nodes in one panel**, if you do join, need one join each filtered by refId, or
the second query's frames are swallowed into the first join:

```json
[
  {
    "id": "joinByField",
    "filter": { "id": "byRefId", "options": "A" },
    "options": { "byField": "Time", "mode": "outer" }
  },
  {
    "id": "joinByField",
    "filter": { "id": "byRefId", "options": "B" },
    "options": { "byField": "Time", "mode": "outer" }
  }
]
```

`refIdMatcher` is exact string equality for a plain pattern, unmatched frames are put
back by `postProcessTransform`, and `joinByField` stamps its output `refId` as
`joinByField-A-A-…` — so the second filter cannot re-capture the first join's result.
Both frames survive: A becomes the edges frame, B the nodes frame.

So: no SQL Expressions, no `id` column, no `CONCAT`, no instant-only restriction — and,
with the canonical label keys, zero reshaping.

**With non-canonical label keys the legend format is what carries the endpoints.** The
contract reads exactly two label keys, `source` and `target` (`endpointsOf`). A
`sum by (client, server)` emits `client` / `server`, which it does **not** recognise, so
the endpoints have to come from splitting the field name on `-->` — i.e. from the legend
format. Without one there is no separator to split on and the response is not a graph at
all. (With `source` / `target` the labels carry the endpoints and the legend format is
about identity only, as above.)

Relabel to `source` / `target` (`label_replace` in PromQL, `label_format` in LogQL) when
you want the labels to carry the endpoints instead. That is the only way to express an
id that is not `left-->right` — including two **parallel edges** over one pair, which
need distinct field names but identical endpoints.

The same applies to the Loki queries in [Use case 2](#use-case-2--loki): set
`{{service}}-->{{upstream}}` as the legend.

Worked examples of every variation above, against TestData fixtures that reproduce the
Prometheus and Loki frame shapes exactly:
`provisioning/dashboards/relations/observability-sources.json`.

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

Three rules that are easy to get wrong:

- **Add `Convert field type` first for `csv_content`.** CSV columns arrive as strings, and
  with no numeric column `rowsToFields` silently returns its input unchanged. This is the
  same `convertFieldType` step the part-to-whole long-format dashboards use. A frame that
  already has a numeric `mainstat` — as Tempo's and TestData's do — needs no such step.
- **Column order matters.** Auto-detection takes the _first_ string and _first_ numeric
  column. `source,target,id,mainstat` would name the output fields after `source` values.
  Reorder with `Organize fields`, or state the mapping explicitly.
- **Write mappings against the column's _display name_, not its name.**
  `evaluateFieldMappings` keys everything on `getFieldDisplayName(field, frame)`, and the
  natively-long producers set `config.displayName` on exactly the stat and arc columns. So
  the mapping for `mainstat` must say `Average response time` (Tempo) or
  `Transactions per second` (TestData) — never `mainstat`. **Getting this wrong is a silent
  no-op of the entire transformation**, not of the one mapping: a `Field value` mapping that
  matches nothing suppresses the auto-pick-first-numeric branch, `valueField` stays
  undefined, and `rowsToFields` returns the input frame untouched (measured — the returned
  object is identical to the input). The panel then receives a row-format frame — which it
  now reports rather than mis-rendering, though the message names the transformation, not
  the mapping that silently no-op'd. It also means a pivot recipe **is not portable between datasources**,
  because it is keyed on strings the datasource chose.

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

### What the pivot cannot carry, however it is configured

`Rows to fields` writes field config through `configMapHandlers`, a closed list of thirteen
handlers whose only targets are `max`, `min`, `unit`, `decimals`, `displayName`, `color`,
`thresholds` and `mappings`. **No handler writes `config.custom.*` and none writes
`config.links`.** So on a legacy node-graph frame:

| Column                                                           | Outcome                                                                     |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `color`                                                          | Real field config, automatically — a genuine bonus                          |
| `title`                                                          | `displayName`, with one mapping                                             |
| `source` / `target` / `detail__*`                                | `field.labels` — the conformant endpoint carrier                            |
| `subtitle`, `icon`, `noderadius`, `thickness`, `strokedasharray` | `field.labels`, **not** the `custom.*` the contract wants                   |
| `secondarystat`                                                  | `field.labels`, losing its type, unit and decimals                          |
| `arc__*`                                                         | `field.labels`, or a structurally invalid `thresholds` set if mapped        |
| the value column's own `unit` / `decimals` / `displayName`       | **discarded** — output config is built from row values, not from the column |
| `meta.preferredVisualisationType`, frame `name`                  | **discarded** — output is `{ fields, length, refId }` only                  |

The last two rows matter for more than fidelity: because `meta` does not survive, no
transformation can set `meta.type: 'graph-edges-wide'`, and a frame that carried no `refId`
comes out as the literal `rowsToFields-undefined` — so both pivoted frames share a refId and
can no longer be told apart by one.

**This is the reason the recipe below is a debugging aid rather than the shipping plan.** A
faithful conversion has to write `custom.*`, `links` and `meta`, which no core transformation
can, so it belongs in a `CustomTransformOperator` registered as a pipeline prefix — see
[../todo/adhoc-transformations-split.md](../todo/adhoc-transformations-split.md).

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
[adjacency matrix section](../data-plane/graph-matrix.md),
along with the trade-off: node overrides work, per-edge overrides do not, because an edge
is a cell.

### Per-node metadata from a second query

`Config from query results` sets `min`, `max`, `unit`, `decimals`, `displayName`, `color`
and one `thresholds` step — but its config frame is reduced to a **single row**, so every
field its `applyTo` matcher selects receives the _same_ config (observed: two node fields
both got `displayName: Gateway`). It is the wrong tool for per-node metadata. `Rows to
fields` is the per-row path.

## Sourcing the row form

Still the right choice for a source that emits rows natively (Tempo, AWS X-Ray, TestData),
for a host before Grafana 13.2, or when you want row-shaped output to run core's Node
graph panel and this one side by side off one query. The panel converts everything below
to the wide contract automatically, above the panel, on 13.2+.

### The short version

A relations chart needs **one row per edge**: a source, a target, and ideally a
weight. That is a `GROUP BY` over two dimensions. Any data source that can group by
two labels/columns can feed this family; it just needs the columns renamed to the
`source` / `target` / `mainstat` convention.

### What each source can do

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

#### TestData DB — the fixture source

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
  [throws in production on cyclic input](../data-plane/echarts-coverage.md#sankey-is-dag-only)),
  and a reason not to point a naive sankey at it.

### Use case 1 — Prometheus

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

### Use case 2 — Loki

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

### Use case 3 — SQL

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

### Reshaping with SQL Expressions

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

#### Two frames means two expressions

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

#### Cast numeric columns inside the SQL

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

#### Why this forces field-shape detection

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

### Aggregation is the hidden requirement

One caveat that catches people out: the **legacy row format** wants **one row per unique
edge**, not one row per event or per timestamp. (The wide form does not — a range query
is a row dimension there; see [Sourcing the wide form](#sourcing-the-wide-form).)

- Use **instant** queries in Prometheus and Loki, not range queries. A range query
  returns a time series per label pair, i.e. many rows per edge.
- If a range query is unavoidable, reduce it first — a `Reduce` expression or a
  `Group by` transformation collapses it to one row per series.
- In SQL, `GROUP BY` both endpoint columns.

A sankey given per-timestamp rows will either draw duplicate parallel ribbons or
collapse, depending on how duplicates are merged.

## References

- Node graph frame format (rows): [../data-plane/graph-long.md](../data-plane/graph-long.md)
- Field-based contract: [../data-plane/graph-wide.md](../data-plane/graph-wide.md)
- Rewrite plan: [../todo/graph-wide-migration.md](../todo/graph-wide-migration.md)
- Panel design record: [../todo/node-graph.md](../todo/node-graph.md)
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
