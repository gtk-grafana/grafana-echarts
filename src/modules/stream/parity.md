# Stream (theme river + bubble) editor option parity

Covers the ECharts **Stream** module ([module.tsx](./module.tsx)), which renders two
variants on the ECharts `singleAxis` coordinate system from one layer model
([data-plane/stream.md](../../../data-plane/stream.md)):

| Variant    | ECharts                                                | Reads as                                                                 |
| ---------- | ------------------------------------------------------ | ------------------------------------------------------------------------ |
| **River**  | one `themeRiver` over one axis                         | how a composition changed over time — stacked ribbons on a shared spine  |
| **Bubble** | one `scatter` per layer, each on its own axis, stacked | what happened when and how big it was — a punch-card / activity timeline |

Both read the _same_ `StreamData`, so the "Chart type" radio re-renders one dataset
coherently (as radar↔parallel do over the categorical model).

## No core Grafana equivalent

Grafana core has **no stream graph**. The closest thing is a **stacked-area time
series**, and the two answer different questions: an area chart keeps a value axis
and a flat baseline, so it reads absolute totals well and composition badly past
about four series; a theme river centres each band on a shared spine, so relative
composition over time is the thing you see. There is therefore no
option-for-option parity target — this doc records what the module exposes,
compares against ECharts semantics, and is explicit about what is inert.

Core has **no punch-card timeline** either. A heatmap is the nearest read and a
different one: it bins observations into cells and encodes by color, where the
bubble variant plots each observation and encodes by area — so sparse, event-shaped
data (deploys per service, errors per endpoint) stays legible instead of being
flattened into a bin.

`provisioning/dashboards/stream/themeriver-basic.json` puts the river beside core's
stacked area, and `bubble-timeline.json` puts the two variants beside each other on
one dataset, so both comparisons are direct.

## Why the variant is not `seriesType`

Every other multi-variant family (pie↔funnel, treemap↔sunburst, radar↔parallel)
carries its variant in the shared panel-level `seriesType`. This one **cannot**, and
that is the single most load-bearing design decision in the module.

`seriesType` is the plugin's routing key: `resolveChartModule` maps it to a chart
module, and its values are ECharts series names each owned by exactly one family.
`scatter` is already owned by **cartesian**
(`isCartesianSingleValueSeriesType`), so a stream panel with
`seriesType: 'scatter'` would resolve to `cartesianChartModule` and render a
cartesian scatter chart. Making the registry family-aware instead would have meant
`scatter` meaning two different things across five shared surfaces —
`resolveChartModule`, `supportedChartSeriesTypes` (which would list it twice),
`panelTypeToAxis`, `applyEditorModeDefaults`, and the per-field
`EChartsFieldConfig.seriesType` override — and would break the one-row-per-type
premise of [echarts-coverage.md](../../../data-plane/echarts-coverage.md)'s master
table.

So the family keeps `themeRiver` as its single routing token and the variant lives in
a family-local `streamChartType`. The cost is one inconsistency with the other
families; the alternative was reworking the plugin's central routing invariant for
one optional variant.

## Bubble variant render notes

- **One `singleAxis` per layer, stacked**, all pinned to the same time window — rows
  are only comparable if they share an x extent. Only the **last** row draws tick
  labels; N identical sets would be noise.
- **Rows are laid out in percentages**, not px: the option build never sees the
  panel's pixel size (`useChartOption` memoizes it away so a resize does not rebuild
  the option), and a proportional stack also degrades gracefully as rows are added.
- **Each row's rect is deliberately near-flat**, so the row _is_ its baseline.
  `Single.dataToPoint` centres every point on the rect's cross extent
  (`rect.y + rect.height / 2`) while the axis line — and with it the axis `name` —
  is drawn at the rect's edge, so a tall rect floats the bubbles half a rect above
  their own row label. Collapsing the rect makes centre and edge coincide.
- **Size encodes by area**: diameter grows with the square root of the value, so a
  value four times larger covers four times the ink rather than sixteen. A
  non-positive value (which includes the family's null-becomes-zero rule) draws
  nothing at all — on a punch card, absence of ink is the honest reading of "nothing
  happened".
- **The size scale is shared across rows**, not per row. A per-row scale would make
  the chart unreadable in exactly the way it is meant to be read: every row's own
  maximum would draw at full size.
- **A tiny nonzero value is floored** to a visible diameter. Without a floor an area
  scale collapses small-but-real observations to sub-pixel dots that read as missing
  data — which would be actively wrong here, since a genuine zero is the thing that
  draws nothing.
- **A hidden layer drops its axis too**, not just its series, or the stack would
  leave an empty labelled row behind.
- **`effectScatter` is not offered.** Only `ScatterSeriesModel` declares `singleAxis`
  among its `dependencies`; `EffectScatterSeriesModel.dependencies` is
  `['grid', 'polar']`. (The roadmap plan listed both as single-axis capable; only
  `scatter` is.)

## Data model

Two frame shapes, detected per frame by **field shape only** (never `meta.type`):

| Shape                                            | Layer identity                                         | Typical source                                              |
| ------------------------------------------------ | ------------------------------------------------------ | ----------------------------------------------------------- |
| time field + **N numeric** fields                | one layer per numeric field (display name)             | Prometheus / Loki range query, SQL "Format as: Time series" |
| time field + **1 numeric** + **≥1 string** field | one layer per distinct value of the first string field | SQL `GROUP BY time, dim`; any SQL expression output         |

Every frame in the response is read, so a one-frame-per-series
(`TimeSeriesMulti`) reply needs no join. The **"Layers from"** radio overrides the
guess, because the ambiguous case is real: a SQL table of `time, level, count,
errors` legitimately means either "two metrics" or "one metric per level".

The contract that differs most from every other family: **missing ⇒ 0**. A stacked
ribbon has no way to draw a hole, so `null` becomes `0` and **a data outage reads
as a legitimate zero**. See [Notes / gaps](#notes--gaps).

## Editor options

The **Variant** column says which render each option reaches; an option that does
not apply to the selected variant is hidden rather than left inert.

| Area                  | ECharts Stream                                            | Variant | Notes                                                                                                                                                            |
| --------------------- | --------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Editor mode           | Default / Advanced radio                                  | both    | Default shows the Default-tier rows; Advanced adds the rest. `applyStreamEditorModeDefaults` resets every Advanced value in Default mode                         |
| Chart type            | River / Bubble (Default)                                  | both    | Family-local `streamChartType`, **not** the shared `seriesType` — see [Why the variant is not `seriesType`](#why-the-variant-is-not-seriestype)                  |
| Layers from           | `Auto` / `Fields` / `Labels` (Default)                    | both    | Which column becomes a layer; read by `frameToStream`. Default-tier because it is the difference between a real stream and one flat ribbon                       |
| Layer labels          | `series.label.show` (Default)                             | river   | **Off by default**, unlike ECharts. Themed when on (Grafana font + text color, no ECharts shadow/stroke). The bubble names each row with its axis `name` instead |
| Layer label offset    | `series.label.margin` (Advanced)                          | river   | Horizontal offset left of the ribbon start; negative moves the label onto the band. The family's _only_ working placement lever — see Notes                      |
| Layer label font size | `series.label.fontSize` (Advanced)                        | river   | Empty leaves ECharts' own 11px for this series (its `defaultOption` bakes one in, unlike pie)                                                                    |
| Boundary gap          | `series.boundaryGap` (Advanced)                           | river   | Orthogonal padding above and below the ribbons, as a percentage of the plot height. One value for both sides; omitted at ECharts' 10%                            |
| Ribbon opacity        | `series.itemStyle.opacity` (Advanced)                     | river   | 0–100 scaled to ECharts' 0–1. Empty is fully opaque                                                                                                              |
| Ribbon border         | `series.itemStyle.borderWidth` / `borderColor` (Advanced) | river   | A stroke around each band, which is how two similarly-colored neighbours are told apart. The color only shows once a width is set                                |
| Max bubble size       | `series-scatter.symbolSize` (Advanced)                    | bubble  | Diameter of the layer set's largest value; everything scales down by area. The one knob trading legibility against crowding                                      |
| Hover emphasis        | `series.emphasis.focus` (Advanced)                        | both    | `Self` fades the other ribbons — or the other rows — which is how you follow one layer through a busy chart                                                      |
| Legend                | Grafana legend via `addLegendOptions`                     | both    | One item per layer, in layer order, with the layer's color. Interactive show/hide + color persist as field-config overrides                                      |
| Tooltip: mode         | `tooltip.mode` (Single / Hidden)                          | both    | **All is withdrawn** — see the TODO in Notes                                                                                                                     |
| Animation             | `animation.enabled` (Advanced)                            | both    | **Off by default** for every family; opt in via the Advanced switch or panel JSON                                                                                |

Every Advanced option **omits its ECharts key at its default**, so an untouched
panel's series option carries no `boundaryGap`, `itemStyle` or `emphasis` at all.
`label` is the one deliberate exception: ECharts shows layer labels by default, so
"off" has to be an explicit `show: false`.

## Standard (field-config) options

Keeps the full standard field-config set, customizing only Color (PaletteClassic,
byValue + bySeries) — no option is hidden. Several are inert, and that is recorded
here rather than papered over by removing the control:

| Standard option    | Applies          | Behaviour                                                                                                                                                                                  |
| ------------------ | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Color scheme**   | Yes              | Ribbon color. Fields path: per-field color via `getSeriesColor`. Labels path: the classic palette by layer index. **By-value schemes are inert** — a ribbon is a whole series, not a value |
| **Unit**           | Yes              | Tooltip values, per layer, on the fields path                                                                                                                                              |
| **Decimals**       | Yes              | As Unit                                                                                                                                                                                    |
| **Display name**   | Fields path only | Becomes the layer name. On the labels path the layer name is a data _value_, so it is not overridable                                                                                      |
| **No value**       | Partly           | The contract already maps missing ⇒ `0`; the No-value string can only surface in the tooltip                                                                                               |
| **Data links**     | Fields path only | Pinned-tooltip footer, resolved from the layer's field. A labels-path layer has no field, so no footer                                                                                     |
| **Value mappings** | Tooltip only     | Ribbon geometry is numeric; a mapped display value cannot change a ribbon's width                                                                                                          |
| **Min / Max**      | **Inert**        | There is no exposed value axis — the orthogonal extent _is_ the stacked total                                                                                                              |
| **Thresholds**     | **Inert**        | No grid to draw a `markLine` / `markArea` on; the plugin's `thresholdsStyle` is cartesian-only                                                                                             |

## Notes / gaps

- **Missing data reads as zero.** The single most important thing to know about
  this panel. `null` ⇒ `0` because a stacked ribbon cannot break the way a line
  can, and ECharts agrees: `ThemeRiverSeriesModel.fixData` zero-fills any
  `(layer, time)` pair absent from the data. There is no code workaround — the
  render simply has no vocabulary for a hole. An outage and a real zero look
  identical.
- **Negative values distort the baseline** and are passed through unclamped, so
  ribbons cross and the stack stops reading as a total. Shown on purpose in
  `themeriver-edge-cases.json` so nobody debugs it twice.
- **Duplicate `(layer, time)` rows are summed** on the labels path — the only
  aggregation consistent with stacking. Core's **Group by** transform is the
  explicit alternative, and `themeriver-long.json` demonstrates it.
- **`series.label.position` is inert in ECharts 6.1.0**, which is why the editor
  offers an offset instead of a Left/Right radio. `ThemeRiverView` calls
  `polygon.setTextConfig({ position: null })` and then assigns
  `labelEl.x = textLayout.x - margin` by hand, under its own
  `// TODO More label position options.` — so `margin` is the only lever that
  moves a label. The canvas matrix caught this: a position case rendered
  byte-identically to the labels-on case.
- **An explicit `undefined` is not the same as omitting a key.**
  `SeriesModel.mergeDefaultAndTheme` folds in `defaultOption` with zrender's
  `merge(target, source, overwrite = false)`, which copies a default only when
  `!(key in target)`. So `boundaryGap: undefined` _defeats_ the `['10%', '10%']`
  default instead of falling back to it, and `themeRiverLayout` then throws
  indexing `boundaryGap[0]`. The builders return `undefined` and
  `getThemeRiverSeries` spreads them conditionally.
- **Tooltip All is withdrawn.** ECharts builds an axis-triggered tooltip from the
  _global_ tooltip model (`_showAxisTooltip` in `component/tooltip/TooltipView`),
  never the series-level formatter this family attaches — so in Multi mode the
  generic model would run and read each `[time, value, name]` triple's last
  element as the magnitude, printing the layer name where the value belongs.
  Single mode goes through `buildStreamTooltipModel` and is correct. Restoring All
  needs an axis-mode row model for the family.
- **No drag-to-zoom.** `BrushComponent` covers cartesian `grid` axes, and this
  family renders on a `singleAxis` with no grid for the brush to attach to, so the
  cursor is suppressed (`disableTimeBrush`) rather than shipped dead.
- **Ribbon colors ride on the series palette, not `itemStyle`.** themeRiver
  defaults to `colorBy: 'data'` and resolves each item's color through
  `getColorFromPalette(name, …)`, which caches by name — so handing it the layer
  colors in layer order paints each ribbon with its Grafana color. Setting
  `itemStyle.color` would clear `colorFromPalette` and paint every ribbon alike,
  so the ribbon-style option deliberately never sets one. A hidden layer must
  leave the palette _and_ the data together, or every ribbon after it shifts color.
- **Cardinality is not capped at render time.** A high-cardinality query (Prometheus
  by pod) makes an unreadable 100-layer river. Nothing truncates silently. The
  suggestion scorer withholds the _card_ outside `[STREAM_MIN_LAYERS,
STREAM_MAX_LAYERS]` (2–20, in `src/lib/echarts/charts/suggestionLimits.ts`) — the
  ceiling this bullet described before it existed — but a panel selected by hand
  still renders every layer, and the top-N + "other" SQL expression recipe is
  documented in [stream-sources.md](../../../data-plane/stream-sources.md).
- **Layer labels take the theme text color, not a per-ribbon contrast color.**
  Pie picks a readable color per slice for its `inside` labels
  (`resolvePieLabelColor` → `theme.colors.getContrastText`); this family cannot.
  `label` is a _series_-level option and themeRiver emits one series for every
  ribbon, so a per-layer label color would have to ride on the data item — which
  `ThemeRiverSeriesModel.getInitialData` drops outright (it filters raw arrays by
  `dataItem[2] !== undefined`, so an object item never survives). The consequence
  is that a label sitting on a light ribbon in the dark theme reads poorly; the
  workaround is the Advanced offset, which moves it clear of the fill.
- **Layer labels keep ECharts' 11px unless overridden**, because
  `ThemeRiverSeriesModel.defaultOption` bakes a `fontSize` in (pie's does not, so
  pie inherits the theme). The Advanced font size is how you match the rest of the
  panel's text.
- **The bubble variant is the one place the family shows gaps honestly.** The river's
  null-becomes-zero rule pinches a ribbon shut, which reads as a quiet period rather
  than as no data; the bubble simply draws nothing. When "did anything happen here?"
  is the question, the punch card is the variant that answers it.
- **Cardinality bites the bubble variant sooner.** Rows divide the panel height, so
  20 layers give each row a few pixels — worse than 20 thin ribbons, which at least
  stay contiguous. The same top-N recipe applies.

## ECharts API support

High-level [ECharts option](https://echarts.apache.org/en/option.html) components
used by this module. See [echarts.ts](../../lib/echarts/echarts.ts) for the
registered runtime surface.

| ECharts API                                                                    | Status          | Notes                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------ | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `series` (themeRiver)                                                          | Supported       | River variant. `[time, value, name]` triples; Default labels + Advanced offset / font size / boundary gap / ribbon style / emphasis.                                                                                              |
| `series` (scatter)                                                             | Supported       | Bubble variant. `[time, value]` pairs, one series per layer on `coordinateSystem: 'singleAxis'`; area-encoded `symbolSize`.                                                                                                       |
| `singleAxis` (coordinate system)                                               | Supported       | A time axis pinned to the dashboard time range. One for the river (which reuses its box, so it carries the panel padding), one **per layer** for the bubble stack. `splitLine` off.                                               |
| `legend`                                                                       | Supported       | Grafana DOM legend (`addLegendOptions`); native legend hidden. Show/hide + color persist as field-config overrides. Shared by both variants unchanged.                                                                            |
| `tooltip`                                                                      | Supported       | React `@grafana/ui` `VizTooltip` overlay via a per-variant model (`buildStreamTooltipModel` / `buildStreamBubbleTooltipModel` — the river indexes layers by flat `dataIndex`, the bubble by `seriesIndex`). Single / Hidden only. |
| `animation`                                                                    | Supported       | Off by default for every family; opt in via the Advanced switch or `animation.enabled` in panel JSON.                                                                                                                             |
| `color` / `textStyle`                                                          | Supported       | Derived from the Grafana theme. The river feeds layer colors as the series palette in layer order; the bubble sets each series' `itemStyle.color` directly (scatter is `colorBy: 'series'`).                                      |
| `series` (effectScatter)                                                       | Not implemented | `EffectScatterSeriesModel.dependencies` is `['grid', 'polar']` — no `singleAxis` support, unlike `scatter`.                                                                                                                       |
| `grid` / `xAxis` / `yAxis`                                                     | Not implemented | This family uses `singleAxis`, not a cartesian grid.                                                                                                                                                                              |
| `brush` / `dataZoom` / `axisPointer`                                           | Not implemented | No grid to attach to; drag-to-zoom is explicitly gated off.                                                                                                                                                                       |
| `visualMap` / `markLine` / `markArea`                                          | Not implemented | Cartesian-oriented; there is no value axis here for thresholds to live on.                                                                                                                                                        |
| `dataset`                                                                      | Not implemented | `ThemeRiverSeriesModel.getInitialData` reads `option.data` directly, so this series can never see a `dataset` + `encode`.                                                                                                         |
| `toolbox` / `title` / `graphic` / `timeline` / `aria`                          | Not implemented | Not registered.                                                                                                                                                                                                                   |
| Other coordinate systems (`polar` / `parallel` / `radar` / `geo` / `calendar`) | Not implemented | —                                                                                                                                                                                                                                 |
