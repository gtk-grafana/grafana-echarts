# Data sources for relations charts

The relations family includes ECharts graph, sankey, and chord charts. Each chart needs edges and can also use declared nodes.

The panel reads the [ECharts graph-wide implementation](../data-plane/graph-wide.md). One node or edge is one numeric field. The generic shape is in the [proposed graph-wide specification](../data-plane/graph-wide-proposed.md). The panel can convert the [row contract](../data-plane/graph-long.md) before field overrides.

Use wide input for Prometheus, Loki, SQL, CSV, and JSON. Use row input for Tempo, AWS X-Ray, TestData DB, and compatibility with Grafana Node graph.

The automatic row conversion needs Grafana 13.2 or later and `grafana.panelPluginTransformations`. If the host cannot run it, add a Rows to fields transformation.

Grafana runs the automatic row conversion before the user transformations in the Transform tab. Thus, Rows to fields and Grouping to matrix receive wide frames and return them unchanged. If automatic conversion is active, do not add these row transformations. Transformations that consume wide frames still operate normally.

## Wide input

A wide response can contain:

- One frame with many numeric fields.
- Many frames with one numeric field each.
- Edge fields only. The panel derives missing nodes.

Each edge field needs endpoint labels. The panel recognizes these pairs:

- `source` and `target`
- `client` and `server`
- `src` and `dst`
- `from` and `to`

A field name identifies the mark for overrides, links, units, and color.

### Prometheus and Loki

Use a time-series query with one series per edge.

```promql
sum by (client, server) (rate(traces_service_graph_request_total[$__range]))
```

Set these query values:

| Setting | Value                     |
| ------- | ------------------------- |
| Format  | `Time series`             |
| Legend  | `{{client}}-->{{server}}` |
| Type    | Instant or Range          |

The panel reads every matching frame. A join is not required.

Set a unique legend because Prometheus often names every value field `Value`. Without a unique name, a `byName` override matches every edge.

The optional join below combines the frames on time:

```json
{ "id": "joinByField", "options": { "byField": "Time", "mode": "outer" } }
```

If one panel has separate edge and node queries, filter one join by each `refId`.

For other endpoint labels, copy them to `source` and `target`. Keep the original labels so tooltip filters use labels that the data source accepts.

```promql
sum by (source, target, client_k8s_cluster_name, server_k8s_cluster_name) (
  label_replace(
    label_replace(…, "source", "$1", "client_k8s_cluster_name", "(.*)"),
    "target", "$1", "server_k8s_cluster_name", "(.*)"
  )
)
```

Use the Source filter label and Target filter label overrides only when the query cannot keep the original labels.

### Multi-level flows

Combine each level into one query. Copy the labels for each level to the canonical pair.

```promql
sum by (source, target, cluster, namespace) (
  label_replace(
    label_replace(topk($topk, sum by (cluster, namespace) (…)), "source", "$1", "cluster", "(.*)"),
    "target", "$1", "namespace", "(.*)"
  )
)
  or
sum by (source, target, namespace, workload) (
  label_replace(
    label_replace(topk($topk, sum by (namespace, workload) (…)), "source", "$1", "namespace", "(.*)"),
    "target", "$1", "workload", "(.*)"
  )
)
```

Keep `cluster`, `namespace`, and `workload` in the outer groups. The tooltip can then filter each level with its original label.

<a id="sql-and-csv--rows-to-fields"></a>

### SQL and CSV

Use the Grafana Rows to fields transformation for table data. With `id,source,target,mainstat`, the automatic mapping is:

| Input column                              | Output                                         |
| ----------------------------------------- | ---------------------------------------------- |
| First string column                       | Field name                                     |
| First number column                       | Field value                                    |
| `color`, `unit`, `min`, `max`, `decimals` | Field configuration                            |
| `source`, `target`, and other columns     | Field labels                                   |
| `title`                                   | `config.displayName` after an explicit mapping |

Follow these rules:

1. If CSV values are strings, convert `mainstat` to a number first.
2. Put `id` before other string columns, or map the field name.
3. Put `mainstat` before other number columns, or map the field value.
4. Match a mapping against the displayed column name.

A Field value mapping that matches no column makes Rows to fields return the input unchanged.

Tempo, AWS X-Ray, and TestData DB need explicit mappings because their `id` values are row keys:

| Frame | Mapping                                               |
| ----- | ----------------------------------------------------- |
| Nodes | `title` to Field name, `secondarystat` to Field value |
| Edges | `secondarystat` to Field value                        |

Leave `sourceName` and `targetName` unmapped so they become labels.

<a id="what-the-pivot-cannot-carry-however-it-is-configured"></a>

Rows to fields cannot write `config.custom.*`, `config.links`, or frame metadata. It also drops the input frame name and some field configuration. Use the plugin conversion when full row compatibility is required.

### JSON objects and parallel edges

Extract endpoint values from a JSON column before Rows to fields.

```csv
id,meta,mainstat
e1,"{""source"":""a"",""target"":""b""}",10
e2,"{""source"":""a"",""target"":""b""}",20
```

Apply these transformations in order:

1. Extract fields from `meta` as JSON.
2. Remove `meta` with Organize fields.
3. Convert `mainstat` to a number.
4. Run Rows to fields.

Distinct `id` values preserve parallel edges between the same endpoints.

### Dense graphs

Grouping to matrix stores one field per target instead of one field per edge. This can reduce field count for dense graphs.

The matrix cannot support per-edge overrides because one edge is one cell. See the [matrix decision](../data-plane/graph-matrix.md).

Config from query results applies one reduced row to every matched field. It does not supply different configuration for each node. Use Rows to fields for per-node metadata.

## Row input

A row response contains one row per edge. Each row needs a source, a target, and usually a weight.

| Source      | Method                               | Native row frames |
| ----------- | ------------------------------------ | ----------------- |
| Tempo       | Service graph                        | Yes               |
| AWS X-Ray   | Service map                          | Yes               |
| TestData DB | `scenarioId: "node_graph"`           | Yes               |
| Prometheus  | Instant query with two labels        | No                |
| Loki        | Instant metric query with two labels | No                |
| SQL         | Edge table or two-column group       | No                |
| JSON APIs   | Reshape fields                       | No                |

TestData `response_small` and `response_medium` are stable fixtures. The `random` fixture does not make every value repeatable. It can also create cycles, which sankey removes.

### Prometheus

Run this as an instant query:

```promql
sum by (client, server) (rate(traces_service_graph_request_total[$__range]))
```

Rename `client` to `source`, `server` to `target`, and `Value` to `mainstat`.

### Loki

Use an instant metric query over structured logs:

```logql
sum by (service, upstream) (
  count_over_time({job="api"} | logfmt | __error__="" [$__range])
)
```

Rename `service` to `source`, `upstream` to `target`, and the value to `mainstat`. The `__error__=""` filter removes lines that the parser cannot read.

### SQL

Return the row contract directly:

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

A second query can return node metadata:

```sql
SELECT service AS id, service AS title, team AS subtitle
FROM services;
```

### SQL Expressions

SQL Expressions can rename Prometheus or Loki columns before frontend transformations. The `sqlExpressions` feature toggle enables them.

The expression engine uses MySQL syntax. An upstream `refId` is its table name.

For Prometheus query `A`:

```sql
SELECT CONCAT(client, '->', server) AS id,
       client                       AS source,
       server                       AS target,
       `Value`                      AS mainstat
FROM A
```

A nodes query is optional because the panel derives nodes from edge endpoints.

```sql
SELECT DISTINCT n.id AS id, n.id AS title
FROM (SELECT client AS id FROM A
      UNION
      SELECT server AS id FROM A) AS n
```

SQL Expressions run before frontend transformations. Cast text values inside the expression:

```sql
CAST(calls AS DECIMAL(20, 4)) AS mainstat
```

SQL Expression output has no graph metadata. The converter identifies edges by the `source` and `target` fields.

## Aggregation

Row input must contain one row per unique edge.

- Use instant Prometheus and Loki queries.
- Reduce a range query to one row per series.
- Group SQL by both endpoint columns.

Wide input can keep a time dimension because the panel reduces each field or reads one time-slider row.

## References

- [Proposed graph-wide specification](../data-plane/graph-wide-proposed.md)
- [ECharts graph-wide implementation](../data-plane/graph-wide.md)
- [Graph row contract](../data-plane/graph-long.md)
- [Graph multi-frame contract](../data-plane/graph-multi.md)
- [ECharts series coverage](../data-plane/echarts-coverage.md)
- [Grafana Rows to fields](https://grafana.com/docs/grafana/latest/panels-visualizations/query-transform-data/transform-data/#rows-to-fields)
- [Grafana Grouping to matrix](https://grafana.com/docs/grafana/latest/panels-visualizations/query-transform-data/transform-data/#grouping-to-matrix)
- [Grafana SQL Expressions](https://grafana.com/docs/grafana/latest/panels-visualizations/query-transform-data/)
- [Tempo service graphs](https://grafana.com/docs/tempo/latest/metrics-generator/service_graphs/)
- [Grafana Node graph data API](https://grafana.com/docs/grafana/latest/panels-visualizations/visualizations/node-graph/#data-api)
