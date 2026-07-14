# ECharts graphs for node graph frames

## Problem

Grafana emits **node graph** data (a nodes + edges frame pair, see
[../data-plane/node-graph.md](../data-plane/node-graph.md)) from tracing/service-map
sources (Tempo, AWS X-Ray, ...). The plugin has no converter, chart module, or
registered ECharts series for it. `graph`, `sankey`, and `chord` already exist in
the `SeriesType` union (`src/editor/types.ts`) but are unimplemented, and none of
the relationship series types are registered in the tree-shaken runtime
(`src/lib/echarts/echarts.ts`).

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

- **`sankey`** — for weighted, directed, acyclic flows. Map `mainstat`/`thickness`
  to link `value`; nodes/links reuse the same frames. Requires a DAG (sankey
  cannot render cycles), so it is opt-in, not the default.
- **`chord`** (ECharts 6) — for dense adjacency where a circular relationship view
  reads better than a force layout.

`tree` / `treemap` / `sunburst` are **not** proposed here — those target the
flame-graph nested-set frame (`preferredVisualisationType: 'flamegraph'`), a
different Grafana format.

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

- New nested panel `src/modules/graph/` (`plugin.json`, `module.tsx`,
  `suggestions.ts`, `img/logo.svg`).
- Converter `src/lib/echarts/converters/nodeGraph.ts`: `frameToNodeGraph(frames)`
  → chart-agnostic `{ nodes, links }` model, plus `isNodeGraphFrames(frames)`.
  Keep it Grafana-isolated (no ECharts imports), like `binnedHeatmap.ts`.
- Options `src/lib/echarts/options/graph.ts`: map the model → `GraphSeriesOption`
  (`data` + `links`), layout defaults.
- Chart module `src/lib/echarts/charts/graph.ts`: implement `ChartModule`
  (`buildOption`, `buildLegendItems`, `getTooltipValueFormatter`); add
  `EChartGraphOption` to `src/lib/echarts/charts/types.ts`.
- Wire `graph` into `src/lib/echarts/charts/registry.ts` and
  `src/editor/constants.ts`.
- Register `GraphChart` from `echarts/charts` in `src/lib/echarts/echarts.ts`
  (currently unregistered; the runtime is tree-shaken).

## Open questions

- **Detection / suggestions.** Node graph has no `frame.meta.type`, so
  `PanelDataSummary.hasDataFrameType` cannot see it. The supplier must inspect
  `preferredVisualisationType === 'nodeGraph'` and/or frame names `nodes`/`edges`
  — a signal the current suggestion path does not expose (may require raw frame
  access beyond `PanelDataSummary`).
- **Edge-only frames.** Grafana computes nodes and stats from edges when no nodes
  frame is present; the converter should do the same (derive node set + degree
  stats from `source`/`target`).
- **`arc__*` rendering.** Single border color vs. custom multi-section symbol —
  decide the first-pass fidelity.
- **Single vs. multiple value fields** per node/edge (`mainstat` +
  `secondarystat` + `detail__*`): which drive size/color vs. tooltip only.
- **Provisioning + test data.** Add a `provisioning/dashboards/node-graph.json`
  and a static node graph fixture (or a data source that emits the frame pair) to
  exercise the panel, per the repo's provisioning rule.
