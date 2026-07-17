# Candlestick editor option parity

Covers the ECharts **Cartesian** module ([../module.tsx](../module.tsx)) rendering
`seriesType: candlestick`, compared against core Grafana's **Candlestick** panel
([`public/app/plugins/panel/candlestick/module.tsx`](https://github.com/grafana/grafana/blob/main/public/app/plugins/panel/candlestick/module.tsx)).

## Current support status

Candlestick is a **multi-value** cartesian render type: each x position carries
several aligned dimensions (OHLC). The render path exists in the chart module
(`buildMultiValueOption` in
[../../../lib/echarts/charts/cartesian.ts](../../../lib/echarts/charts/cartesian.ts),
fed by
[../../../lib/echarts/converters/multiValueCartesian.ts](../../../lib/echarts/converters/multiValueCartesian.ts)),
but there is currently **no editor option to select it**: the per-field
`seriesType` override only offers line/bar/scatter/effectScatter
(`cartesianOverrideOptions`), and the module has no panel-level series-type
picker. So none of the core Candlestick editor options below have an equivalent
today.

## Design difference

Core Candlestick is built on the Time series visualization and applies OHLC
semantics by field-name convention (open/high/low/close/volume) with a manual
field-mapping fallback. This module infers the OHLC mapping in the converter and
exposes no per-field mapping or candlestick-specific styling in the editor.

## Panel options

| Core Grafana option                       | ECharts equivalent                               | Status        |
| ----------------------------------------- | ------------------------------------------------ | ------------- |
| Mode (Candles / Volume / Both)            | none                                             | Not supported |
| Candle style (Candles / OHLC bars)        | none                                             | Not supported |
| Color strategy (since open / prior close) | none                                             | Not supported |
| Up color / down color                     | none                                             | Not supported |
| Open/High/Low/Close/Volume field pickers  | none (mapping inferred in converter)             | Not supported |
| Additional fields (ignore / include)      | none                                             | Not supported |
| Tooltip: mode                             | `tooltip.mode` (only if candlestick is rendered) | Partial       |
| Legend                                    | Grafana legend via `addLegendOptions`            | Partial       |
| Annotations                               | none                                             | Not supported |

## Standard (field-config) options

The Cartesian module keeps the full standard field-config set (customizing only
Color), matching core Candlestick which uses the timeseries graph field config.

## Notes / gaps

- The defining Candlestick features (OHLC field mapping, candle mode/style,
  up/down colors) are not exposed. Making candlestick usable would require a
  panel-level render-type selector and OHLC mapping options.

## ECharts API support

High-level [ECharts option](https://echarts.apache.org/en/option.html) components
used by this render path. See [echarts.ts](../../../lib/echarts/echarts.ts) for
the registered runtime surface.

| ECharts API                                                                                    | Status          | Notes                                                                                                                                                                                                   |
| ---------------------------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `series` (candlestick)                                                                         | Partial         | Render path only, not editor-selectable (no render-type picker).                                                                                                                                        |
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
