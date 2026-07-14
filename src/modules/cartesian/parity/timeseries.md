# Time series editor option parity

Covers the ECharts **Cartesian** module ([../module.tsx](../module.tsx)) rendering
`seriesType: line`, compared against core Grafana's **Time series** panel
([`public/app/plugins/panel/timeseries/module.tsx`](https://github.com/grafana/grafana/blob/main/public/app/plugins/panel/timeseries/module.tsx)).

The Cartesian module is family-fixed: line/bar/scatter share one panel and are
selected per field via the `seriesType` override, so this doc, [barchart.md](./barchart.md),
and [xychart.md](./xychart.md) all describe the same module viewed through a
different render type.

## Design difference

Core Time series exposes the full graph field config (draw style, line width,
fill, points, stacking, per-axis config) plus the standard field-config set. This
module keeps the standard field-config set but renders with ECharts' own line
styling defaults, exposing only a small set of per-field overrides.

## Panel options

| Core Grafana option                                | ECharts equivalent                    | Status        |
| -------------------------------------------------- | ------------------------------------- | ------------- |
| Tooltip: mode (Single/All/Hidden)                  | `tooltip.mode`                        | Supported     |
| Tooltip: hover sort, hide zeros, max width         | none (ECharts renders its own box)    | Not supported |
| Legend: visibility, mode, placement, width, values | Grafana legend via `addLegendOptions` | Supported     |
| Legend: series visibility (faceted filter)         | none                                  | Not supported |
| Axis: time zone editor                             | none (timeZone from panel context)    | Not supported |
| Annotations                                        | none                                  | Not supported |

## Graph styles (core custom field config)

| Core Grafana option                                    | ECharts equivalent                 | Status        |
| ------------------------------------------------------ | ---------------------------------- | ------------- |
| Style (lines/bars/points), line interpolation          | `seriesType` (line/bar/scatter)    | Partial       |
| Line width, fill opacity, gradient mode, line style    | none (ECharts defaults)            | Not supported |
| Connect null values, disconnect values                 | none                               | Not supported |
| Show points, point size                                | none                               | Not supported |
| Stack series                                           | per-field `stackSeries` (bar only) | Partial       |
| Axis placement                                         | per-field `axisPlacement`          | Supported     |
| Axis: label, width, soft min/max, scale, centered zero | none                               | Not supported |
| Show thresholds (thresholds style)                     | per-field `thresholdsStyle.mode`   | Supported     |
| Hide in area (viz/legend/tooltip)                      | none                               | Not supported |

## Standard (field-config) options

Both core Time series and this module keep the full standard field-config set
(Color, Unit, Decimals, Min, Max, Display name, No value, Thresholds, Value
mappings, Data links). This module customizes only Color (PaletteClassic,
byValue + bySeries).

## Notes / gaps

- ECharts-only: a single panel can mix cartesian render types per field (e.g. one
  field as `bar` over others as `line`) via the `seriesType` override.
- The bulk of the parity gap is line/point _styling_, which ECharts controls
  internally rather than through Grafana field config.

## ECharts API support

High-level [ECharts option](https://echarts.apache.org/en/option.html) components
used by this render path. See [echarts.ts](../../../lib/echarts/echarts.ts) for
the registered runtime surface.

| ECharts API                                                                                    | Status          | Notes                                                                                    |
| ---------------------------------------------------------------------------------------------- | --------------- | ---------------------------------------------------------------------------------------- |
| `series` (line)                                                                                | Supported       | `seriesType: line`; a panel can mix bar/scatter per field.                               |
| `grid`                                                                                         | Supported       | Single cartesian grid; spacing adapts to stacked y-axes and legend.                      |
| `xAxis` / `yAxis`                                                                              | Supported       | X follows the data (time or category); one y-axis per field unit.                        |
| `tooltip`                                                                                      | Supported       | Grafana-styled; mode maps to `trigger` (item / axis / none).                             |
| `axisPointer`                                                                                  | Partial         | Crosshair via `tooltip.axisPointer`; shared on the time axis, per-item on category axes. |
| `brush`                                                                                        | Partial         | `lineX` drag maps to the dashboard time range; time axis only.                           |
| `markLine` / `markArea`                                                                        | Supported       | Threshold lines / regions on the shared value axis.                                      |
| `legend`                                                                                       | Supported       | Grafana DOM legend (`addLegendOptions`); native legend hidden.                           |
| `animation`                                                                                    | Supported       | ECharts defaults (enabled).                                                              |
| `color` / `textStyle`                                                                          | Supported       | Derived from the Grafana theme.                                                          |
| `visualMap`                                                                                    | Not implemented | Registered for the heatmap family only.                                                  |
| `dataZoom`                                                                                     | Not implemented | Range zoom is delegated to `brush` -> dashboard time range.                              |
| `toolbox` / `dataset` / `title` / `graphic` / `timeline` / `aria`                              | Not implemented | Not registered.                                                                          |
| Other coordinate systems (`polar` / `parallel` / `singleAxis` / `geo` / `calendar` / `matrix`) | Not implemented | Cartesian `grid` only.                                                                   |
