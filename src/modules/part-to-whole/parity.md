# Part-to-whole (pie) editor option parity

Compares the ECharts **Part-to-whole** module ([module.tsx](./module.tsx)),
rendering `seriesType: pie`, against core Grafana's **Pie chart** panel
([
`public/app/plugins/panel/piechart/module.tsx`](https://github.com/grafana/grafana/blob/main/public/app/plugins/panel/piechart/module.tsx)).

## Design difference

Core Pie chart adds data-reduction options (which value/calculation per slice)
plus pie-specific display options (type, sorting, labels, legend values). This
module now shares core's data-reduction model: it registers the standard **Value
options** (`addStandardDataReduceOptions`) and resolves slices through Grafana's
`getFieldDisplayValues` (see `resolvePieSlices`), so reduction, multi-frame
handling, display name, color, and unit/decimals formatting are all owned by
Grafana. Multiple series/frames (e.g. one frame per Prometheus series) each become
a slice. Pie-specific _display_ options (type, sorting, labels, legend values)
remain unexposed.

Long-shaped data is reshaped to wide upstream with a Grafana transform (**Rows to fields** or **Group
by**) — see the `provisioning/dashboards/part-to-whole/` demos.

## Panel options

| Core Grafana option                           | ECharts equivalent                                                                                                            | Status        |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------- |
| Value / calculation (data reduce)             | `reduceOptions` (Calculate/All values + Calculation) via `addStandardDataReduceOptions`                                       | Supported     |
| Fields to include, limit                      | `reduceOptions.fields` / `reduceOptions.limit`                                                                                | Supported     |
| Pie chart type (Pie / Donut)                  | `pieType` radio in a "Pie" category; rendered as the series radius by `getPieRadius`                                          | Supported     |
| Slice sorting (asc/desc/none)                 | `sort` select in the "Pie" category; orders the shared slice model in `resolvePieSlices` (default desc)                       | Supported     |
| Labels (Percent / Name / Value)               | `displayLabels` multi-select in a "Labels" category; rendered by `getPieContentLabel`                                         | Supported     |
| Arc start / end angle (ECharts-only)          | `startAngle` / `endAngle` number inputs in the "Pie" category (Advanced); half-pie / semicircle donut via `getPieAngles`      | Advanced      |
| Label font size (ECharts-only)                | `labelFontSize` number input ("Labels", Advanced); threads into `getPieLabelStyle`                                            | Advanced      |
| Label overflow / width (ECharts-only)         | `labelOverflow` select + `labelWidth` ("Labels", Advanced); `label.overflow`/`label.width` via `getPieLabelStyle`             | Advanced      |
| Min angle to show label (ECharts-only)        | `minShowLabelAngle` number input ("Labels", Advanced); `series.minShowLabelAngle` via `getPieMinShowLabelAngle`               | Advanced      |
| Percent precision (ECharts-only)              | `percentPrecision` number input ("Labels", Advanced); decimals in `sliceShare` (default 1 = `33.3%`)                          | Advanced      |
| Slice separation border (ECharts-only)        | `sliceBorderWidth` + `sliceBorderColor` (color picker) ("Pie", Advanced); `itemStyle` border via `getPieItemStyle`            | Advanced      |
| Custom radius / center (ECharts-only)         | `outerRadius`/`innerRadius`/`centerX`/`centerY` ("Pie", Advanced); `series.radius`/`center` via `getPieRadius`/`getPieCenter` | Advanced      |
| Tooltip: mode                                 | `tooltip.mode`                                                                                                                | Supported     |
| Tooltip: hide zeros, sort                     | none                                                                                                                          | Not supported |
| Legend: visibility, mode, placement, width    | Grafana legend via `addLegendOptions`                                                                                         | Supported     |
| Legend: slice show/hide + color (interactive) | Per-slice toggle; converter reads the `hideSeriesFrom` (visibility) and `byName` (color) overrides by name                    | Supported     |
| Legend values (Percent / Value)               | none                                                                                                                          | Not supported |

## Standard (field-config) options

| Option                                                                       | Core Pie                                     | ECharts Part-to-whole                     |
| ---------------------------------------------------------------------------- | -------------------------------------------- | ----------------------------------------- |
| Color scheme                                                                 | Kept (bySeries, gradient, seeded fixedColor) | Kept (PaletteClassic, byValue + bySeries) |
| Thresholds                                                                   | Disabled                                     | Kept                                      |
| Unit, Decimals, Min, Max, Display name, No value, Value mappings, Data links | Kept                                         | Kept                                      |

## Notes / gaps

- Slice labels (Name / Value / Percent) are supported via the "Labels" option,
  donut rendering via the "Pie" > Pie chart type option, and slice sorting via the
  "Pie" > Slice sorting option. Legend values (Percent / Value) are the main
  missing pie-specific option.
- ECharts-only roadmap: this module's family also covers funnel/gauge render
  types (not yet implemented).
- Editor options are tiered via the shared `editorMode` option (Default =
  parity-only, Advanced = ECharts extras, API = JSON-only). The core-parity pie
  options (type, sorting, labels, legend, reduce options) are Default. ECharts-only
  extras are gated behind Advanced (`showIf: isAdvancedEditorMode`, each omitted at
  its default): **Rose type** (Nightingale: Radius / Area, `roseType` via
  `getPieRoseType`), **Min slice angle** (`minAngle`, degrees, via `getPieMinAngle`,
  enlarges tiny long-tail slices so they stay visible/clickable), **Start angle** /
  **End angle** (`startAngle` / `endAngle` via `getPieAngles`, enabling half-pie /
  semicircle-donut layouts), **Label position** (`labelPosition` →
  `label.position`: Outside / Inside / Center), and the Tier 2 legibility options —
  **Label font size**, **Label overflow/width**, **Min-angle-to-show-label**,
  **Percent precision**, **Slice separation border**, and **Custom radius/center**.
  See [docs/options-modes.md](../../../docs/options-modes.md) and the
  `pie-legibility.json` demo.

## ECharts API support

High-level [ECharts option](https://echarts.apache.org/en/option.html) components
used by this module. See [echarts.ts](../../lib/echarts/echarts.ts) for the
registered runtime surface.

| ECharts API                                                                                              | Status          | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------------------------------------------------------------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `series` (pie)                                                                                           | Partial         | `seriesType: pie`; slice labels (Name/Value/Percent) via `label`; label placement (Outside/Inside/Center) via `label.position` (Advanced `labelPosition`); pie/donut via `radius`; sorting via the resolver; rose (Nightingale) type (Radius/Area) via `roseType` (Advanced); min slice angle via `minAngle` (Advanced); arc range via `startAngle`/`endAngle` (Advanced). Advanced also adds `label.fontSize`/`overflow`/`width`, `minShowLabelAngle`, percent precision, `itemStyle` border, and custom `radius`/`center`. |
| `legend`                                                                                                 | Supported       | Grafana DOM legend (`addLegendOptions`); native legend hidden. Interactive per-slice show/hide (via `hideSeriesFrom`) + color (via `byName`) read directly by category.                                                                                                                                                                                                                                                                                                                                                      |
| `tooltip`                                                                                                | Supported       | Grafana-styled; mode maps to `trigger` (item / none).                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `animation`                                                                                              | Supported       | ECharts defaults (enabled).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `color` / `textStyle`                                                                                    | Supported       | Derived from the Grafana theme.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `grid` / `xAxis` / `yAxis`                                                                               | Not implemented | Pie has no cartesian coordinate system.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `visualMap` / `markLine` / `markArea` / `axisPointer` / `brush` / `dataZoom`                             | Not implemented | Cartesian-oriented components; N/A for pie.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `toolbox` / `dataset` / `title` / `graphic` / `timeline` / `aria`                                        | Not implemented | Not registered.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Other coordinate systems (`polar` / `radar` / `parallel` / `singleAxis` / `geo` / `calendar` / `matrix`) | Not implemented | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
