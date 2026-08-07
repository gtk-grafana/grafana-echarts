# Relations (graph, sankey, chord) editor option parity

Compares the editor options of this ECharts **Relations** module
([module.tsx](./module.tsx)) against core Grafana's **Node graph** panel
([
`public/app/plugins/panel/nodeGraph/module.tsx`](https://github.com/grafana/grafana/blob/main/public/app/plugins/panel/nodeGraph/module.tsx),
options in
[`panelcfg.cue`](https://github.com/grafana/grafana/blob/main/public/app/plugins/panel/nodeGraph/panelcfg.cue)).

Both are fed from the same query. Core's Node graph reads Grafana's node-graph frame pair
directly ([data-plane/graph-long.md](../../../data-plane/graph-long.md) has the field spec,
and [docs/relations-data-sources.md](../../../docs/relations-data-sources.md) which data
sources produce it); this module reads the **field-based** contract those frames are
converted to above the panel, so a byte-identical query still feeds both and the
side-by-side comparison this doc rests on is intact.

> **This module reads `graph-*-wide` only.**
> [data-plane/graph-wide.md](../../../data-plane/graph-wide.md) defines
> `graph-nodes-wide` / `graph-edges-wide` — one node is one **field**, one edge is one
> **field** — so colour, unit, links, `custom.hideFrom` and a `byName` override all
> address one mark. `converters/legacyToWide.ts` (registered through
> `PanelPlugin.setDataTransformations`) converts the row form to it before field overrides
> apply, and `converters/deriveNodes.ts` does the same for a node only implied by an
> edge's endpoints, wherever that pre-pass can run. See
> [todo/graph-wide-migration.md](../../../todo/graph-wide-migration.md) for what changed
> and why. What remains is the genuinely open items below.

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

## Coverage columns

Every option table below carries two columns that track _proof_ rather than
implementation — "was it built" (Status) versus "is it shown to work":

- **Regression test** — the automated test that pins the behaviour. `canvas:` names a
  case in the [canvas snapshot suite][canvas] (the recorded draw calls); `unit:` names
  an option-mapping or converter test. "needs e2e" marks an option a canvas snapshot
  _cannot_ prove — the Grafana DOM legend, tooltip content, pan/zoom and drag
  gestures — which needs a [`@grafana/plugin-e2e`](../../../tests/panel.spec.ts) test
  instead; none of those are written yet. `—` means no coverage of any kind.
- **Demo panel** — the provisioned dashboard panel that exercises the option: the first
  link is the committed JSON, the second the same panel in a running Grafana. Live
  links assume `docker compose up` on the default `GRAFANA_PORT`
  (`http://localhost:3001`) with the plugin built into `dist/`. `—` means no
  provisioned panel moves this option off its default — the relations demos are built
  around _data_ shapes (cyclic, edges-only, named nodes) rather than around the styling
  controls, so most Advanced options have tests but no demo.

Both columns describe what exists **today** — the gaps are a to-do list, not a claim
that the option is broken.

## Panel options

| Core Grafana option                   | ECharts equivalent                                                             | Status                      | Regression test                                                                                                                                                                       | Demo panel                                                                                                                                                   |
| ------------------------------------- | ------------------------------------------------------------------------------ | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Layout algorithm (Layered/Force/Grid) | "Layout" (Force / Circular / Fixed) — `series.graph.layout`                    | Partial / different set     | [canvas: honors fixed coordinates from the data][canvas] (Fixed), [unit: getGraphLayout][graph-opts]; `force` is deliberately not snapshotted                                         | [node-graph-testdata.json][db-testdata] · [#6 live][live-testdata-6] (Circular)                                                                              |
| Zoom mode (Cooperative/Greedy)        | "Zoom" — panel buttons + the `graphRoam` / `sankeyRoam` action (Advanced)      | Partial                     | [canvas: scales the view from the roam action while scroll-to-zoom stays off][canvas], [unit: getZoomAction][rel-chart], [unit: resolveRelationsZoom][graph-opts]                     | [readability.json][db-read] · [#8 live][live-read-8]                                                                                                         |
| —                                     | "Pan" — `series.*.roam: 'move'` (Advanced)                                     | ECharts-only                | [unit: resolveRelationsRoam][graph-opts], [unit: emits move roam when panning is on][graph-opts], [unit: honors the interaction switches][sankey-opts]; the drag itself needs e2e     | [readability.json][db-read] · [#8 live][live-read-8]                                                                                                         |
| Nodes: main stat unit                 | standard **Unit** on the `mainstat` field                                      | Supported (different route) | —                                                                                                                                                                                     | —                                                                                                                                                            |
| Nodes: secondary stat unit            | standard **Unit** on the `secondarystat` field                                 | Partial                     | —                                                                                                                                                                                     | —                                                                                                                                                            |
| Nodes: arcs (`arc__*` field/color)    | approximated — see [Notes / gaps](#notes--gaps)                                | Not supported\*             | n/a                                                                                                                                                                                   | n/a                                                                                                                                                          |
| Edges: main stat unit                 | standard **Unit** on the edges `mainstat` field                                | Supported (different route) | [unit: link weight fallback chain][ng-conv] (the value, not its formatting)                                                                                                           | —                                                                                                                                                            |
| Edges: secondary stat unit            | _not read_                                                                     | Not supported\*             | n/a                                                                                                                                                                                   | n/a                                                                                                                                                          |
| Node/edge context menu (`detail__*`)  | tooltip content only                                                           | Not supported\*             | n/a                                                                                                                                                                                   | n/a                                                                                                                                                          |
| —                                     | "Show node labels" — `series.graph.label.show`                                 | ECharts-only                | [canvas: hides node labels when switched off][canvas] (all three variants), [unit: getGraphLabel][graph-opts], [unit: getSankeyLabel][sankey-opts], [unit: getChordLabel][chord-opts] | —                                                                                                                                                            |
| —                                     | "Node size" — `series.graph.symbolSize`                                        | ECharts-only                | [unit: getGraphSeries — relationsNodeSize][graph-opts]                                                                                                                                | —                                                                                                                                                            |
| —                                     | "Draggable nodes" — `series.graph.draggable` (Advanced)                        | ECharts-only                | [unit: keeps roam and draggable off by default][graph-opts], [unit: pins draggable and roam off][sankey-opts]; the drag itself needs e2e                                              | —                                                                                                                                                            |
| —                                     | Repulsion / Edge length / Gravity — `series.graph.force.*` (Advanced)          | ECharts-only                | [unit: getGraphForce][graph-opts]; the layout itself is only asserted to be _reproducible_ ([canvas: draws the same graph twice from the same frames][canvas])                        | [readability.json][db-read] · [#10 live][live-read-10]                                                                                                       |
| —                                     | "Animate layout" — `series.graph.force.layoutAnimation` (Advanced)             | ECharts-only                | [unit: getGraphForce][graph-opts]; the settling is a timed animation and needs e2e                                                                                                    | [readability.json][db-read] · [#10 live][live-read-10]                                                                                                       |
| —                                     | "Edge arrows" — `series.graph.edgeSymbol` (Advanced, **on**)                   | ECharts-only                | [canvas: omits arrowheads when switched off][canvas], [unit: getGraphEdgeSymbol][graph-opts]                                                                                          | [readability.json][db-read] · [#2 live][live-read-2]                                                                                                         |
| —                                     | "Show edge values" — `series.*.edgeLabel` (Advanced)                           | ECharts-only                | [canvas: draws each edge weight on the link, draws each ribbon weight on the ribbon][canvas], [unit: getRelationsEdgeLabel][graph-opts]                                               | [readability.json][db-read] · [#8 live][live-read-8]                                                                                                         |
| —                                     | "Link curveness" — `lineStyle.curveness` (Advanced)                            | ECharts-only                | [canvas: curves links][canvas], [unit: getGraphLinkStyle][graph-opts]                                                                                                                 | —                                                                                                                                                            |
| —                                     | "Highlight adjacency" — `emphasis.focus` (Default, **on**)                     | ECharts-only                | [unit: getGraphEmphasis][graph-opts], [unit: getSankeyEmphasis][sankey-opts], [unit: getChordEmphasis][chord-opts]; the hover state needs e2e                                         | [chord.json][db-chord] · [#7 live][live-chord-7]                                                                                                             |
| —                                     | "Hide overlapping labels" — `series.labelLayout.hideOverlap` (Default, **on**) | ECharts-only                | [canvas: drops a label that would collide, drops labels that collide on a ring of small arcs][canvas], [unit: getRelationsLabelLayout][graph-opts]                                    | [readability.json][db-read] · [#2 live][live-read-2] vs [#3 live][live-read-3]                                                                               |
| —                                     | "Label overflow" / "Label width" — `label.overflow` / `label.width` (Advanced) | ECharts-only                | [canvas: truncates a long label at the label width, wraps a long label instead][canvas], [unit: getRelationsLabelStyle][graph-opts]                                                   | [readability.json][db-read] · [#2 live][live-read-2] vs [#3 live][live-read-3]                                                                               |
| —                                     | "Link color" (Source/Target/Gradient) — resolved per edge (Advanced)           | ECharts-only                | [canvas: colors links from the endpoint the mode names, blends link color in gradient mode][canvas], [unit: resolves the source and target modes to the endpoint colours][graph-opts] | [readability.json][db-read] · [#5 live][live-read-5] vs [#6 live][live-read-6]                                                                               |
| —                                     | Grafana legend (`addLegendOptions`)                                            | ECharts-only                | [unit: buildLegendItems — one entry per node, stable keys, swatch color][rel-chart], [unit: useLegend][use-legend]; the rendered DOM legend needs e2e                                 | [node-graph-testdata.json][db-testdata] · [#6 live][live-testdata-6]                                                                                         |
| —                                     | Tooltip mode (Single/Hidden)                                                   | ECharts-only                | [unit: declares singleTooltipOnly][rel-chart]; the tooltip content has no test of its own and needs e2e                                                                               | [node-graph-testdata.json][db-testdata] · [#6 live][live-testdata-6]                                                                                         |
| —                                     | Animation — `animation.enabled` (Default, **on** for this family)              | ECharts-only                | [unit: the relations family default][perf-res]                                                                                                                                        | [readability.json][db-read] · [#15 live][live-read-15]                                                                                                       |
| —                                     | "Chart type" (Graph / Sankey / Chord) — panel `seriesType`                     | ECharts-only                | [canvas: sankey variant, chord variant][canvas], [unit: buildOption per variant][rel-chart]                                                                                           | [sankey.json][db-sankey] · [#1 live][live-sankey-1] vs [#5 live][live-sankey-5], [chord.json][db-chord] · [#1 live][live-chord-1] vs [#2 live][live-chord-2] |

Graph-only controls are hidden for the other two variants (`isGraphVariant`): Layout,
Node size, Repulsion / Edge length / Gravity, Animate layout, Edge arrows and Link
curveness — sankey and chord both self-layout, size nodes from flow, run no simulation,
and have no `edgeSymbol`. "Show edge values" covers graph and sankey but not chord, whose
`ChordEdge` builds no text element. "Draggable nodes", "Zoom" and "Pan" are all hidden for
chord, which pins `coordinateSystem: 'none'` and declares neither `draggable` nor `roam`.

**"Show node values" also gates on the data.** On an edges-only response every node is
derived from an endpoint and carries no stat, so the switch would be a control that
visibly does nothing; the editor is handed the panel's frames and hides it
(`hasNoNodeStats`). It answers "show" whenever it cannot tell.

**Zoom is buttons, not the scroll wheel.** ECharts' own zoom is `roam`, which binds the
wheel — and a panel that captures the wheel is a panel the dashboard cannot be scrolled
past. The panel draws its own corner buttons and dispatches the roam _action_
(`registerRoamActionSimply`), which resolves the view coordinate system directly and so
works with `roam: false`. Only panning goes through `roam`, as `'move'`. The superseded
single `relationsRoam` switch is still read by both, so a dashboard saved before the split
behaves the same.

**Three graph defaults are deliberately not ECharts'.** `force.repulsion` (400 vs
`[0, 50]`) and `force.edgeLength` (200 vs 30), because ECharts' are tuned for gallery
graphs and pack a real topology into a knot; and `force.initLayout: 'circular'`, because
without a seed `forceHelper` starts every node at `Math.random()` and the same frames draw
a different graph on every refresh. `force.layoutAnimation` is off for a related reason:
painting each simulation step makes a timed refresh look like the nodes are jiggling.

**`series.labelLayout` needs a registered feature.** `hideOverlap` reads like a plain
series option, but the stage that acts on it is `installLabelLayout`, which the full
`echarts` barrel registers and a modular build does not. It is registered explicitly in
`lib/echarts/echarts.ts`; unregistered, the key is accepted, appears on the built option,
and is completely inert.

### Sankey options

No core Grafana equivalent, so these are compared against ECharts semantics. Each
omits its ECharts key at its default; all gate on `isSankeyVariant`.

| Tier     | Option            | ECharts key                         | Regression test                                                                                                 | Demo panel                                          |
| -------- | ----------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Default  | Flow direction    | `series.sankey.orient`              | [canvas: lays out vertically when the flow direction is switched][canvas], [unit: getSankeyOrient][sankey-opts] | [sankey.json][db-sankey] · [#2 live][live-sankey-2] |
| Default  | Node alignment    | `series.sankey.nodeAlign`           | [unit: getSankeyNodeAlign][sankey-opts]                                                                         | [sankey.json][db-sankey] · [#9 live][live-sankey-9] |
| Advanced | Node width        | `series.sankey.nodeWidth`           | [canvas: sizes node bars from node width and gap][canvas], [unit: getSankeySeries][sankey-opts]                 | [sankey.json][db-sankey] · [#9 live][live-sankey-9] |
| Advanced | Node gap          | `series.sankey.nodeGap`             | [canvas: sizes node bars from node width and gap][canvas], [unit: getSankeySeries][sankey-opts]                 | [sankey.json][db-sankey] · [#9 live][live-sankey-9] |
| Advanced | Ribbon curveness  | `series.sankey.lineStyle.curveness` | [unit: getSankeyLinkStyle][sankey-opts]                                                                         | —                                                   |
| Advanced | Ribbon opacity    | `series.sankey.lineStyle.opacity`   | [canvas: raises ribbon opacity][canvas], [unit: getSankeyLinkStyle][sankey-opts]                                | [sankey.json][db-sankey] · [#9 live][live-sankey-9] |
| Advanced | Layout iterations | `series.sankey.layoutIterations`    | [unit: getSankeySeries][sankey-opts]                                                                            | —                                                   |

Shared with the graph variant: Show node labels, Show node values, Hide overlapping
labels, Label overflow / width, Show edge values, Link color, Zoom, Pan, Draggable nodes,
Highlight adjacency, Animation.

**The node label position follows the flow direction**, which ECharts' does not: it places
a sankey label `right` in both orientations, and vertically the bars run _along_ the row
`nodeGap` (8px) apart — so a label 5px to the right of one lands on the next node's fill,
unreadable against a saturated colour and colliding with that node's own label. It is
placed `bottom` on a vertical flow instead, in the ribbon gap. See `getSankeyLabelPosition`
and [canvas: keeps long labels legible on a vertical flow][canvas].

### Chord options

Also no core equivalent. `series.chord` is **new in ECharts 6.0.0** and unrelated to the
`chord` series removed in 3.x, so every key below was checked against the installed
6.1.0 source rather than assumed. All Advanced, all gated on `isChordVariant`.

| Tier     | Option            | ECharts key                      | Regression test                                                                        | Demo panel                                       |
| -------- | ----------------- | -------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Advanced | Start angle       | `series.chord.startAngle`        | [canvas: rotates and reverses the ring][canvas], [unit: getChordSeries][chord-opts]    | [chord.json][db-chord] · [#7 live][live-chord-7] |
| Advanced | Clockwise         | `series.chord.clockwise`         | [canvas: rotates and reverses the ring][canvas], [unit: getChordSeries][chord-opts]    | [chord.json][db-chord] · [#7 live][live-chord-7] |
| Advanced | Arc gap           | `series.chord.padAngle`          | [canvas: widens the gap between node arcs][canvas], [unit: getChordSeries][chord-opts] | [chord.json][db-chord] · [#7 live][live-chord-7] |
| Advanced | Minimum arc angle | `series.chord.minAngle`          | [unit: getChordSeries][chord-opts]                                                     | —                                                |
| Advanced | Ribbon opacity    | `series.chord.lineStyle.opacity` | [unit: getChordLinkStyle][chord-opts]                                                  | [chord.json][db-chord] · [#7 live][live-chord-7] |

Chord has **no** `roam` and no `draggable` — it pins `coordinateSystem: 'none'`, so there
is no view to move or scale. Both switches are hidden there, and the zoom buttons are not
drawn ([unit: has nothing to dispatch on a chord][rel-chart]).

**`series.chord` has no `nodeWidth` or `nodeGap`** — those are sankey keys, and wiring
them here by analogy would have produced two controls that silently do nothing. The
angular `padAngle` is the gap analogue; ring thickness is `series.chord.radius` (a
`['70%', '80%']` tuple), left at the ECharts default rather than flattened into a single
control.

One chord key is **always emitted**: `emphasis.focus`. The family default is
`'adjacency'` now, which is also ECharts' chord default, so the two agree out of the box —
but the key is still written either way, because omitting it would leave adjacency
highlighting active when the switch is turned _off_ and the control would be lying. Its
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

| Option         | Meaningful here? | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Regression test                                                                                                                   | Demo panel                                                                                     |
| -------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Color scheme   | **Yes**          | The load-bearing one, and now plain field behaviour: a mark's colour is `field.display(value).color`, which `applyFieldOverrides` already resolved, so all eight modes work and a `byName` override targets one node or one edge. A node derived from an edge's endpoints is declared as a field above the panel too ([derived nodes][derived]), so it behaves the same; only where that pre-pass cannot run does it fall back to the classic palette by position. | [canvas: colors nodes from the color field, honors a byName color override][canvas], [unit: node colour / edge colour][wide-conv] | [graph-wide.json][db-wide] · [#13 live][live-wide-13]                                          |
| Unit           | **Yes**          | Per mark, not per frame: a hovered node or edge formats with its own field's unit, in the tooltip **and** in the "Show node values" label. Two nodes of one graph can differ, which the row form cannot express.                                                                                                                                                                                                                                                   | [unit: per-mark formatting][tip-marks], [e2e: emitted model][tip-emit]                                                            | [per-mark-tooltip-links.json][db-marks], [graph-wide.json][db-wide] · [#14 live][live-wide-14] |
| Decimals       | **Yes**          | Same path as Unit.                                                                                                                                                                                                                                                                                                                                                                                                                                                 | [unit: per-mark formatting][tip-marks]                                                                                            | [per-mark-tooltip-links.json][db-marks]                                                        |
| Value mappings | **Yes**          | Applied through the field's display processor.                                                                                                                                                                                                                                                                                                                                                                                                                     | —                                                                                                                                 | —                                                                                              |
| Data links     | **Yes**          | The pinned footer resolves the hovered mark's **own** field, so a `byName` `links` override puts a link on exactly one node or one edge and leaves the others with no footer at all. A node derived from an edge's endpoints gets a field of its own from the [derived-node pre-pass][derived], and shows none only where that cannot run.                                                                                                                         | [e2e: node, edge and the marks without a link][dl-test]                                                                           | [per-mark-tooltip-links.json][db-marks], [graph-wide.json][db-wide] · [#15 live][live-wide-15] |
| Min            | Marginal         | Only bounds the by-value color domain.                                                                                                                                                                                                                                                                                                                                                                                                                             | —                                                                                                                                 | —                                                                                              |
| Max            | Marginal         | Only bounds the by-value color domain.                                                                                                                                                                                                                                                                                                                                                                                                                             | —                                                                                                                                 | —                                                                                              |
| No value       | Marginal         | A null `mainstat` renders a node with no stat.                                                                                                                                                                                                                                                                                                                                                                                                                     | [unit: optional edge and node fields][ng-conv] (a missing `mainstat` reaches the model as undefined)                              | —                                                                                              |
| Thresholds     | Marginal         | Reachable only as a by-value color scheme; there is no `markLine` equivalent because there are no axes.                                                                                                                                                                                                                                                                                                                                                            | —                                                                                                                                 | —                                                                                              |
| Display name   | **Yes**          | A node's name **is** its field's display name: the reader takes `config.displayName` (the row form's `title`) and falls back to the field name, so a `byName` override renames one node. Edges keep their field name — an edge's display name carries its labels, `e1 {source="a", target="b"}`.                                                                                                                                                                   | [unit: one node per field, titled by displayName][wide-conv]                                                                      | [graph-wide.json][db-wide] · [#8 live][live-wide-8]                                            |

Not registered, deliberately:

- **`reduceOptions`** is registered (`addRelationsStatOptions`): `calcs[0]` is a
  mark's main stat and every calc after it is an extra tooltip row. Deliberately _not_
  `addStandardDataReduceOptions`, which would also add an inert "Show: Calculate / All
  values" radio and a "Limit" input — a mark is a field, so neither can mean anything here.
  Nothing is truncated: only `calcs[0]` is singular, because it is the number that sizes a
  node and weighs an edge.
- **Legend calcs** — `includeLegendCalcs: false`. The original reason (legend entries are
  not fields, so there is nothing to reduce) is obsolete: a legend entry **is** a field
  now. **Still off**, for a narrower reason — a mark is
  already reduced to one value by `reduceOptions`, so on the instant data this family
  normally sees, every legend calc would print that same number again. It becomes a real
  option only for a _ranged_ wide frame, where a mark has many rows and Max/Mean over the
  range would say something `calcs[0]` does not. Left open rather than built, because
  `getDisplayValues` would have to reduce each mark's own field a second time and the
  legend has no other per-mark surface to justify it.
- **`custom.hideFrom`** (`commonOptionsBuilder.addHideFrom`) — the real one, with both
  editors reachable: a mark is a field, so a `byName` override hides exactly one node or
  one edge. See the gap below for what the legend does with it.
- **Per-mark style** (`editor/relations/fieldConfig.ts`) — `custom.nodeRadius`,
  `.subtitle`, `.fixedX`, `.fixedY` on nodes; `custom.lineWidth`, `.lineType`,
  `.curveness` on edges. Override-only (`hideFromDefaults`), because the Fields tab
  would apply one value to every node _and_ every edge at once, which either duplicates
  a panel option or means nothing. These are the columns the row form carried as data —
  the same keys `converters/legacyToWide.ts` writes — now editable without touching the
  query.

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

Because dropping links silently changes the graph, the panel reports the count as a
corner notice ("N links hidden to remove cycles") — a hoverable warning icon in the
top-right of the viz area, built by `relationsChartModule.getNotices` and rendered by
`ChartNotices`. Acyclic data shows no notice. A merge is not counted, since summing
weights loses no flow.

The notice is drawn by the panel rather than handed to Grafana's panel _chrome_: that
slot is fed only from `DataFrame.meta.notices` on the scene's data object (see
`PanelNoticesRenderer`, which reads `sceneGraph.getData(model).useState()`), which a
panel plugin receives read-only.

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
  [data-plane/graph-long.md](../../../data-plane/graph-long.md).
- **`icon` is dropped.** The values are Grafana built-in icon names and need resolving
  to an ECharts `symbol` before they could be used.
- **`detail__*` has no context menu.** Core surfaces these in a node/edge context menu
  header; this panel has no such surface, so they can only fold into tooltip content
  (not yet done).
- **Legend hide** goes through Grafana's override engine now that a mark is a field:
  `custom.hideFrom.viz` is applied to the mark upstream and the reader reads it off the
  mark (`RelationNode.hidden`). `withoutHiddenMarks` (`charts/relations.ts`) then drops
  the mark **and every link touching a hidden node**, which is the part no field config
  can express. Three wrinkles remain:
  - **The kept-name universe includes edges.** The toggle persists as a `byNames`
    matcher in _exclude_ mode, so any field missing from the kept list is hidden — and
    edges are fields the legend never lists. Without `getOverrideTargetNames` naming
    them, hiding one node would erase every link in the panel.
  - **A derived node hides by name where the pre-pass cannot run.** `deriveNodes.ts`
    declares it as a field before the override pass, so normally there is something for an
    override to land on; on a host without `panelPluginTransformations` there is not, and
    `hiddenNodeIds` falls back to matching its name — the same hole as
    `relations-data-links.md` gap 4. See [docs/relations-derived-nodes.md][derived].
  - **Relations stays out of `stripHiddenValueFields`.** Deleting a hidden node's column
    would make the reader re-derive that node from the edges still naming it, so it
    would come straight back (see `options/panelOption.ts`).

  Clicking uses `Hide` semantics, not the per-field `Isolate` default: isolating one
  node leaves a graph of one node and no links.
  Hover emphasis arrives over the panel event bus rather than through props —
  `VizLegend` declares `onLabelMouseOver`/`onLabelMouseOut` but its implementation
  ignores them and publishes `DataHoverEvent`/`DataHoverClearEvent` instead. See
  `useLegendHighlight` and `relationsChartModule.getLegendHighlightTargets`, which
  emphasises the node plus its incident links via ECharts' `dataType` discriminator.

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
- **Auto-suggested from the edge field shape.** `PanelDataSummary` does expose the
  two signals this bullet once said it did not: `rawFrames` (so `isLegacyGraphFrames`
  can look for a `source`+`target` field pair) and `hasPreferredVisualisationType`
  (Grafana's `nodeGraph` hint, scored `Best`; the shape alone scores `Good`).
  Requiring **both** `source` and `target` is what keeps an ordinary table with a
  `source` column from being claimed — the risk that motivated the original silence.
  Graph, Sankey and Chord cards are emitted together, since all three consume the
  identical node/link model; Chord is dropped past `RELATIONS_CHORD_MAX_NODES`,
  where a ring runs out of circumference, and the family withholds entirely past
  `RELATIONS_MAX_EDGES`. See [suggestions.ts](./suggestions.ts), `scoreRelations` and
  `exceedsChordNodeBudget`.
- **Every frame in a role contributes, not just the first.** `findEdgesFrames` /
  `findNodesFrames` collect every frame that declares or shape-matches a role — the
  shape a labelled datasource returns with no transformation is N single-series frames,
  and reading only the first used to silently draw a one-edge graph from a ten-series
  response. Declared beats shape as a **filter**, not a find: once any frame declares
  `graph-edges-wide`, only declared frames are collected. See
  [data-plane/graph-wide.md](../../../data-plane/graph-wide.md#a-role-is-one-to-many).
- **Why the pivot walks around the matcher wall rather than through it.** `FieldMatcher`
  is still `(field, frame, allFrames) => boolean` — Grafana has no row-level matcher, and
  the override matcher list is still five entries (`byName`, `byRegexp`, `byType`,
  `byFrameRefID`, `byValue`). Making a mark a field sidesteps this rather than fixing it.
  If a core change is ever wanted anyway, the cheaper door is `MatcherScope`
  (`'series' | 'nested' | 'annotation' | 'exemplar'`, already shipping with a `scope`
  parameter on `applyFieldOverrides` and a `MatcherScopeSelector` in `@grafana/ui`) — a
  `'node'` / `'edge'` scope is a far smaller ask than a parallel override system, though
  graph frames don't need either.

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
| `title`                          | Not used  | The sankey dropped-link note is a panel corner notice (`ChartNotices`), not canvas text                                                             |
| `grid` / `xAxis` / `yAxis`       | N/A       | `graph` creates its own `View` coordinate system; `sankey` uses a box layout                                                                        |
| `visualMap`                      | Not used  | By-value node color goes through the field's Color scheme instead                                                                                   |
| `dataZoom` / `brush` / `toolbox` | Not used  | —                                                                                                                                                   |

**Per-item capability, checked against the installed ECharts source rather than
assumed:** curveness is a per-**edge** `lineStyle` property on all three variants
(`GraphEdgeLineStyleOption`, `SankeyEdgeStyleOption` and `ChordEdgeLineStyleOption` each
extend `LineStyleOption` with `curveness`), so per-edge curving needs no series-level
control. Sankey's node width and node gap can never be per-node, though — they are
series-level only (`series.sankey.nodeWidth` / `nodeGap`), with no item-level
counterpart; the nearest per-node equivalents are `localX`/`localY`/`depth`, which
place a node but do not size it. Node _size_ is per-item only on `graph`, via
`symbolSize`, which the converter already drives from `custom.nodeRadius`.

<!-- Regression test targets -->

[canvas]: ../../lib/components/relations.canvas.test.tsx
[graph-opts]: ../../lib/echarts/options/graph.test.ts
[sankey-opts]: ../../lib/echarts/options/sankey.test.ts
[chord-opts]: ../../lib/echarts/options/chord.test.ts
[rel-chart]: ../../lib/echarts/charts/relations.test.ts
[ng-conv]: ../../lib/echarts/converters/graphWide.test.ts
[wide-conv]: ../../lib/echarts/converters/graphWide.test.ts
[use-legend]: ../../lib/components/hooks/useLegend.test.tsx
[tip-marks]: ../../lib/echarts/tooltip/relations.test.ts
[tip-emit]: ../../lib/echarts/tooltip/tooltipEmit.test.ts
[dl-test]: ../../lib/components/tooltip/dataLinks.test.tsx
[derived-conv]: ../../lib/echarts/converters/deriveNodes.test.ts

<!-- Docs -->

[derived]: ../../../docs/relations-derived-nodes.md

<!-- Provisioned dashboards: committed JSON, then the panel in a running Grafana -->

[db-wide]: ../../../provisioning/dashboards/relations/graph-wide.json
[live-wide-8]: http://localhost:3001/d/echarts-relations-graph-wide?viewPanel=8
[live-wide-13]: http://localhost:3001/d/echarts-relations-graph-wide?viewPanel=13
[live-wide-14]: http://localhost:3001/d/echarts-relations-graph-wide?viewPanel=14
[live-wide-15]: http://localhost:3001/d/echarts-relations-graph-wide?viewPanel=15
[db-testdata]: ../../../provisioning/dashboards/relations/node-graph-testdata.json
[live-testdata-6]: http://localhost:3001/d/echarts-relations-node-graph-testdata?viewPanel=6
[db-marks]: ../../../provisioning/dashboards/relations/per-mark-tooltip-links.json
[db-sankey]: ../../../provisioning/dashboards/relations/sankey.json
[live-sankey-1]: http://localhost:3001/d/echarts-relations-sankey?viewPanel=1
[live-sankey-2]: http://localhost:3001/d/echarts-relations-sankey?viewPanel=2
[live-sankey-5]: http://localhost:3001/d/echarts-relations-sankey?viewPanel=5
[live-sankey-9]: http://localhost:3001/d/echarts-relations-sankey?viewPanel=9
[db-read]: ../../../provisioning/dashboards/relations/readability.json
[live-read-2]: http://localhost:3001/d/echarts-relations-readability?viewPanel=2
[live-read-3]: http://localhost:3001/d/echarts-relations-readability?viewPanel=3
[live-read-5]: http://localhost:3001/d/echarts-relations-readability?viewPanel=5
[live-read-6]: http://localhost:3001/d/echarts-relations-readability?viewPanel=6
[live-read-8]: http://localhost:3001/d/echarts-relations-readability?viewPanel=8
[live-read-10]: http://localhost:3001/d/echarts-relations-readability?viewPanel=10
[live-read-15]: http://localhost:3001/d/echarts-relations-readability?viewPanel=15
[perf-res]: ../../lib/echarts/performance/resolvers.test.ts
[db-chord]: ../../../provisioning/dashboards/relations/chord.json
[live-chord-1]: http://localhost:3001/d/echarts-relations-chord?viewPanel=1
[live-chord-2]: http://localhost:3001/d/echarts-relations-chord?viewPanel=2
[live-chord-7]: http://localhost:3001/d/echarts-relations-chord?viewPanel=7
