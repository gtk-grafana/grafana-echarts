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

| Area                                                                              | ECharts Multivariate                                                                                  | Notes                                                                                                                                               |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chart type                                                                        | "Chart type" picker (Radar / Parallel)                                                                | Panel-level `seriesType`; the radar and parallel option groups gate on the selection (`isRadarSelected` / `isParallelSelected`)                     |
| Legend                                                                            | Grafana legend via `addLegendOptions`                                                                 | Governs the series (polygons / polylines); interactive show/hide (`hideSeriesFrom`) + color (`byName`) persist as field-config overrides            |
| Tooltip: mode                                                                     | `tooltip.mode` (Single/Hidden)                                                                        | Maps to the ECharts tooltip trigger. **All is withdrawn** for both render types — see the TODO below                                                |
| Axes                                                                              | derived from the categorical converter                                                                | Categories become radar indicators / parallel axes; numeric fields become polygons / polylines                                                      |
| Radar shape (Default: Fill area; Advanced: Shape, Line width, Symbol size, Rings) | `series.areaStyle`, `radar.shape`, `series.lineStyle.width`, `series.symbolSize`, `radar.splitNumber` | Each omitted at its default; shown only when Radar is selected                                                                                      |
| Parallel style (Default: Smooth; Advanced: Layout, Line width, Line opacity)      | `series.smooth`, `parallel.layout`, `series.lineStyle.width`, `series.lineStyle.opacity`              | Shown only when Parallel is selected. Omitted at their defaults except Line opacity, which defaults to fully opaque rather than ECharts' faint 0.45 |
| Animation                                                                         | `animation.enabled` (Advanced)                                                                        | **Off by default** for every family; opt in via the Advanced switch or panel JSON                                                                   |

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
- **No proximity hover** for either render type — hovering _near_ a polygon or
  polyline does nothing; you must be on it. This is by design, not a gap. The
  proximity gate (`tooltip/proximity.ts`) admits only `line` / `scatter` /
  `effectScatter`, and the family fails three of its structural preconditions:
  `findHoveredPoint` opens with `containPixel({ gridIndex: 0 })` and neither
  coordinate system builds a `grid`; ECharts' `Parallel` implements no
  `convertToPixel` / `convertFromPixel` (and `Radar`'s are `Not implemented.`
  stubs), which the snap and the y-distance test both call; and proximity keys on
  `seriesIndex`-per-field, while this family emits _one_ series whose polygons /
  polylines are `dataIndex` entries. The "snap on x, pick on y" rule is also
  meaningless here — a parallel cursor sits _between_ N axes, so the honest hit
  test is perpendicular distance to a polyline segment, a different algorithm.
  Both types therefore rely on ECharts' native `trigger: 'item'` hit-testing.
- **Parallel data links need a click on the line**, and re-pinning costs an extra
  one. The data-link footer only renders while the tooltip is pinned, and the pin
  path replays the click into ECharts as `showTip { seriesIndex, dataIndex }`.
  ECharts cannot service that for a parallel coordinate system — it resolves the
  point through `findPointFromSeries`, which calls `coordSys.dataToPoint(values)`
  with one argument, while `Parallel.prototype.dataToPoint(value, dim)` needs the
  dimension and throws without it. (Radar sidesteps this by defining
  `getTooltipPosition`, checked first; parallel defines neither.) `replayTip`
  swallows the throw, so the pin still lands on the content the preceding hover
  produced. The cost is that clicking straight from one pinned line to another
  finds the model already cleared by the dismiss, so that click leaves the
  tooltip unpinned; moving the cursor re-hovers and the next click pins. The
  positional form of `showTip` is not a workaround — it emits nothing for a
  parallel coordinate system even when `findHover` lands on the polyline.
- Parallel sizes its own layout box (`getParallelComponent`) rather than a
  `grid`, and there is no `containLabel` for this coordinate system, so label
  room is reserved in literal px. ECharts' defaults (80/80/60/60) spent about
  two-thirds of a panel on padding. The horizontal and vertical boxes are not
  rotations of each other: with `vertical`, ECharts draws each axis name past the
  _right_ end of its axis and left-aligned, making that side a name column.
- **Radar cannot be fitted to the canvas as precisely as parallel.** It takes no
  layout box — `RadarModel` declares no `layoutMode = 'box'`, so
  `left`/`top`/`right`/`bottom` are ignored — and its `radius` is a percentage of
  `min(canvas width, canvas height) / 2`, with the indicator names hanging
  _outside_ that radius. Because the names cost a fixed number of px while the
  radius is a proportion, no single percentage is ideal at every panel shape:
  wide panels (what Grafana mostly renders) are limited by the cheap vertical
  name gap, near-square ones by the wide side labels. `RADAR_OUTER_RADIUS` is set
  to 75% — matching `PIE_OUTER_RADIUS`, and up from ECharts' 50%, which drew the
  web at a quarter of the panel's smaller dimension. Fitting the labels exactly
  would mean giving the option build the panel's pixel size, which
  `useChartOption` deliberately memoizes away so a resize does not rebuild the
  option; that trade is not worth making for one family.
- Radar also has no way to reserve space for a _native_ ECharts legend (again,
  no box), so it shrinks its radius instead. The default Grafana DOM legend needs
  none of this — `VizLayout` sizes the canvas before the chart mounts.

## ECharts API support

High-level [ECharts option](https://echarts.apache.org/en/option.html) components
used by this module. See [echarts.ts](../../lib/echarts/echarts.ts) for the
registered runtime surface.

| ECharts API                                                                       | Status          | Notes                                                                                                                                                                                |
| --------------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `series` (radar)                                                                  | Supported       | `seriesType: radar`; Advanced area / line width / symbol size.                                                                                                                       |
| `series` (parallel)                                                               | Supported       | `seriesType: parallel`; Default smooth + Advanced line width / opacity; per-line color via each data item's `lineStyle`.                                                             |
| `radar` (coordinate system)                                                       | Supported       | Indicators derived from the categorical converter; web radius sized past ECharts' default and themed indicator names. No box layout — see Notes.                                     |
| `parallel` / `parallelAxis` (coordinate system)                                   | Supported       | One value axis per category (auto-scaling); Advanced `parallel.layout` (Horizontal / Vertical). Layout box and themed axis labels/names via `parallel.parallelAxisDefault`.          |
| `legend`                                                                          | Supported       | Grafana DOM legend (`addLegendOptions`); native legend hidden. Interactive show/hide + color persist as field-config overrides.                                                      |
| `tooltip`                                                                         | Supported       | Rendered by a React `@grafana/ui` `VizTooltip` overlay; `dataIndex` selects the series' field formatter and its data-link footer (shared by radar and parallel). Single/Hidden only. |
| `animation`                                                                       | Supported       | Off by default for every family; opt in via the Advanced switch or `animation.enabled` in panel JSON.                                                                                |
| `color` / `textStyle`                                                             | Supported       | Derived from the Grafana theme.                                                                                                                                                      |
| `grid` / `xAxis` / `yAxis`                                                        | Not implemented | Radar and parallel use their own coordinate systems, not cartesian.                                                                                                                  |
| `visualMap` / `markLine` / `markArea` / `axisPointer` / `brush` / `dataZoom`      | Not implemented | Cartesian-oriented components; N/A here.                                                                                                                                             |
| `toolbox` / `dataset` / `title` / `graphic` / `timeline` / `aria`                 | Not implemented | Not registered.                                                                                                                                                                      |
| Other coordinate systems (`polar` / `singleAxis` / `geo` / `calendar` / `matrix`) | Not implemented | —                                                                                                                                                                                    |
