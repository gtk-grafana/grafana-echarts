# Box plot editor option parity

Covers the ECharts **Cartesian** module ([../module.tsx](../module.tsx)) rendering
`seriesType: boxplot`.

## No core Grafana equivalent

Grafana core has **no box plot panel**, so there is no parity target. This doc
records the ECharts-only status rather than comparing option-for-option.

## Current support status

Box plot is a **multi-value** cartesian render type: each x position carries the
five-number summary (min, Q1, median, Q3, max). The render path exists in the
chart module (`buildMultiValueOption` in
[../../../lib/echarts/charts/cartesian.ts](../../../lib/echarts/charts/cartesian.ts),
fed by
[../../../lib/echarts/converters/multiValueCartesian.ts](../../../lib/echarts/converters/multiValueCartesian.ts)),
but there is currently **no editor option to select it**: the per-field
`seriesType` override only offers line/bar/scatter/effectScatter
(`cartesianOverrideOptions`), and the module has no panel-level series-type
picker.

Unlike candlestick's OHLC convention, box plot has **no Grafana-native field
convention**; the five-number mapping is defined entirely by this plugin's
converter.

## Options

| Area                          | Status                                        |
| ----------------------------- | --------------------------------------------- |
| Render type selection         | Not exposed in editor                         |
| Five-number field mapping     | Inferred in converter; no editor UI           |
| Tooltip mode                  | `tooltip.mode` applies if boxplot is rendered |
| Legend                        | Grafana legend via `addLegendOptions`         |
| Standard field-config options | Full set kept (Color customized)              |

## Notes / gaps

- Purely ECharts-side. There is no core panel to reach parity with; any future
  work is about exposing a render-type selector and documenting the five-number
  field convention.

## ECharts API support

High-level [ECharts option](https://echarts.apache.org/en/option.html) components
used by this render path. See [echarts.ts](../../../lib/echarts/echarts.ts) for
the registered runtime surface.

| ECharts API                                                                                    | Status          | Notes                                                                                                                                                                                                   |
| ---------------------------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `series` (boxplot)                                                                             | Partial         | Render path only, not editor-selectable (no render-type picker).                                                                                                                                        |
| `grid`                                                                                         | Supported       | Single cartesian grid; spacing adapts to the legend.                                                                                                                                                    |
| `xAxis` / `yAxis`                                                                              | Supported       | Category x (ISO-timestamp labels); single shared value axis.                                                                                                                                            |
| `tooltip`                                                                                      | Supported       | Grafana-styled; category axis uses per-item `trigger`.                                                                                                                                                  |
| `axisPointer`                                                                                  | Partial         | Per-item crosshair only (category axis has no shared pointer).                                                                                                                                          |
| `brush`                                                                                        | Partial         | `lineX` drag maps category indices back to the dashboard time range.                                                                                                                                    |
| `markLine` / `markArea`                                                                        | Supported       | Threshold lines / regions on the shared value axis.                                                                                                                                                     |
| `legend`                                                                                       | Supported       | Grafana DOM legend (`addLegendOptions`); native legend hidden. Interactive show/hide (via the core `hideSeriesFrom` byNames override) + color (via `byName`) read directly (per series, not per field). |
| `animation`                                                                                    | Supported       | ECharts defaults (enabled).                                                                                                                                                                             |
| `color` / `textStyle`                                                                          | Supported       | Derived from the Grafana theme.                                                                                                                                                                         |
| `visualMap`                                                                                    | Not implemented | Registered for the heatmap family only.                                                                                                                                                                 |
| `dataZoom`                                                                                     | Not implemented | Range zoom is delegated to `brush` -> dashboard time range.                                                                                                                                             |
| `toolbox` / `dataset` / `title` / `graphic` / `timeline` / `aria`                              | Not implemented | Not registered.                                                                                                                                                                                         |
| Other coordinate systems (`polar` / `parallel` / `singleAxis` / `geo` / `calendar` / `matrix`) | Not implemented | Cartesian `grid` only.                                                                                                                                                                                  |
