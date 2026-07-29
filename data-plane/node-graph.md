# Node graph

A **node graph** visualizes elements (nodes) and the relationships between them
(edges). Grafana models it as a pair of column-oriented data frames: an **edges**
frame and an optional **nodes** frame.

> **Not a data plane contract kind.** Unlike the other docs in this folder
> (Numeric, Heatmap, ...), node graph is **out of the Grafana data plane
> contract**. It carries no `frame.meta.type`. Grafana identifies it through a
> separate routing signal (`frame.meta.preferredVisualisationType`) and field/
> frame naming conventions. This doc documents the **input frame format** Grafana
> expects; the plugin does **not** consume these frames yet (see
> [../todo/node-graph.md](../todo/node-graph.md) for the proposed panel, and
> [../docs/relations-data-sources.md](../docs/relations-data-sources.md) for which
> data sources can produce this shape and how to reshape the ones that cannot).

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

## Pitfalls for a converter

No converter ships yet; these are the traps a future one has to handle, recorded here
because each is a property of the data or of ECharts rather than of the code.

- **A sankey built from a real service graph crashes the panel.** `sankeyLayout.ts`
  runs Kahn's algorithm and then
  `throw new Error('Sankey is a DAG, the original data has cycle!')`. That throw is
  **not** behind a `__DEV__` guard, so it survives into production builds. Service
  graphs routinely contain cycles (retries, bidirectional RPC, A→B→A call chains),
  and the TestData `node_graph` scenario generates them on purpose — its
  `generateRandomNodes` has a loop commented _"Add some random edges to create
  possible cycle"_. Cycles must therefore be broken **before** the links reach
  ECharts. `graph` and `chord` are unaffected.
- **Self-loops.** An edge whose `source === target` has no sankey representation and
  must be dropped there.
- **No link weight.** `mainstat` is optional and may be a string. A sankey/chord
  converter needs a numeric fallback chain (`mainstat` → `thickness` → a constant)
  or every ribbon collapses.
- **`arc__*` has no native equivalent.** None of the four series can draw a
  multi-section ring around a node. Approximating with a single border color loses
  the proportions; a faithful version needs a `custom` series or a composed pie
  symbol.
- **`icon` is not a symbol name.** The values are Grafana built-in icon names and
  need resolving before they can become an ECharts `symbol`.
- **`detail__*` has nowhere to go.** Grafana renders it in a node/edge context menu;
  ECharts has no such surface, so it can only fold into tooltip content.
- **`highlighted` is deprecated** for edges since Grafana 10.5 — prefer `color`.
- **Edges-only responses are legal.** Grafana derives the node set and its stats from
  `source`/`target` when no nodes frame is present; a converter has to do the same or
  it will render nothing for a valid response.

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
