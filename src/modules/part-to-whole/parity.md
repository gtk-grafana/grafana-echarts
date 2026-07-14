# Part-to-whole (pie) editor option parity

Compares the ECharts **Part-to-whole** module ([module.tsx](./module.tsx)),
rendering `seriesType: pie`, against core Grafana's **Pie chart** panel
([`public/app/plugins/panel/piechart/module.tsx`](https://github.com/grafana/grafana/blob/main/public/app/plugins/panel/piechart/module.tsx)).

## Design difference

Core Pie chart adds data-reduction options (which value/calculation per slice)
plus pie-specific display options (type, sorting, labels, legend values). This
module currently exposes only the shared Grafana legend and a tooltip mode; slice
values come from the categorical converter (first numeric field per category).

## Panel options

| Core Grafana option                        | ECharts equivalent                        | Status        |
| ------------------------------------------ | ----------------------------------------- | ------------- |
| Value / calculation (data reduce)          | none (converter uses first numeric field) | Not supported |
| Fields to include, limit                   | none                                      | Not supported |
| Pie chart type (Pie / Donut)               | none (pie only)                           | Not supported |
| Slice sorting (asc/desc/none)              | none                                      | Not supported |
| Labels (Percent / Name / Value)            | none                                      | Not supported |
| Tooltip: mode                              | `tooltip.mode`                            | Supported     |
| Tooltip: hide zeros, sort                  | none                                      | Not supported |
| Legend: visibility, mode, placement, width | Grafana legend via `addLegendOptions`     | Supported     |
| Legend values (Percent / Value)            | none                                      | Not supported |

## Standard (field-config) options

| Option                                                                       | Core Pie                                     | ECharts Part-to-whole                     |
| ---------------------------------------------------------------------------- | -------------------------------------------- | ----------------------------------------- |
| Color scheme                                                                 | Kept (bySeries, gradient, seeded fixedColor) | Kept (PaletteClassic, byValue + bySeries) |
| Thresholds                                                                   | Disabled                                     | Kept                                      |
| Unit, Decimals, Min, Max, Display name, No value, Value mappings, Data links | Kept                                         | Kept                                      |

## Notes / gaps

- Donut rendering, slice labels, sorting, and legend values are the main missing
  pie-specific options.
- ECharts-only roadmap: this module's family also covers funnel/gauge render
  types (not yet implemented).

## ECharts API support

High-level [ECharts option](https://echarts.apache.org/en/option.html) components
used by this module. See [echarts.ts](../../lib/echarts/echarts.ts) for the
registered runtime surface.

| ECharts API                                                                                              | Status          | Notes                                                                            |
| -------------------------------------------------------------------------------------------------------- | --------------- | -------------------------------------------------------------------------------- |
| `series` (pie)                                                                                           | Partial         | `seriesType: pie`; donut (radius/center), sorting, and slice labels not exposed. |
| `legend`                                                                                                 | Supported       | Grafana DOM legend (`addLegendOptions`); native legend hidden.                   |
| `tooltip`                                                                                                | Supported       | Grafana-styled; mode maps to `trigger` (item / none).                            |
| `animation`                                                                                              | Supported       | ECharts defaults (enabled).                                                      |
| `color` / `textStyle`                                                                                    | Supported       | Derived from the Grafana theme.                                                  |
| `grid` / `xAxis` / `yAxis`                                                                               | Not implemented | Pie has no cartesian coordinate system.                                          |
| `visualMap` / `markLine` / `markArea` / `axisPointer` / `brush` / `dataZoom`                             | Not implemented | Cartesian-oriented components; N/A for pie.                                      |
| `toolbox` / `dataset` / `title` / `graphic` / `timeline` / `aria`                                        | Not implemented | Not registered.                                                                  |
| Other coordinate systems (`polar` / `radar` / `parallel` / `singleAxis` / `geo` / `calendar` / `matrix`) | Not implemented | —                                                                                |
