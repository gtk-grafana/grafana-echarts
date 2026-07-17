# XY chart (scatter) editor option parity

Covers the ECharts **Cartesian** module ([../module.tsx](../module.tsx)) rendering
`seriesType: scatter` / `effectScatter`, compared against core Grafana's **XY
Chart** panel
([`public/app/plugins/panel/xychart/module.tsx`](https://github.com/grafana/grafana/blob/main/public/app/plugins/panel/xychart/module.tsx)).

See [timeseries.md](./timeseries.md) for the shared-module note: scatter is one
render type of the family-fixed Cartesian panel, selected per field via
`seriesType`.

## Design difference

Core XY Chart is built around explicit **series mapping**: the user maps X and Y
(and optional size/color) fields per series, either automatically or manually.
This module plots numeric fields against the frame's time/first field like the
other cartesian render types; it has no X/Y field-mapping editor.

## Panel options

| Core Grafana option                            | ECharts equivalent                                                                                     | Status        |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------- |
| Series mapping (auto/manual)                   | none (fields plotted vs time/first field)                                                              | Not supported |
| Series editor (per-series X/Y/size/color/name) | none                                                                                                   | Not supported |
| Point size / size field                        | none                                                                                                   | Not supported |
| Color by field                                 | none (Color field config)                                                                              | Partial       |
| Tooltip: mode                                  | `tooltip.mode`                                                                                         | Supported     |
| Legend                                         | Grafana legend via `addLegendOptions`; interactive show/hide + color persist as field-config overrides | Supported     |

## Standard (field-config) options

Both keep the full standard field-config set; this module customizes only Color.
Core XY additionally provides scatter-specific custom field config (point shape,
line style) that this module does not expose.

## Notes / gaps

- The core XY Chart's X/Y field mapping is its defining feature and is **not**
  supported here — this module treats scatter as a cartesian render variant, not a
  free X/Y mapping surface.
- `effectScatter` (animated points) is an ECharts-only render type with no core
  Grafana counterpart.

## ECharts API support

High-level [ECharts option](https://echarts.apache.org/en/option.html) components
used by this render path. See [echarts.ts](../../../lib/echarts/echarts.ts) for
the registered runtime surface.

| ECharts API                                                                                    | Status          | Notes                                                                                                                           |
| ---------------------------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `series` (scatter / effectScatter)                                                             | Supported       | `seriesType: scatter` / `effectScatter`; no `dataset` / `encode` X/Y field mapping.                                             |
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
| `dataset`                                                                                      | Not implemented | No `dataset` / `encode` X/Y mapping; fields plot vs time/first field.                                                           |
| `toolbox` / `title` / `graphic` / `timeline` / `aria`                                          | Not implemented | Not registered.                                                                                                                 |
| Other coordinate systems (`polar` / `parallel` / `singleAxis` / `geo` / `calendar` / `matrix`) | Not implemented | Cartesian `grid` only.                                                                                                          |
