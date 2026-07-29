# ECharts plots for flame graph frames

## Problem

Grafana emits **flame graph** data (a single nested-set frame, see
[../data-plane/flame-graph.md](../data-plane/flame-graph.md)) from profiling
sources (Grafana Pyroscope, ...). The plugin has no converter, chart module, or
registered ECharts series for it. ECharts has **no native flame/icicle series**;
the hierarchy series (`treemap`, `sunburst`, `tree`) exist in the `SeriesType`
union (`src/editor/types.ts`) but are unimplemented and unregistered, while
`custom` (`CustomChart`) is already registered in `src/lib/echarts/echarts.ts`
(used by the binned heatmap).

This doc proposes which ECharts plots fit the frame and how a converter/panel
would map them. No code is written here.

## Proposal

### Shared first step: reconstruct the tree

Every option needs the same converter step. Walk the frame rows **in order** and
build a parent/child tree using `level` as the stack depth (a deeper `level` is a
child of the previous row; an equal/shallower `level` is a sibling). Map:

| Frame field              | Tree node                                      |
| ------------------------ | ---------------------------------------------- |
| `label`                  | node name (resolve enum via display processor) |
| `value`                  | cumulative size (item width)                   |
| `self`                   | retained for tooltip / shading                 |
| `valueRight`/`selfRight` | diff (baseline vs. comparison), when present   |

### Primary: ECharts `custom` series (renderItem)

The only option that faithfully reproduces a flame graph: draw a rectangle per
node, **left-aligned per level**, width proportional to `value`, `y` = `level`
(root at top), ordered by row position
(https://echarts.apache.org/en/option.html#series-custom). Advantages:

- `custom` / `CustomChart` is **already registered** and exercised by the binned
  heatmap, so this reuses an existing pipeline (no new ECharts registration).
- `self` can drive per-block shading; diff coloring can come from
  `valueRight`/`selfRight`.
- Preserves the classic stacked-bar reading and sibling order that native
  hierarchy series discard.

### Secondary fits (native hierarchy series)

| Series     | Mapping                                 | Trade-off                                                            |
| ---------- | --------------------------------------- | -------------------------------------------------------------------- |
| `treemap`  | `value` -> tile size, nested rectangles | Loses the stacked-bar flame reading and left-to-right sibling order. |
| `sunburst` | `value` -> arc sweep, radial icicle     | Radial layout, harder to compare sibling widths.                     |
| `tree`     | node-link layout                        | Least suited to value-weighted profiling; ignores width semantics.   |

These require registering `TreemapChart` / `SunburstChart` / `TreeChart` in
`src/lib/echarts/echarts.ts`; the primary `custom` approach does not.

## Divergences / gaps

- **No native flame/icicle series** — the faithful rendering relies on a `custom`
  `renderItem`, not a first-class series type.
- **`self` has no native mapping** in `treemap`/`sunburst` (they encode only
  cumulative `value`); it is usable only via `custom` shading or tooltip.
- **Panel interactions out of scope** — focus block, sandwich view, grouping /
  collapse of small nodes, and search are Grafana flame-graph panel features, not
  data mappings.
- **Enum labels** — `label` may be an enum field; resolve through its display
  processor rather than reading raw values.
- **Diff profiles** — `valueRight`/`selfRight` coloring needs a diff color scheme;
  a first pass may render the left/baseline side only.

## Implementation sketch

Follows the existing heatmap / node-graph pattern (converter -> chart -> options
-> registry, plus a nested panel):

- New nested panel `src/modules/flamegraph/` (`plugin.json`, `module.tsx`,
  `suggestions.ts`, `img/logo.svg`).
- Converter `src/lib/echarts/converters/flameGraph.ts`: `frameToFlameGraph(frames)`
  rebuilding the tree from `level` order into a chart-agnostic model, plus
  `isFlameGraphFrame(frame)` via `preferredVisualisationType`. Keep it
  Grafana-isolated (no ECharts imports), like `binnedHeatmap.ts`.
- Options `src/lib/echarts/options/flameGraph.ts`: map the tree model to a
  `custom` series (`renderItem` producing per-node rects) — or a
  `treemap`/`sunburst` series if the native path is chosen.
- Chart module `src/lib/echarts/charts/flameGraph.ts`: implement `ChartModule`
  (`buildOption`, `buildLegendItems`, `getTooltipValueFormatter`); add the option
  type to `src/lib/echarts/charts/types.ts`.
- Wire the series type into `src/lib/echarts/charts/registry.ts` and
  `src/editor/constants.ts`.
- Register native hierarchy series in `src/lib/echarts/echarts.ts` **only if** the
  treemap/sunburst/tree path is used (`custom` is already registered).

## Open questions

- **Detection / suggestions.** Flame graph has no `frame.meta.type`, so
  `PanelDataSummary.hasDataFrameType` cannot see it. The supplier must inspect
  `preferredVisualisationType === 'flamegraph'` — a signal the current suggestion
  path does not expose (may require raw frame access beyond `PanelDataSummary`).
- **Custom vs. native for the first pass** — ship the faithful `custom` flame
  graph, or start with a native `treemap`/`sunburst` for lower effort?
- **Surfacing `self` and diff** — tooltip content, block shading, and diff color
  scheme.
- **Performance** — collapsing small-`value` nodes (as the Grafana panel does)
  for large profiles.
- **Provisioning + test data.** Add a `provisioning/dashboards/flame-graph.json`
  and a static flame-graph fixture (or a source that emits the nested-set frame)
  to exercise the panel, per the repo's provisioning rule.
