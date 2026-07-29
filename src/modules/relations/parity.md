# Relations (graph) editor option parity

Compares the editor options of this ECharts **Relations** module
([module.tsx](./module.tsx)) against core Grafana's **Node graph** panel
([`public/app/plugins/panel/nodeGraph/module.tsx`](https://github.com/grafana/grafana/blob/main/public/app/plugins/panel/nodeGraph/module.tsx),
options in
[`panelcfg.cue`](https://github.com/grafana/grafana/blob/main/public/app/plugins/panel/nodeGraph/panelcfg.cue)).

Both consume the same input: Grafana's node-graph frame pair. See
[data-plane/node-graph.md](../../../data-plane/node-graph.md) for the field spec and
[docs/relations-data-sources.md](../../../docs/relations-data-sources.md) for which
data sources can produce it.

## Design difference

Core's Node graph is a bespoke SVG renderer with a deliberately tiny option surface —
almost everything (colors, node size, arcs, stats) is driven from the **data**, and
the panel exposes only a layout algorithm, a zoom mode, and unit overrides. It also
ships two things this panel does not have at all: a node/edge **context menu** (where
`detail__*` fields surface) and a **grid/layered** layout.

This module renders through the ECharts `graph` series, which brings the opposite
trade-off: no context menu and no layered layout, but a much richer styling surface
(force tuning, edge arrows, curveness, adjacency emphasis, link color modes). Those
extras are all **ECharts-only** and gated behind Advanced editor mode, so the Default
tier stays close to core's small surface. See
[docs/options-modes.md](../../../docs/options-modes.md).

The family is named `relations` rather than `graph` because `graph` collides with both
the `graph` `SeriesType` value and Grafana's legacy "Graph" panel name. `sankey` and
`chord` are planned variants of this same panel — all three ECharts series read the
identical node/link model — so they will appear as a "Chart type" picker rather than
as separate panels.

## Panel options

| Core Grafana option                   | ECharts equivalent                                                    | Status                      |
| ------------------------------------- | --------------------------------------------------------------------- | --------------------------- |
| Layout algorithm (Layered/Force/Grid) | "Layout" (Force / Circular / Fixed) — `series.graph.layout`           | Partial / different set     |
| Zoom mode (Cooperative/Greedy)        | "Zoom and pan" switch — `series.graph.roam` (Advanced)                | Partial                     |
| Nodes: main stat unit                 | standard **Unit** on the `mainstat` field                             | Supported (different route) |
| Nodes: secondary stat unit            | standard **Unit** on the `secondarystat` field                        | Partial                     |
| Nodes: arcs (`arc__*` field/color)    | approximated — see [Notes / gaps](#notes--gaps)                       | Not supported\*             |
| Edges: main stat unit                 | standard **Unit** on the edges `mainstat` field                       | Supported (different route) |
| Edges: secondary stat unit            | _not read_                                                            | Not supported\*             |
| Node/edge context menu (`detail__*`)  | tooltip content only                                                  | Not supported\*             |
| —                                     | "Show node labels" — `series.graph.label.show`                        | ECharts-only                |
| —                                     | "Node size" — `series.graph.symbolSize`                               | ECharts-only                |
| —                                     | "Draggable nodes" — `series.graph.draggable` (Advanced)               | ECharts-only                |
| —                                     | Repulsion / Edge length / Gravity — `series.graph.force.*` (Advanced) | ECharts-only                |
| —                                     | "Edge arrows" — `series.graph.edgeSymbol` (Advanced)                  | ECharts-only                |
| —                                     | "Link curveness" — `lineStyle.curveness` (Advanced)                   | ECharts-only                |
| —                                     | "Highlight adjacency" — `emphasis.focus` (Advanced)                   | ECharts-only                |
| —                                     | "Link color" (Source/Target/Gradient) — `lineStyle.color` (Advanced)  | ECharts-only                |
| —                                     | Grafana legend (`addLegendOptions`)                                   | ECharts-only                |
| —                                     | Tooltip mode (Single/Hidden)                                          | ECharts-only                |
| —                                     | Animation — `animation.enabled` (Advanced)                            | ECharts-only                |

**Layout differs rather than matching.** Core offers Layered / Force / Grid; ECharts'
`graph` offers `force` / `circular` / `none`. **Force** is common to both. Core's
**Layered** (a hierarchical DAG layout) and **Grid** have no ECharts `graph`
equivalent, and ECharts' **Circular** has no core equivalent. `none` ("Fixed") is
richer than anything core exposes — it honors the `fixedx`/`fixedy` fields, and is
selected automatically when every node supplies them.

## Standard (field-config) options

Keeps the full standard field-config set (Color, Unit, Decimals, Min, Max, Display
name, No value, Thresholds, Value mappings, Data links), customizing only Color
(PaletteClassic, byValue + bySeries). Core's Node graph keeps the full set too, but
routes stat units through its own panel options rather than the standard Unit.

| Option         | Meaningful here? | Notes                                                                                                                                                                                                   |
| -------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Color scheme   | **Yes**          | The load-bearing one. Three tiers: byName fixed-color override → the node's own `color` field → the `mainstat` field's by-value scheme → classic palette by position. See `makeRelationsColorResolver`. |
| Unit           | **Yes**          | Formats `mainstat` / `secondarystat` / link weight in the tooltip.                                                                                                                                      |
| Decimals       | **Yes**          | Same path as Unit.                                                                                                                                                                                      |
| Value mappings | **Yes**          | Applied through the field's display processor.                                                                                                                                                          |
| Data links     | **Yes**          | The pinned tooltip footer resolves a hovered node back to its nodes-frame row, and a hovered link to its edges-frame row. Nodes _derived_ from the edges frame carry no row, so they show no footer.    |
| Min / Max      | Marginal         | Only bounds the by-value color domain.                                                                                                                                                                  |
| No value       | Marginal         | A null `mainstat` renders a node with no stat.                                                                                                                                                          |
| Thresholds     | Marginal         | Reachable only as a by-value color scheme; there is no `markLine` equivalent because there are no axes.                                                                                                 |
| Display name   | **Inert**        | Node and link names come from frame _rows_ (`title` / `id`), not from field names — the same limitation pie and candlestick have.                                                                       |

Not registered, deliberately:

- **`reduceOptions`** (`addStandardDataReduceOptions`) — rows _are_ the entities, so
  there is nothing to reduce. Unlike part-to-whole, this family never calls it.
- **Legend calcs** — `includeLegendCalcs: false`, since legend entries are nodes, not
  fields, so there are no series values to reduce.
- **`custom.hideFrom`** (`commonOptionsBuilder.addHideFrom`) — see the gap below.

Two structural limits apply here as they do everywhere else in this plugin (see
[heatmap/parity.md](../heatmap/parity.md)): standard options **cannot be
conditionally hidden**, and **cannot be regrouped** — `StandardOptionConfig` in
`@grafana/data` exposes only `defaultValue`, `settings` and `hideFromDefaults`, with
no `category`.

## Notes / gaps

- **`arc__*` is approximated, not rendered.** No ECharts relationship series can draw
  a multi-section ring around a node. Core's Node graph draws proportional arc
  segments; this panel does not, and the proportions are lost. A faithful version
  needs a `custom` series or a composed pie symbol. Tracked in
  [data-plane/node-graph.md](../../../data-plane/node-graph.md).
- **`icon` is dropped.** The values are Grafana built-in icon names and need resolving
  to an ECharts `symbol` before they could be used.
- **`detail__*` has no context menu.** Core surfaces these in a node/edge context menu
  header; this panel has no such surface, so they can only fold into tooltip content
  (not yet done).
- **No legend hide toggle.** `addHideFrom` is not registered, because nodes are frame
  _rows_: a byName `custom.hideFrom` override would never match a node, and
  `stripHiddenValueFields` could only strip the underlying stat column. The hierarchy
  family omits it for the same reason. Hiding individual nodes would need
  row-level filtering inside the converter, as `resolvePieSlices` does for slices.
- **No proximity hover.** Hovering _near_ a node or link does nothing; you must be on
  it. The proximity gate (`tooltip/proximity.ts`) admits only
  `line`/`scatter`/`effectScatter`, and `graph` fails its structural preconditions —
  `findHoveredPoint` opens with `containPixel({ gridIndex: 0 })` and the `graph`
  series builds its own `View` coordinate system with no `grid`.
- **Force layout is not snapshot-tested.** It is a physics simulation whose node
  positions depend on iteration count and timing, so the canvas tests pin `circular`
  and `none` instead; force _option mapping_ is covered by unit tests in
  `lib/echarts/options/graph.test.ts`. See
  [relations.canvas.test.tsx](../../lib/components/relations.canvas.test.tsx).
- **Never auto-suggested.** `PanelDataSummary` exposes neither field names nor
  `meta.preferredVisualisationType`, so no reachable signal identifies node-graph
  data; the supplier deliberately returns nothing rather than matching ordinary
  tables. See [suggestions.ts](./suggestions.ts) and `scoreRelations`.
- **Single frame per role.** The first edges frame and the first nodes frame win;
  additional frames are dropped. Consistent with the other non-cartesian families —
  see [todo/multiple-frames.md](../../../todo/multiple-frames.md).

## ECharts API support

High-level [ECharts option](https://echarts.apache.org/en/option.html) components used
by this module. See [echarts.ts](../../lib/echarts/echarts.ts) for the registered
runtime surface.

| ECharts API                      | Status    | Notes                                                                                                                           |
| -------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `series.graph`                   | Partial   | `data`, `links`, `layout`, `force`, `label`, `lineStyle`, `edgeSymbol`, `emphasis`, `roam`, `draggable`, `symbolSize`, `zlevel` |
| `series.graph.categories`        | Not used  | Would give ECharts-native legend grouping; the Grafana DOM legend is used instead                                               |
| `series.graph.itemStyle`         | Partial   | Per-node `color` only; `borderColor`/`borderWidth` reserved for the `arc__*` approximation                                      |
| `tooltip`                        | Partial   | Item trigger with a per-series formatter feeding the React overlay                                                              |
| `legend`                         | Not used  | Grafana DOM legend instead (`buildLegendItems`)                                                                                 |
| `animation`                      | Supported | Off by default via the shared switch                                                                                            |
| `grid` / `xAxis` / `yAxis`       | N/A       | `graph` creates its own `View` coordinate system                                                                                |
| `visualMap`                      | Not used  | By-value node color goes through the field's Color scheme instead                                                               |
| `dataZoom` / `brush` / `toolbox` | Not used  | —                                                                                                                               |
| `series.sankey` / `series.chord` | Planned   | Same node/link model; see [todo/node-graph.md](../../../todo/node-graph.md)                                                     |
