# ECharts graphs for node graph frames

## Problem

Grafana emits **node graph** data (a nodes + edges frame pair, see
[../data-plane/node-graph.md](../data-plane/node-graph.md)) from tracing/service-map
sources (Tempo, AWS X-Ray, ...). The plugin has no converter, chart module, or
registered ECharts series for it. `graph`, `sankey`, and `chord` already exist in
the `SeriesType` union (`src/editor/types.ts`) but are unimplemented, and none of
the relationship series types are registered in the tree-shaken runtime
(`src/lib/echarts/echarts.ts`).

Tracing sources emit the pair natively, but the data sources most users have —
Prometheus, Loki and SQL — do not; they return flat tables whose rows happen to
describe edges. Reshaping those into the frame pair is a prerequisite for the panel
being useful to anyone without Tempo, and is written up separately in
[../docs/relations-data-sources.md](../docs/relations-data-sources.md).

This doc proposes which ECharts series fit these frames and how a converter/panel
would map them. No code is written here.

## Proposal

### Primary: ECharts `graph` series

The `graph` series is the direct structural fit — a set of nodes plus a set of
links between them
(https://echarts.apache.org/en/option.html#series-graph). It supports `force`,
`circular`, and `none` layouts, which line up with Grafana's Layered/Force/Grid
layout choices.

**Nodes frame → `series.data`**

| Node field           | ECharts target                                                   |
| -------------------- | ---------------------------------------------------------------- |
| `id`                 | `id` (and `name`, used to resolve links)                         |
| `title` / `subtitle` | `label` text (two lines)                                         |
| `mainstat`           | `value` (numeric drives sizing/tooltip); shown in/under the node |
| `secondarystat`      | secondary label / tooltip line                                   |
| `noderadius`         | `symbolSize`                                                     |
| `color`              | `itemStyle.color` (string) or gradient by value (`color.mode`)   |
| `fixedx` / `fixedy`  | fixed `x` / `y` with `layout: 'none'`                            |
| `icon`               | `symbol` (needs Grafana icon lookup — see divergences)           |

**Edges frame → `series.links`**

| Edge field                   | ECharts target                                            |
| ---------------------------- | --------------------------------------------------------- |
| `source` / `target`          | `source` / `target`                                       |
| `thickness`                  | `lineStyle.width`                                         |
| `color`                      | `lineStyle.color`                                         |
| `strokedasharray`            | `lineStyle.type` (solid / dashed / dotted, or dash array) |
| `mainstat` / `secondarystat` | edge tooltip lines                                        |

**Layout selection**

- `layout: 'none'` when every node has `fixedx`/`fixedy` (honor server-provided
  positions).
- `layout: 'force'` for large graphs (Grafana recommends force at 500+ nodes).
- `layout: 'circular'` as an alternate overview.

### Secondary fits

All three series take **identical input** — `GraphSeries`, `SankeySeries` and
`ChordSeries` each read `option.edges || option.links` and `option.data ||
option.nodes`, then build the graph with the shared `createGraphFromNodeEdge` helper.
So these are layout variants over one converter, not three converters.

- **`sankey`** — for weighted, directed, acyclic flows. Map `mainstat`/`thickness`
  to link `value`; nodes/links reuse the same frames.

  > **Cycles crash the panel in production.** `sankeyLayout.ts` runs Kahn's
  > algorithm and then `throw new Error('Sankey is a DAG, the original data has
cycle!')`. That throw is **not** behind a `__DEV__` guard, so a production build
  > keeps it — this is a blank, broken panel, not a degraded render. Service graphs
  > routinely contain cycles (retries, bidirectional RPC, A→B→A chains), and the
  > TestData `node_graph` scenario generates them deliberately. A sankey converter
  > must therefore **break cycles itself, before the links reach ECharts**: drop
  > self-loops, merge duplicate pairs, and remove back-edges with a deterministic
  > traversal (an unstable one would drop different edges on each render). This is
  > not something a user-facing "allow cycles" option can express — the only
  > alternative to breaking them is crashing.

- **`chord`** (added in ECharts **6.0.0**) — for dense adjacency where a circular
  relationship view reads better than a force layout. Pins
  `coordinateSystem: 'none'` and has **no** DAG restriction, so it takes cyclic
  service graphs directly. Note it is unrelated to the `chord` series that existed in
  ECharts 2 and was removed in 3.x; pre-3.x examples do not apply, and its option
  surface is the least documented of the three.

### Not a fit: `lines`

`lines` is the fourth member of ECharts' relationship group and a member of the
`SeriesType` union, but it does **not** consume this frame pair. `series.lines.data`
is a list of polylines — `[{ coords: [[x1, y1], [x2, y2], ...] }, ...]` — i.e.
explicit coordinate pairs, not node references. No Grafana frame kind carries those,
which is why [../data-plane/echarts-coverage.md](../data-plane/echarts-coverage.md)
gives it the verdict _no Grafana source_.

Its two real use cases both need something this repo does not have: geo routes need
the `geo` coordinate system plus an out-of-band GeoJSON via `registerMap` (geo is
explicitly out of scope in `echarts-coverage.md`), and cartesian OD-flow needs an
`x1,y1,x2,y2` frame convention the plugin would have to invent. Against a `graph`
series with `layout: 'none'` over `fixedx`/`fixedy` nodes — which draws the same
edges _and_ the nodes — non-geo `lines` adds almost nothing.

**Deferred.** Building it would need, in order: a decision on whether geo is in scope
(it currently is not), a frame convention for coordinate pairs if it is not, and
verification of `series.lines.data`'s `value` semantics — which
[../data-plane/echarts-coverage.md](../data-plane/echarts-coverage.md) still lists as
unverified. None of those is blocked by the relations panel, so `lines` can be picked
up independently once there is a reason to.

`tree` / `treemap` / `sunburst` are **not** proposed here either — those target the
flame-graph nested-set frame (`preferredVisualisationType: 'flamegraph'`), a
different Grafana format, and treemap/sunburst already ship in the hierarchy family
(see [../data-plane/hierarchy.md](../data-plane/hierarchy.md)).

## Divergences / gaps

- **`arc__*` border segments** have no native `graph` equivalent. The colored
  circle around a node (sections summing to 1) would need custom symbol rendering
  (e.g. a `custom` series or a composed pie symbol) — dropped or approximated by a
  single border color in a first pass.
- **`icon`** requires resolving Grafana built-in icon names to symbols; not a
  direct field map.
- **`detail__*` context menu** maps to tooltip content only; the plugin has no
  node/edge context menu.
- **`highlighted`** is deprecated for edges (use `color`); support `color` first.

## Implementation sketch

Follows the existing heatmap/radar pattern (converter → chart → options →
registry, plus a nested panel):

Because all three render types share one converter, this is **one nested panel with a
"Chart type" picker**, matching the hierarchy (treemap/sunburst) and multivariate
(radar/parallel) families — not three panels. The family is named **`relations`**
rather than `graph`, because `graph` collides both with the `graph` `SeriesType` value
and with Grafana's legacy "Graph" panel name.

- New nested panel `src/modules/relations/` (`plugin.json`, `module.tsx`,
  `suggestions.ts`, `parity.md`, `img/logo.svg`). Panel id
  `grafana-echartsrelations-panel`.
- Converter `src/lib/echarts/converters/nodeGraph.ts`: `frameToNodeGraph(frames)`
  → chart-agnostic `{ nodes, links }` model, plus `isNodeGraphFrames(frames)` and a
  `getNodeGraphValueField(frames)` for color/format resolution (mirroring
  `getHierarchyValueField`). Keep it Grafana-isolated (no ECharts imports), like
  `binnedHeatmap.ts`.
- Cycle policy `src/lib/echarts/converters/dag.ts`, used only by the sankey path —
  kept separate because it is graph theory, not frame reading.
- Options `src/lib/echarts/options/{graph,sankey,chord}.ts`: map the shared model →
  the respective `*SeriesOption` (`data` + `links`), plus layout defaults and an
  `applyRelationsEditorModeDefaults` (required by
  [../docs/options-modes.md](../docs/options-modes.md) for any family that gates
  options behind Advanced).
- Chart module `src/lib/echarts/charts/relations.ts`: implement `ChartModule`
  (`buildOption` dispatching on `ctx.seriesType`, `buildLegendItems`,
  `getTooltipValueFormatter`, `getTooltipFieldResolver`, `singleTooltipOnly: true`);
  add the compose options to `src/lib/echarts/charts/types.ts`.
- Wire into `src/lib/echarts/charts/registry.ts` (`resolveChartModule` +
  `supportedChartSeriesTypes`), `src/lib/echarts/charts/autoSeriesType.ts` (a
  `'relations'` member on `ChartFamily` and a `resolveAutoSeriesType` case),
  `src/lib/echarts/charts/narrowing.ts`, `src/lib/echarts/charts/fitness.ts`, and
  `src/editor/constants.ts`. No change to `src/editor/types.ts` — `'graph'`,
  `'sankey'`, `'chord'` and `'lines'` are already in the `SeriesType` union.
- Register `GraphChart`, `SankeyChart` and `ChordChart` from `echarts/charts` in
  `src/lib/echarts/echarts.ts` (currently unregistered; the runtime is tree-shaken,
  so an unregistered series silently fails to render). All three are self-contained —
  no extra component imports; `graph` ships its own `View` coordinate system.

## Resolved

- **Frame roles.** Grafana decides nodes-vs-edges with a single test — a frame with a
  `source` field is the edges frame, anything else is nodes — and matches field names
  lowercased. The converter should mirror it. See
  [../data-plane/node-graph.md](../data-plane/node-graph.md#frame-roles).
- **Detection must be field-shape-first.** Of Grafana's three detection signals, the
  two metadata ones (`preferredVisualisationType`, frame named `nodes`/`edges`) are
  unavailable on the paths that matter: provisioned `csv_content` fixtures cannot set
  frame metadata, and SQL Expression outputs are named by `refId`. Field shape is the
  only signal that survives both, so it is the primary rule, not a fallback. Grafana's
  own third test ("frame has an `id` field") is too loose to auto-detect on — it
  matches any table with an `id` column.
- **Edge-only frames.** Confirmed as legal input: Grafana derives the node set and its
  stats from `source`/`target` when no nodes frame is present, and the converter must
  do the same or a valid response renders nothing. TestData's `nodes.type:
"random edges"` produces exactly this case for testing.
- **`arc__*` rendering.** First pass approximates with a single node border color
  taken from the largest section's `config.color.fixedColor`, and records the
  divergence. A faithful multi-section ring needs a `custom` series or a composed pie
  symbol — a follow-up, not a blocker.
- **Provisioning + test data.** Done in this phase, ahead of the panel:
  `provisioning/dashboards/relations/node-graph-testdata.json` (TestData `node_graph`,
  including a deliberately cyclic panel) and
  `provisioning/dashboards/relations/node-graph-sql-expressions.json` (the reshaping
  recipe, kept TestData-backed so it needs no external data source). Which data
  sources can produce this shape at all is written up in
  [../docs/relations-data-sources.md](../docs/relations-data-sources.md).

## Open questions

- **Suggestions cannot score this data.** `PanelDataSummary` exposes neither
  `frame.meta.preferredVisualisationType` nor any structural view of an
  `id`/`source`/`target` field shape, so a supplier has nothing reliable to key on —
  the same wall `src/modules/hierarchy/suggestions.ts` hits for flame graphs. The
  workable first pass is **no auto-suggestion**, with the panel manually selectable;
  scoring on a proxy such as "≥2 string fields + instant" would suggest the panel for
  ordinary tables, which is worse than silence. Closing this properly means extending
  `PanelDataSummary` upstream.
- **Which fields drive geometry vs. tooltip.** `mainstat` is the obvious driver for
  node size/color and link weight, with `secondarystat` and `detail__*` as tooltip
  content — but `mainstat` may be a **string**, so every geometric use needs a numeric
  fallback chain. Whether link weight should additionally be user-selectable (rather
  than pure convention, as `multiValueCartesian` does it) is undecided.
- **Reporting dropped edges.** Sankey cycle-breaking silently changes the graph.
  Surfacing a count (a panel note, or a tooltip line) avoids a correctness surprise,
  but there is no precedent in this plugin for a panel-level advisory message.
