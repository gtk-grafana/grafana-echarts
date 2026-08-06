# Graph, adjacency matrix — proposed and rejected

An edges format in which **one field is one node and one cell is one edge**: a leading
`string` field keys the rows with source-node ids, every numeric field is a target node, and
the cell at (row, column) is the edge between them. An absent cell means **no edge**, not a
weight of zero.

Six edges over three nodes:

```csv
source,a,b,c
a,,10,20
b,30,,40
c,50,60,
```

| source | `a` | `b` | `c` |
| ------ | --- | --- | --- |
| a      |     | 10  | 20  |
| b      | 30  |     | 40  |
| c      | 50  | 60  |     |

Four fields and three rows, where [`graph-edges-wide`](./graph-wide.md) needs six fields and
`graph-edges-long` needs four fields and six rows. The field count grows as N rather than
|E|, which is why it was considered: a dense 100-node graph is 101 fields instead of 9 900.

## Why it was rejected

- **Nothing consumes it.** No panel in core or in this plugin reads a matrix frame as a
  graph. The layout itself is not hypothetical — core's **Grouping to matrix** produces it,
  and this plugin's [matrix heatmap](./heatmap-matrix.md) already consumes exactly this
  shape — but the graph _interpretation_ has no reader, so adopting it would mean
  specifying a format nobody could use.
- **No per-mark field overrides for edges,** which is the entire reason the wide format
  exists. A column is a node, so `displayName`, `links` and a fixed colour land on the
  node; every value-driven property resolves per cell and therefore per edge, but a fixed
  style for one _named_ edge is unreachable, because no field names one.
- **It cannot be shape-detected.** A key `string` field followed by numeric fields is
  byte-for-byte an ordinary `numeric-wide` table, and byte-for-byte what the matrix heatmap
  already claims. A matrix graph frame would have to be selected by `meta.type` or an
  explicit panel option, never inferred — so it could never be a peer of the wide format,
  only an opt-in alternative.
- **It cannot coexist with a nodes frame.** `groupingToMatrix` opens with
  `if (data.length !== 1) { return data; }`, so on any multi-frame response it silently
  returns its input unchanged. Grafana has no per-query transformations, which strands
  exactly the datasources that emit graph data natively — Tempo, AWS X-Ray and TestData all
  return nodes and edges together.

Full reasoning, including the measurements behind the density argument, is in
[../src/modules/relations/node-wide-history.md](../src/modules/relations/node-wide-history.md).
