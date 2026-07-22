# Multivariate (radar + parallel coordinates) editor option parity

Covers the ECharts **Multivariate** module ([module.tsx](./module.tsx)), which
renders `seriesType: radar` or `seriesType: parallel` — chosen via the "Chart
type" picker — from the shared categorical model.

## No core Grafana equivalent

Grafana core has **no radar or parallel-coordinates panel**, so there is no
option-for-option parity target. This doc records what the module exposes and
compares against ECharts semantics rather than a core panel.

## Shared data model

Both render types reuse the categorical converter (the same source model as pie):
the first string field's rows become the **axes** (radar indicators / parallel
axes) and each numeric field becomes one **series** (a radar polygon / a parallel
polyline). Because one numeric field maps to one series in both, the legend
(`buildRadarLegendItems`) and tooltip (`dataIndex` → field) are shared unchanged,
and toggling radar↔parallel on a panel re-renders the same data coherently.

Radar derives a per-indicator `max` (each axis's outer bound); parallel omits it
so every axis auto-scales independently (each `parallelAxis` is a value axis).

## Editor options

| Area                                                                              | ECharts Multivariate                                                                                  | Notes                                                                                                                                    |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Chart type                                                                        | "Chart type" picker (Radar / Parallel)                                                                | Panel-level `seriesType`; the radar and parallel option groups gate on the selection (`isRadarSelected` / `isParallelSelected`)          |
| Legend                                                                            | Grafana legend via `addLegendOptions`                                                                 | Governs the series (polygons / polylines); interactive show/hide (`hideSeriesFrom`) + color (`byName`) persist as field-config overrides |
| Tooltip: mode                                                                     | `tooltip.mode` (Single/All/Hidden)                                                                    | Maps to the ECharts tooltip trigger                                                                                                      |
| Axes                                                                              | derived from the categorical converter                                                                | Categories become radar indicators / parallel axes; numeric fields become polygons / polylines                                           |
| Radar shape (Default: Fill area; Advanced: Shape, Line width, Symbol size, Rings) | `series.areaStyle`, `radar.shape`, `series.lineStyle.width`, `series.symbolSize`, `radar.splitNumber` | Each omitted at its default; shown only when Radar is selected                                                                           |
| Parallel style (Default: Smooth; Advanced: Layout, Line width, Line opacity)      | `series.smooth`, `parallel.layout`, `series.lineStyle.width`, `series.lineStyle.opacity`              | Each omitted at its default; shown only when Parallel is selected                                                                        |

## Standard (field-config) options

Keeps the full standard field-config set (Color, Unit, Decimals, Min, Max,
Display name, No value, Thresholds, Value mappings, Data links), customizing only
Color (PaletteClassic, byValue + bySeries). Most standard options (Min/Max,
Thresholds) have limited meaning for the categorical axes.

## Notes / gaps

- Data model: see [Shared data model](#shared-data-model) — radar and parallel
  share the categorical converter, so a panel toggles between them on one dataset.
- Editor mode: each type's Advanced options reset to their defaults in Default
  editor mode (`applyRadarEditorModeDefaults` / `applyParallelEditorModeDefaults`),
  so an untouched panel renders unchanged.
- Parallel per-line color rides on each data item's `lineStyle.color` (ECharts has
  no per-line `itemStyle` for parallel), resolved from the field's Color config.

## ECharts API support

High-level [ECharts option](https://echarts.apache.org/en/option.html) components
used by this module. See [echarts.ts](../../lib/echarts/echarts.ts) for the
registered runtime surface.

| ECharts API                                                                       | Status          | Notes                                                                                                                           |
| --------------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `series` (radar)                                                                  | Supported       | `seriesType: radar`; Advanced area / line width / symbol size.                                                                  |
| `series` (parallel)                                                               | Supported       | `seriesType: parallel`; Default smooth + Advanced line width / opacity; per-line color via each data item's `lineStyle`.        |
| `radar` (coordinate system)                                                       | Supported       | Indicators derived from the categorical converter.                                                                              |
| `parallel` / `parallelAxis` (coordinate system)                                   | Supported       | One value axis per category (auto-scaling); Advanced `parallel.layout` (Horizontal / Vertical).                                 |
| `legend`                                                                          | Supported       | Grafana DOM legend (`addLegendOptions`); native legend hidden. Interactive show/hide + color persist as field-config overrides. |
| `tooltip`                                                                         | Supported       | Grafana-styled; `dataIndex` selects the series' field formatter (shared by radar and parallel).                                 |
| `animation`                                                                       | Supported       | ECharts defaults (enabled).                                                                                                     |
| `color` / `textStyle`                                                             | Supported       | Derived from the Grafana theme.                                                                                                 |
| `grid` / `xAxis` / `yAxis`                                                        | Not implemented | Radar and parallel use their own coordinate systems, not cartesian.                                                             |
| `visualMap` / `markLine` / `markArea` / `axisPointer` / `brush` / `dataZoom`      | Not implemented | Cartesian-oriented components; N/A here.                                                                                        |
| `toolbox` / `dataset` / `title` / `graphic` / `timeline` / `aria`                 | Not implemented | Not registered.                                                                                                                 |
| Other coordinate systems (`polar` / `singleAxis` / `geo` / `calendar` / `matrix`) | Not implemented | —                                                                                                                               |
