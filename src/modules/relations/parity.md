# Relations (graph, sankey, chord) editor option parity

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
the `graph` `SeriesType` value and Grafana's legacy "Graph" panel name.

## Render variants

The "Chart type" picker selects between three layouts over one converter. Core Grafana
has no sankey or chord panel at all, so only `graph` has a parity baseline; the other
two are compared against ECharts semantics instead (the `multivariate/parity.md`
pattern).

| Variant  | Topology accepted     | Node size             | Link size                       |
| -------- | --------------------- | --------------------- | ------------------------------- |
| `graph`  | any digraph           | `noderadius` or px    | `thickness` (`lineStyle.width`) |
| `sankey` | **DAG only** (forced) | flow through the node | the link weight                 |
| `chord`  | any digraph           | flow through the node | the link weight                 |

Switching variants re-renders the same frames — it is a layout change, not a data
change. The one asymmetry is topological: a sankey **cannot** draw a cycle, so its path
removes back-edges first. See [Cycle policy](#cycle-policy). `chord` is the variant to
reach for on cyclic service-graph data: it takes cycles _and_ self-loops directly, and a
dense adjacency matrix reads better as a ring than as a force layout.

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
| —                                     | "Chart type" (Graph / Sankey / Chord) — panel `seriesType`            | ECharts-only                |

Graph-only controls are hidden for the other two variants (`isGraphVariant`): Layout,
Node size, Repulsion / Edge length / Gravity, Edge arrows and Link curveness — sankey and
chord both self-layout, size nodes from flow, run no simulation, and have no
`edgeSymbol`. "Draggable nodes" is hidden for chord too, which has no `draggable` at
all.

### Sankey options

No core Grafana equivalent, so these are compared against ECharts semantics. Each
omits its ECharts key at its default; all gate on `isSankeyVariant`.

| Tier     | Option            | ECharts key                         |
| -------- | ----------------- | ----------------------------------- |
| Default  | Flow direction    | `series.sankey.orient`              |
| Default  | Node alignment    | `series.sankey.nodeAlign`           |
| Advanced | Node width        | `series.sankey.nodeWidth`           |
| Advanced | Node gap          | `series.sankey.nodeGap`             |
| Advanced | Ribbon curveness  | `series.sankey.lineStyle.curveness` |
| Advanced | Ribbon opacity    | `series.sankey.lineStyle.opacity`   |
| Advanced | Layout iterations | `series.sankey.layoutIterations`    |

Shared with the graph variant: Show node labels, Link color, Zoom and pan, Draggable
nodes, Highlight adjacency, Animation.

### Chord options

Also no core equivalent. `series.chord` is **new in ECharts 6.0.0** and unrelated to the
`chord` series removed in 3.x, so every key below was checked against the installed
6.1.0 source rather than assumed. All Advanced, all gated on `isChordVariant`.

| Tier     | Option            | ECharts key                      |
| -------- | ----------------- | -------------------------------- |
| Advanced | Start angle       | `series.chord.startAngle`        |
| Advanced | Clockwise         | `series.chord.clockwise`         |
| Advanced | Arc gap           | `series.chord.padAngle`          |
| Advanced | Minimum arc angle | `series.chord.minAngle`          |
| Advanced | Ribbon opacity    | `series.chord.lineStyle.opacity` |

**`series.chord` has no `nodeWidth` or `nodeGap`** — those are sankey keys, and wiring
them here by analogy would have produced two controls that silently do nothing. The
angular `padAngle` is the gap analogue; ring thickness is `series.chord.radius` (a
`['70%', '80%']` tuple), left at the ECharts default rather than flattened into a single
control.

One chord key is **always emitted**: `emphasis.focus`. ECharts defaults a chord to
`'adjacency'`, where graph and sankey default to no focus — so omitting it would leave
adjacency highlighting active while the shared "Highlight adjacency" switch reads off.
It is pinned to `'none'` when the switch is off, which keeps the control honest at the
cost of an out-of-box chord that differs from ECharts' own examples. Its
`lineStyle.color` needs no pinning, unlike sankey's: ECharts' chord default is already
`'source'`, the family default.

Two sankey keys are **pinned rather than omitted**, because ECharts' sankey defaults
disagree with the family's:

- **`draggable`** — ECharts defaults a sankey to `true`, where `graph` is `false`. It
  is emitted as `false` so both variants are static out of the box.
- **`lineStyle.color`** — ECharts defaults to a neutral gray; the family default is
  `source`, so ribbons inherit node colors as the graph variant's edges do.

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

## Cycle policy

**Sankey only.** ECharts' `sankeyLayout.ts` runs Kahn's algorithm and then
`throw new Error('Sankey is a DAG, the original data has cycle!')`. That throw is
**not** behind a `__DEV__` guard, so it survives into production builds: a cyclic edge
set would be a blank, broken panel rather than a degraded render. Service graphs
routinely contain cycles (retries, bidirectional RPC, A→B→A chains), and TestData's
`node_graph` scenario generates them on purpose.

So the sankey path sanitizes the links **before ECharts sees them**
([converters/dag.ts](../../lib/echarts/converters/dag.ts)), unconditionally:

1. self-loops (`source === target`) are dropped — a sankey has no way to draw one;
2. duplicate `source → target` pairs are merged, summing their weights;
3. back-edges found by a deterministic depth-first traversal are dropped.

**This is not a user option.** The only alternative to breaking a cycle is crashing, so
there is nothing to toggle. Traversal order follows frame row order, so the _same_ edge
is dropped on every render — an unstable choice would change the panel's shape between
refreshes.

Because dropping links silently changes the graph, the panel reports the count in a
bottom-left note ("N links hidden to remove cycles"), rendered through the same
ECharts `title` mechanism as the pie's donut-center readout. Acyclic data shows no
note. A merge is not counted, since summing weights loses no flow.

`graph` accepts any digraph and never runs this pass, so the two variants over the same
frames can legitimately show a different number of links.

## Notes / gaps

- **Sankey and chord drop `thickness` and `strokedasharray`.** Ribbon size _is_ the
  link weight (`edge.getValue()`), so `lineStyle.width` has no effect; and a ribbon is
  a filled area rather than a stroked line, so a dash type has nothing to apply to.
  Both are honored by the graph variant. `thickness` still contributes as the weight
  fallback (`mainstat` → `thickness` → 1).
- **Sankey and chord drop `noderadius`, `fixedx` and `fixedy`.** Node extent comes from
  the flow (plus the series-level `nodeWidth` / ring `radius`), so a per-node radius has
  no meaning; and neither positions with the pixel coordinates the graph variant's
  `layout: 'none'` consumes — sankey uses `localX`/`localY`/`depth`, chord an angle.
- **Sankey and chord treat node `mainstat` as tooltip-only.** Both compute a node's
  extent from its flow, but each takes `Math.max(declaredValue, edgeSum)`
  (`computeNodeValues` / `chordLayout`) — so declaring `mainstat` as the item's `value`
  would act as a floor and inflate a node past its own ribbons whenever the stat is not
  itself a flow (a latency, an error rate). It is carried separately and read only by
  the tooltip.
- **Sankey and chord labels need an explicit formatter.** Neither labels from the node
  name by default: `SankeyView` passes `defaultText: node.id` (the graph _key_, which
  the converter sets from the frame's `id` so links resolve against it) and
  `ChordPiece` passes `defaultText: node.dataIndex + ''` — the raw numeric index. Left
  alone, a nodes frame's human-readable `title` would never appear, and a chord would
  label its arcs "0", "1", "2". Both series pin `label.formatter: '{b}'` (the data
  name) so all three variants label alike. The graph variant needs no such correction:
  `Symbol.js` labels from `data.getName(idx)`.
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
  [relations.canvas.test.tsx](../../lib/components/relations.canvas.test.tsx). The
  sankey variant needs no such pinning — it self-layouts deterministically from the
  weights, so its snapshots include the default layout.
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

| ECharts API                      | Status    | Notes                                                                                                                                               |
| -------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `series.graph`                   | Partial   | `data`, `links`, `layout`, `force`, `label`, `lineStyle`, `edgeSymbol`, `emphasis`, `roam`, `draggable`, `symbolSize`, `zlevel`                     |
| `series.graph.categories`        | Not used  | Would give ECharts-native legend grouping; the Grafana DOM legend is used instead                                                                   |
| `series.graph.itemStyle`         | Partial   | Per-node `color` only; `borderColor`/`borderWidth` reserved for the `arc__*` approximation                                                          |
| `series.sankey`                  | Partial   | `data`, `links`, `orient`, `nodeAlign`, `nodeWidth`, `nodeGap`, `layoutIterations`, `label`, `lineStyle`, `emphasis`, `draggable`, `roam`, `zlevel` |
| `series.sankey.levels`           | Not used  | Per-depth styling; no Grafana field maps to a sankey depth                                                                                          |
| `series.sankey.edgeLabel`        | Not used  | Ribbon labels would collide at any realistic edge count                                                                                             |
| `series.chord`                   | Partial   | `data`, `links`, `startAngle`, `clockwise`, `padAngle`, `minAngle`, `label`, `lineStyle`, `emphasis`, `roam`, `zlevel`                              |
| `series.chord.radius` / `center` | Not used  | Ring geometry left at the ECharts default (`['70%', '80%']`)                                                                                        |
| `series.chord.endAngle`          | Not used  | `'auto'` completes the ring; a partial ring has no Grafana meaning                                                                                  |
| `tooltip`                        | Partial   | Item trigger with a per-series formatter feeding the React overlay                                                                                  |
| `legend`                         | Not used  | Grafana DOM legend instead (`buildLegendItems`)                                                                                                     |
| `animation`                      | Supported | Off by default via the shared switch                                                                                                                |
| `title`                          | Partial   | `subtext` only, for the sankey dropped-link note (`getSankeyDroppedNote`)                                                                           |
| `grid` / `xAxis` / `yAxis`       | N/A       | `graph` creates its own `View` coordinate system; `sankey` uses a box layout                                                                        |
| `visualMap`                      | Not used  | By-value node color goes through the field's Color scheme instead                                                                                   |
| `dataZoom` / `brush` / `toolbox` | Not used  | —                                                                                                                                                   |
