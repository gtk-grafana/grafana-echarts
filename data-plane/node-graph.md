# Node graph — the legacy row format (`graph-*-long`)

A **node graph** visualizes elements (nodes) and the relationships between them
(edges). Grafana models it as a pair of column-oriented data frames: an **edges**
frame and an optional **nodes** frame, with **one row per node and one row per
edge**.

> **The spec for this format is [graph-long.md](./graph-long.md).** This doc is the
> plugin-facing companion: how the frames are detected, what the converter does with each
> column, and which of them survive the trip to ECharts. It stays supported — it is the
> format Tempo, AWS X-Ray and TestData emit natively, and it is published on the core Node
> graph panel's
> [Data API](https://grafana.com/docs/grafana/latest/panels-visualizations/visualizations/node-graph/#data-api).
>
> Read alongside it: **[graph-wide.md](./graph-wide.md)**, a field-based contract
> (`graph-nodes-wide` / `graph-edges-wide`) in which one node is one **field** and one
> edge is one **field**. That pivot exists because a row cannot be targeted by a Grafana
> field override, so nothing here — colour, unit, links, visibility — can be configured
> per node or per edge. Under the naming convention this format is retroactively
> `graph-*-long`: the nodes/edges pair is an ordinary **`numeric-long`** frame pair with
> reserved column names, where `source`/`target` are dimension columns and `mainstat` is
> the value column.

> **Not a data plane contract kind.** Unlike the other docs in this folder
> (Numeric, Heatmap, ...), node graph is **out of the Grafana data plane
> contract**. It carries no `frame.meta.type` — `DataFrameType` in `@grafana/data`
> 13.1.1 has twelve members and none is graph-related. Grafana identifies it through a
> separate routing signal (`frame.meta.preferredVisualisationType`) and field/
> frame naming conventions.
>
> The plugin consumes these frames through the **relations** family panel
> (`src/modules/relations/`), which renders them as an ECharts `graph`, `sankey` or
> `chord` series selected per panel. The converter is
> `frameToNodeGraph` (`src/lib/echarts/converters/nodeGraph.ts`) and the editor
> options are tracked in
> [../src/modules/relations/parity.md](../src/modules/relations/parity.md). See
> [../docs/relations-data-sources.md](../docs/relations-data-sources.md) for which
> data sources can produce this shape and how to reshape the ones that cannot, and
> [../todo/node-graph.md](../todo/node-graph.md) for the remaining variants.

Field names below come from Grafana's `NodeGraphDataFrameFieldNames` enum
(`packages/grafana-data/src/utils/nodeGraph.ts`) and the node graph
[panel Data API](https://grafana.com/docs/grafana/latest/panels-visualizations/visualizations/node-graph/#data-api).
All field names are **lowercase**.

## Detection

Grafana selects candidate frames in `getNodeGraphDataFrames`
(`public/app/plugins/panel/nodeGraph/utils.ts`, linked under
[References](#references)) — a frame qualifies when **any** of the following hold:

- `frame.meta.preferredVisualisationType === 'nodeGraph'`, or
- the frame `name` **or** `refId` is `nodes` or `edges`, or
- the frame contains a field named `id`.

The third test is **deliberately broad and is a false-positive risk**: any table
with an `id` column qualifies, whether or not it describes a graph. Grafana gets
away with it because the check only runs once the user has already chosen the node
graph panel. A plugin that wants to _auto-detect_ node-graph data cannot rely on it
— it needs the stricter field-shape rule in [Frame roles](#frame-roles) below (an
edges frame must also carry `source` **and** `target`).

At minimum a node graph requires the **edges** frame; Grafana computes the nodes
and their stats from the edges when no nodes frame is supplied. A **nodes** frame
is added when node-specific metadata (titles, stats, colors, ...) is needed.

## Frame roles

Detection selects the frames; it does not say which is which. Grafana resolves the
role in `applyOptionsToFrames` (same file) with a single test, quoting its own
comment — _"Edges frame has source which can be used to identify nodes vs edges
frames"_:

| Test                       | Role      |
| -------------------------- | --------- |
| frame has a `source` field | **edges** |
| otherwise                  | **nodes** |

So the role is decided by the presence of `source` alone, and the fallback is
`nodes` — an unrecognised frame that slipped through detection is treated as a
nodes frame, not rejected. Field names are matched **lowercased**.

This matters for any consumer that cannot rely on frame naming. Both provisioned
TestData `csv_content` fixtures and Grafana **SQL Expression** outputs are named by
`refId` (`A`, `B`, `C`), never `nodes`/`edges`, and neither can set
`meta.preferredVisualisationType` — so field shape is the only signal that survives.
See [../docs/relations-data-sources.md](../docs/relations-data-sources.md).

## Edges frame

One row per relationship (edge).

### Required fields

| Field name | Type   | Description                    |
| ---------- | ------ | ------------------------------ |
| `id`       | string | Unique identifier of the edge. |
| `source`   | string | `id` of the source node.       |
| `target`   | string | `id` of the target node.       |

### Optional fields

| Field name        | Type          | Description                                                                                                                   |
| ----------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `mainstat`        | string/number | First stat shown when hovering the edge. A string is shown as-is; a number also shows its field unit.                         |
| `secondarystat`   | string/number | Same as `mainstat`, shown right under it.                                                                                     |
| `detail__*`       | string/number | Any field prefixed `detail__` is shown in the edge's context menu header. Use `config.displayName` for a readable label.      |
| `thickness`       | number        | Thickness of the edge. Default `1`.                                                                                           |
| `color`           | string        | Default edge color. Any valid HTML color string. Default `#999`.                                                              |
| `strokedasharray` | string        | SVG `stroke-dasharray` pattern of dashes and gaps. Unset renders a solid line.                                                |
| `highlighted`     | boolean       | Whether the edge is highlighted. Default `false`. **Deprecated** (since Grafana 10.5) — use `color` to indicate highlighting. |

## Nodes frame

One row per node. Optional overall — supply it only when nodes need metadata
beyond what the edges frame implies.

### Required fields

| Field name | Type   | Description                                                            |
| ---------- | ------ | ---------------------------------------------------------------------- |
| `id`       | string | Unique node identifier, referenced by an edge's `source` and `target`. |

### Optional fields

| Field name       | Type          | Description                                                                                                                                                                                 |
| ---------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `title`          | string        | Name shown just under the node.                                                                                                                                                             |
| `subtitle`       | string        | Additional name/type/identifier shown under the title.                                                                                                                                      |
| `mainstat`       | string/number | First stat shown inside the node. String as-is; number also shows its field unit.                                                                                                           |
| `secondarystat`  | string/number | Same as `mainstat`, shown under it inside the node.                                                                                                                                         |
| `arc__*`         | number        | Any field prefixed `arc__` defines a section of the colored circle (border) around the node. Values across all `arc__*` fields should add up to 1. Color via `config.color.fixedColor`.     |
| `detail__*`      | string/number | Any field prefixed `detail__` is shown in the node's context menu header. Use `config.displayName` for a readable label.                                                                    |
| `color`          | string/number | A single color instead of `arc__*` sections. A string is an HTML color; a number is interpreted per `field.config.color.mode` (e.g. gradient by value). Must not be combined with `arc__*`. |
| `icon`           | string        | Name of a built-in Grafana icon to show inside the node instead of the default stats.                                                                                                       |
| `noderadius`     | number        | Node radius in pixels. Controls node size.                                                                                                                                                  |
| `highlighted`    | boolean       | Whether the node is highlighted. Default `false`.                                                                                                                                           |
| `fixedx`         | number        | Fixed x-coordinate for the node. If used, **all** nodes must provide a value.                                                                                                               |
| `fixedy`         | number        | Fixed y-coordinate for the node. If used, **all** nodes must provide a value.                                                                                                               |
| `isinstrumented` | boolean       | Whether the node is instrumented.                                                                                                                                                           |

## ECharts data specification

Pinned to **ECharts 6.1.0** (`package.json`); every claim below was checked against
that release's source, not against memory.

Three series consume this frame pair, and they take **identical input**.
`getInitialData` in `GraphSeries.ts`, `SankeySeries.ts` and `ChordSeries.ts` all read
the same two keys with the same precedence, then build the graph with the shared
`createGraphFromNodeEdge` helper:

```javascript
const edges = option.edges || option.links || [];
const nodes = option.data || option.nodes || [];
```

So one `{ nodes, links }` model feeds all three, and switching between them is a
layout change rather than a data change.

| Series   | Coordinate system         | Topology accepted        | Link `value` |
| -------- | ------------------------- | ------------------------ | ------------ |
| `graph`  | own `View` (self-created) | any digraph, cycles fine | optional     |
| `sankey` | self-layout (`box`)       | **DAG only**             | **required** |
| `chord`  | pinned `'none'`           | any digraph, cycles fine | required     |

`sankey` sizes each ribbon from `edge.getValue()` (`edgeDy = +edge.getValue() * minKy`
in `sankeyLayout.ts`), so a link without a numeric value collapses to zero height.
`graph` uses link values only for tooltips and `visualMap`; edge thickness comes from
`lineStyle.width`.

All four Group 8 series are **hand-built only** — `getInitialData` reads
`option.data`/`nodes`/`links` literally and never goes through `getSource()`, so an
ECharts `dataset` is invisible to them. A converter must emit arrays. See
[echarts-coverage.md](./echarts-coverage.md).

### `series.lines` is not fed by this frame pair

`lines` is the fourth member of ECharts' relationship group, but it does **not**
consume nodes/edges. `series.lines.data` is a list of polylines,
`[{ coords: [[x1, y1], [x2, y2], ...] }, ...]` — explicit coordinate pairs, not node
references. No Grafana frame kind carries those, which is why
[echarts-coverage.md](./echarts-coverage.md) gives it the verdict _no Grafana
source_. Positioned nodes (`fixedx`/`fixedy`) plus a `graph` series with
`layout: 'none'` cover the same ground without inventing a frame convention, so
`lines` is deferred — see the `lines` row in
[echarts-coverage.md](./echarts-coverage.md) and the rationale in
[../todo/node-graph.md](../todo/node-graph.md).

## How a frame is read

`frameToNodeGraph` (`src/lib/echarts/converters/nodeGraph.ts`) returns a
chart-agnostic `{ nodes, links }` model. The **edges** frame is required; the
**nodes** frame only adds metadata.

| Grafana field                                | Used as                                                                                             |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| edge `id`                                    | Link id; synthesised as `<source>--<target>` when absent                                            |
| edge `source` / `target`                     | Link endpoints, matched against node `id`. A row missing either is **dropped**                      |
| edge `mainstat`                              | Link weight, when numeric — else `thickness`, else `1`                                              |
| edge `thickness`                             | `lineStyle.width` (and the weight fallback)                                                         |
| edge `color`                                 | `lineStyle.color`                                                                                   |
| edge `strokedasharray`                       | `lineStyle.type`, approximated to `dotted` (leading dash ≤ 2) or `dashed`                           |
| node `id`                                    | ECharts node key, so links resolve against it                                                       |
| node `title`                                 | `name` — the label text; falls back to `id`                                                         |
| node `mainstat`                              | `value`, driving by-value color and the tooltip                                                     |
| node `subtitle`                              | Tooltip row                                                                                         |
| node `secondarystat`                         | Tooltip row; kept as a string when it is one                                                        |
| node `noderadius`                            | `symbolSize`, overriding the panel-level node size                                                  |
| node `color`                                 | `itemStyle.color` when it is an HTML **string**; a numeric value defers to the field's Color scheme |
| node `fixedx` / `fixedy`                     | `x`/`y`; selects `layout: 'none'` when **every** node supplies both                                 |
| `arc__*`, `icon`, `detail__*`, `highlighted` | Not rendered — see the pitfalls below                                                               |

Field names are matched **lowercased**. Frames are assumed square.

**Edges-only responses** derive the node set from the union of `source`/`target`, with
each node's `value` set to its degree — the only stat available without a nodes frame.
Endpoints referenced by an edge but missing from the nodes frame are appended for the
same reason: ECharts' `addEdge` silently fails on an unknown endpoint, so the edge
would otherwise vanish.

`frameToNodeGraph` returns `null` when there is no edges frame or no usable link,
letting callers fall back to a no-data view.

### What each render variant reads

The converter is variant-agnostic; the options layer decides what a given series can
express. Fields the **sankey** variant cannot use:

| Field                    | Sankey                                                                |
| ------------------------ | --------------------------------------------------------------------- |
| edge `thickness`         | Not applied — ribbon size _is_ the weight. Still the weight fallback. |
| edge `strokedasharray`   | Not applied — a ribbon is a filled area, not a stroked line           |
| node `noderadius`        | Not applied — node thickness is the series-level `nodeWidth`          |
| node `fixedx` / `fixedy` | Not applied — a sankey positions with `localX`/`localY`/`depth`       |
| node `mainstat`          | Tooltip only, **not** the item `value` — see the pitfall below        |

The sankey path additionally rewrites the link set to satisfy the DAG restriction
(`converters/dag.ts`): self-loops dropped, duplicate pairs merged with summed weights,
back-edges dropped by a deterministic traversal. So a sankey over cyclic frames
legitimately draws fewer links than the same frames as a `graph`, and the panel notes
how many.

## Pitfalls for a converter

Traps inherent to the data or to ECharts rather than to any particular
implementation. The first four are why the `sankey` variant is more than a layout
swap; each is handled, with the handling named.

- **A sankey built from a real service graph crashes the panel.** `sankeyLayout.ts`
  runs Kahn's algorithm and then
  `throw new Error('Sankey is a DAG, the original data has cycle!')`. That throw is
  **not** behind a `__DEV__` guard, so it survives into production builds. Service
  graphs routinely contain cycles (retries, bidirectional RPC, A→B→A call chains),
  and the TestData `node_graph` scenario generates them on purpose — its
  `generateRandomNodes` has a loop commented _"Add some random edges to create
  possible cycle"_. Cycles must therefore be broken **before** the links reach
  ECharts. `graph` and `chord` are unaffected. **Handled** in `converters/dag.ts`.
- **Self-loops.** An edge whose `source === target` has no sankey representation and
  must be dropped there. `graph` renders them fine, so only the sankey path drops
  them (`converters/dag.ts`).
- **A sankey node's declared `value` is a floor, not a label.** `computeNodeValues`
  takes `Math.max(inSum, outSum, nodeRawValue)`, so passing `mainstat` as the item's
  `value` inflates the node past its own ribbons whenever the stat is not itself a
  flow — a latency or an error rate would silently distort the layout. The sankey
  path therefore omits `value` and carries `mainstat` separately for the tooltip.
  `graph` reads item values only for tooltips and `visualMap`, never geometry, so it
  is unaffected.
- **A sankey labels from the node _key_, not its name.** `SankeyView` passes
  `defaultText: node.id`, where `id` is whatever `createGraphFromNodeEdge`'s
  `retrieve(id, name, dataIndex)` resolved to — the frame's `id` field, since links
  must resolve against it. A nodes frame's human-readable `title` would therefore
  never reach the label without an explicit `label.formatter: '{b}'`. `graph` labels
  from `data.getName(idx)` (`Symbol.js`) and needs no correction.
- **`mainstat` may be a string,** so it cannot be coerced for anything geometric.
  `frameToNodeGraph` resolves link weight through `mainstat` → `thickness` → `1`;
  sankey and chord size their ribbons from that number and would otherwise collapse.
- **`arc__*` proportions are lost.** None of the four series can draw a
  multi-section ring around a node, so the converter approximates it with a single
  border in the **dominant** section's color (`resolveArcBorderColor`). A faithful
  version needs a `custom` series or a composed pie symbol.
- **`icon` is dropped.** The values are Grafana built-in icon names and need
  resolving before they could become an ECharts `symbol`.
- **`detail__*` is dropped.** Grafana renders it in a node/edge context menu; ECharts
  has no such surface, so it could only fold into tooltip content.
- **`highlighted` is dropped** — deprecated for edges since Grafana 10.5; use `color`.
- **Edges-only responses are legal**, and handled: Grafana derives the node set and
  its stats from `source`/`target` when no nodes frame is present, so a converter
  that required both frames would render nothing for a valid response.
- **Nothing here is configurable per node or per edge.** A mark is a row, and Grafana's
  override matcher is `(field, frame, allFrames) => boolean`, so `byName` has nothing to
  bind to: the picker on a relations panel lists exactly `id, source, target, mainstat`
  however many nodes and edges the response contains. Colour, unit, decimals, data links
  and visibility are therefore all-marks-or-none, and `field.state.range` — the by-value
  colour domain — is the min/max across `mainstat`, `secondarystat`, `noderadius`,
  `arc__*` and `fixedx`/`fixedy` together (measured: a frame with `mainstat` 8–12 and
  `noderadius` 40–60 gives every field `{min: 0.5, max: 60}`). This is inherent to the
  row shape, not a converter bug; [graph-wide.md](./graph-wide.md) is the response to it.

## Example

**Nodes**

| id    | title | subtitle | mainstat | secondarystat | color | icon | highlighted |
| ----- | ----- | -------- | -------- | ------------- | ----- | ---- | ----------- |
| node1 | PC    | Windows  | AMD      | 16gbRAM       | blue  |      | true        |
| node2 | PC    | Linux    | Intel    | 32gbRAM       | green | eye  | false       |
| node3 | Mac   | MacOS    | M3       | 16gbRAM       | gray  | apps | false       |

**Edges**

| id    | source | target | mainstat | secondarystat | thickness | color  |
| ----- | ------ | ------ | -------- | ------------- | --------- | ------ |
| edge1 | node1  | node2  | TheMain  | TheSub        | 3         | cyan   |
| edge2 | node3  | node2  | Main2    | Sub2          | 1         | orange |

A node with no edge connection is drawn on its own, outside the network.

The same pair as `toDataFrame` partials (the shape used in unit tests):

```typescript
import { FieldType, toDataFrame } from '@grafana/data';

const nodes = toDataFrame({
  name: 'nodes',
  refId: 'nodes',
  meta: { preferredVisualisationType: 'nodeGraph' },
  fields: [
    { name: 'id', type: FieldType.string, values: ['node1', 'node2', 'node3'] },
    { name: 'title', type: FieldType.string, values: ['PC', 'PC', 'Mac'] },
    { name: 'subtitle', type: FieldType.string, values: ['Windows', 'Linux', 'MacOS'] },
    { name: 'mainstat', type: FieldType.string, values: ['AMD', 'Intel', 'M3'] },
    { name: 'secondarystat', type: FieldType.string, values: ['16gbRAM', '32gbRAM', '16gbRAM'] },
    { name: 'color', type: FieldType.string, values: ['blue', 'green', 'gray'] },
    { name: 'icon', type: FieldType.string, values: ['', 'eye', 'apps'] },
    { name: 'highlighted', type: FieldType.boolean, values: [true, false, false] },
  ],
});

const edges = toDataFrame({
  name: 'edges',
  refId: 'edges',
  meta: { preferredVisualisationType: 'nodeGraph' },
  fields: [
    { name: 'id', type: FieldType.string, values: ['edge1', 'edge2'] },
    { name: 'source', type: FieldType.string, values: ['node1', 'node3'] },
    { name: 'target', type: FieldType.string, values: ['node2', 'node2'] },
    { name: 'mainstat', type: FieldType.string, values: ['TheMain', 'Main2'] },
    { name: 'secondarystat', type: FieldType.string, values: ['TheSub', 'Sub2'] },
    { name: 'thickness', type: FieldType.number, values: [3, 1] },
    { name: 'color', type: FieldType.string, values: ['cyan', 'orange'] },
  ],
});
```

`arc__*` and `detail__*` fields carry a suffix and per-field config, e.g. a node
frame with two arc sections that sum to 1 and a labelled detail column:

```typescript
const nodesWithArcs = toDataFrame({
  name: 'nodes',
  refId: 'nodes',
  meta: { preferredVisualisationType: 'nodeGraph' },
  fields: [
    { name: 'id', type: FieldType.string, values: ['node1'] },
    { name: 'title', type: FieldType.string, values: ['gateway'] },
    { name: 'arc__success', type: FieldType.number, values: [0.9], config: { color: { fixedColor: 'green' } } },
    { name: 'arc__errors', type: FieldType.number, values: [0.1], config: { color: { fixedColor: 'red' } } },
    { name: 'detail__zone', type: FieldType.string, values: ['us-east-1'], config: { displayName: 'Zone' } },
  ],
});
```

## References

- The spec for this format: [graph-long.md](./graph-long.md)
- The field-based alternative: [graph-wide.md](./graph-wide.md), and its rewrite plan
  [../todo/graph-wide-migration.md](../todo/graph-wide-migration.md)
- Node graph panel Data API:
  https://grafana.com/docs/grafana/latest/panels-visualizations/visualizations/node-graph/#data-api
- Field-name enum `NodeGraphDataFrameFieldNames`:
  https://github.com/grafana/grafana/blob/main/packages/grafana-data/src/utils/nodeGraph.ts
- `preferredVisualisationType` enum (`grafana-data/src/types/data.ts`):
  https://github.com/grafana/grafana/blob/main/packages/grafana-data/src/types/data.ts
- Frame detection (`getNodeGraphDataFrames`) and nodes-vs-edges role
  (`applyOptionsToFrames`):
  https://github.com/grafana/grafana/blob/main/public/app/plugins/panel/nodeGraph/utils.ts
- TestData `node_graph` generator (deliberately introduces cycles):
  https://github.com/grafana/grafana/blob/main/public/app/plugins/datasource/grafana-testdata-datasource/nodeGraphUtils.ts
- ECharts `series.graph`: https://echarts.apache.org/en/option.html#series-graph
- ECharts `series.sankey`: https://echarts.apache.org/en/option.html#series-sankey
- ECharts `series.chord` (added in 6.0.0):
  https://github.com/apache/echarts-doc/blob/master/en/option/series/chord.md
- ECharts `series.lines`: https://echarts.apache.org/en/option.html#series-lines
- Shared node/edge data path (`option.edges || option.links`):
  https://github.com/apache/echarts/blob/6.1.0/src/chart/graph/GraphSeries.ts
- Sankey DAG check — the unguarded production throw:
  https://github.com/apache/echarts/blob/6.1.0/src/chart/sankey/sankeyLayout.ts
