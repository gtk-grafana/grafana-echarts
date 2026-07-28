# Multivariate (radar) editor option parity

Covers the ECharts **Multivariate** module ([module.tsx](./module.tsx)), rendering
`seriesType: radar`.

## No core Grafana equivalent

Grafana core has **no radar panel**, so there is no option-for-option parity
target. This doc records what the module exposes and compares against ECharts
radar semantics rather than a core panel.

## Editor options

| Area                         | ECharts Multivariate                   | Notes                                                                                                                                      |
| ---------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Legend                       | Grafana legend via `addLegendOptions`  | Governs the radar polygons (series); interactive show/hide (via `hideSeriesFrom`) + color (via `byName`) persist as field-config overrides |
| Tooltip: mode                | `tooltip.mode` (Single/Hidden)         | Maps to the ECharts tooltip trigger. **All is withdrawn** — see the TODO below                                                             |
| Radar indicators (axes)      | derived from the categorical converter | Categories become indicators; series become polygons                                                                                       |
| Per-series area/line styling | none (ECharts defaults)                | Not exposed                                                                                                                                |

## Standard (field-config) options

Keeps the full standard field-config set (Color, Unit, Decimals, Min, Max,
Display name, No value, Thresholds, Value mappings, Data links), customizing only
Color (PaletteClassic, byValue + bySeries). Most standard options (Min/Max,
Thresholds) have limited meaning for radar indicators.

## Notes / gaps

- Data model: radar reuses the categorical converter (categories to indicators,
  series to polygons), the same source model as pie.
- ECharts-only roadmap: `parallel` (parallel-coordinates) is planned for this
  family but not yet implemented.
- **TODO — restore the "All" tooltip mode.** It is withdrawn for now
  (`radarChartModule.singleTooltipOnly`, and `singleOnly` on the editor's
  `addTooltipOptions`); a `tooltip.mode: multi` persisted by an older dashboard
  is clamped back to Single when the option is built.

  Radar draws every polygon as a data item of one series, so ECharts hands the
  formatter a **single** param whose `value` is that polygon's whole indicator
  array — there is no per-series param list for an All tooltip to enumerate.
  Today the generic model unwraps only the trailing element of that array
  (`unwrapTooltipValue`), so a hovered polygon reports just its last indicator.

  Restoring All means expanding one hovered polygon into one row per indicator,
  the way candlestick/boxplot expand their packed dimensions
  (`TooltipModelOptions.multiValueDimensions`) — except radar's array is _not_
  prefixed with the data index, so the existing offset-by-one expansion cannot
  be reused as-is. Row labels would come from the radar `indicator` names, and
  the header from the polygon name.

## ECharts API support

High-level [ECharts option](https://echarts.apache.org/en/option.html) components
used by this module. See [echarts.ts](../../lib/echarts/echarts.ts) for the
registered runtime surface.

| ECharts API                                                                                    | Status          | Notes                                                                                                                                                   |
| ---------------------------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `series` (radar)                                                                               | Supported       | `seriesType: radar`; per-series area/line styling not exposed.                                                                                          |
| `radar` (coordinate system)                                                                    | Supported       | Indicators derived from the categorical converter.                                                                                                      |
| `legend`                                                                                       | Supported       | Grafana DOM legend (`addLegendOptions`); native legend hidden. Interactive show/hide + color persist as field-config overrides.                         |
| `tooltip`                                                                                      | Supported       | Rendered by a React `@grafana/ui` `VizTooltip` overlay; `dataIndex` selects the polygon's field formatter and its data-link footer. Single/Hidden only. |
| `animation`                                                                                    | Supported       | ECharts defaults (enabled).                                                                                                                             |
| `color` / `textStyle`                                                                          | Supported       | Derived from the Grafana theme.                                                                                                                         |
| `grid` / `xAxis` / `yAxis`                                                                     | Not implemented | Radar uses the `radar` coordinate system, not cartesian.                                                                                                |
| `visualMap` / `markLine` / `markArea` / `axisPointer` / `brush` / `dataZoom`                   | Not implemented | Cartesian-oriented components; N/A for radar.                                                                                                           |
| `toolbox` / `dataset` / `title` / `graphic` / `timeline` / `aria`                              | Not implemented | Not registered.                                                                                                                                         |
| Other coordinate systems (`polar` / `parallel` / `singleAxis` / `geo` / `calendar` / `matrix`) | Not implemented | —                                                                                                                                                       |
