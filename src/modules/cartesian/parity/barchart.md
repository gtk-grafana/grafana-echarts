# Bar chart editor option parity

Covers the ECharts **Cartesian** module ([../module.tsx](../module.tsx)) rendering
`seriesType: bar`, compared against core Grafana's **Bar chart** panel
([`public/app/plugins/panel/barchart/module.tsx`](https://github.com/grafana/grafana/blob/main/public/app/plugins/panel/barchart/module.tsx)).

See [timeseries.md](./timeseries.md) for the shared-module note: bar is one render
type of the family-fixed Cartesian panel, selected per field via `seriesType`.

## Design difference

Core Bar chart adds many bar-specific panel options (orientation, bar/group
width, radius, value labels, x-axis tick handling) on top of the graph field
config. This module now exposes a curated set of these under the **Advanced**
editor tier (plus a Default-tier "Show values"); orientation, group width, and
3-way (percent) stacking remain deferred.

## Panel options

| Core Grafana option                           | ECharts equivalent                                        | Status        |
| --------------------------------------------- | --------------------------------------------------------- | ------------- |
| X Axis field picker                           | none (x derived from time/first field)                    | Not supported |
| Orientation (auto/horizontal/vertical)        | none (vertical)                                           | Not supported |
| Rotate x tick labels, max length, min spacing | `xAxis.axisLabel.rotate` (`xTickRotate`, Advanced)        | Partial       |
| Show values (auto/always/never)               | `series.label` (`showValues` Default + position Advanced) | Supported     |
| Stacking (none/normal/percent)                | per-field `stackSeries` (boolean)                         | Partial       |
| Group width, bar width, bar radius            | `barWidth` / `itemStyle.borderRadius` (Advanced)          | Partial       |
| Highlight full area on hover                  | none                                                      | Not supported |
| Color by field                                | none (Color field config)                                 | Partial       |
| Tooltip: mode                                 | `tooltip.mode`                                            | Supported     |
| Legend                                        | Grafana legend via `addLegendOptions`                     | Supported     |
| Animation                                     | `animation.enabled` (Advanced)                            | Supported     |
| Text size                                     | none                                                      | Not supported |

## Graph styles (core custom field config)

| Core Grafana option                     | ECharts equivalent                                  | Status        |
| --------------------------------------- | --------------------------------------------------- | ------------- |
| Line width, fill opacity, gradient mode | `lineStyle.width` / `areaStyle.opacity` (Advanced)  | Partial       |
| Point size                              | `symbolSize` / `showSymbol` (`pointSize`, Advanced) | Supported     |
| Transform (constant / negative Y)       | none                                                | Not supported |
| Show thresholds (thresholds style)      | per-field `thresholdsStyle.mode`                    | Supported     |
| Axis placement                          | per-field `axisPlacement`                           | Supported     |
| Axis: label, width, soft min/max, scale | none                                                | Not supported |
| Hide in area                            | `custom.hideFrom` (via `addHideFrom`)               | Partial       |

## Standard (field-config) options

Both keep the full standard field-config set; this module customizes only Color.
Note the per-field `stackSeries` switch is shown only when a field's `seriesType`
override is `bar`.

## Notes / gaps

- Core stacking is a three-way mode (none/normal/percent); this module exposes a
  boolean per-field stack (percent stacking is not supported).
- Bar geometry: width (`barWidth`) and corner radius (`itemStyle.borderRadius`) are
  now exposed under the Advanced editor tier; group spacing and orientation remain
  ECharts-managed / deferred.
- Value labels, line width, fill opacity, point size, and x-tick rotation are
  exposed under the Advanced tier (Show values is Default-tier). Each omits its
  ECharts key at the default, so untouched panels render unchanged.
- Interactive legend: clicking a legend item shows/hides its series and the legend
  color picker sets a fixed color; color persists as a `byName` override and
  visibility as the core `hideSeriesFrom` system override.
  **Hide in area** registers all three toggles but only `viz` is honored.

## ECharts API support

High-level [ECharts option](https://echarts.apache.org/en/option.html) components
used by this render path. See [echarts.ts](../../../lib/echarts/echarts.ts) for
the registered runtime surface.

| ECharts API                                                                                    | Status          | Notes                                                                                                                           |
| ---------------------------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `series` (bar)                                                                                 | Supported       | `seriesType: bar`; per-field boolean stacking (percent not supported).                                                          |
| `grid`                                                                                         | Supported       | Single cartesian grid; spacing adapts to stacked y-axes and legend.                                                             |
| `xAxis` / `yAxis`                                                                              | Supported       | X follows the data (time or category); one y-axis per field unit.                                                               |
| `tooltip`                                                                                      | Supported       | Grafana-styled; mode maps to `trigger` (item / axis / none).                                                                    |
| `axisPointer`                                                                                  | Partial         | Crosshair via `tooltip.axisPointer`; shared on the time axis, per-item on category axes.                                        |
| `brush`                                                                                        | Partial         | `lineX` drag maps to the dashboard time range; time axis only.                                                                  |
| `markLine` / `markArea`                                                                        | Supported       | Threshold lines / regions on the shared value axis.                                                                             |
| `legend`                                                                                       | Supported       | Grafana DOM legend (`addLegendOptions`); native legend hidden. Interactive show/hide + color persist as field-config overrides. |
| `animation`                                                                                    | Supported       | ECharts defaults (enabled).                                                                                                     |
| `color` / `textStyle`                                                                          | Supported       | Derived from the Grafana theme.                                                                                                 |
| `visualMap`                                                                                    | Not implemented | Registered for the heatmap family only.                                                                                         |
| `dataZoom`                                                                                     | Not implemented | Range zoom is delegated to `brush` -> dashboard time range.                                                                     |
| `toolbox` / `dataset` / `title` / `graphic` / `timeline` / `aria`                              | Not implemented | Not registered.                                                                                                                 |
| Other coordinate systems (`polar` / `parallel` / `singleAxis` / `geo` / `calendar` / `matrix`) | Not implemented | Cartesian `grid` only.                                                                                                          |
