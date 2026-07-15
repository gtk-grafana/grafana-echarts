# Heatmap editor option parity

Compares the editor options of this ECharts **Heatmap** module
([module.tsx](./module.tsx)) against core Grafana's **Heatmap** panel
([`public/app/plugins/panel/heatmap/module.tsx`](https://github.com/grafana/grafana/blob/main/public/app/plugins/panel/heatmap/module.tsx)).

## Design difference

Core Grafana Heatmap is a dedicated cell renderer: it `disableStandardOptions`
for every standard field-config property except Data links (and a hidden Unit),
and reimplements everything it needs (Y axis, colors, cell display, filtering) as
its own **panel** options.

This ECharts module is a **composite** panel: it draws dataplane heatmap frames
as cells and, optionally, promotes a numeric field to a cartesian overlay
(line/bar/scatter) via the per-field `seriesType` override. Because that overlay
is an ordinary cartesian series, the module keeps the full **standard
field-config** set (Unit, Min, Max, Decimals, Thresholds, etc.) so the overlay
can be styled; those options are meaningless for the heatmap cells themselves.

## Panel options

| Core Grafana group / option                                              | ECharts equivalent                                                                                                                                                                                     | Status                    |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------- |
| Calculate from data + bucket calculation                                 | none (we consume dataplane heatmap frames)                                                                                                                                                             | Not supported             |
| Y axis: placement, unit, decimals, min, max, width, label                | none (axes derived from the frame)                                                                                                                                                                     | Not supported             |
| Y axis: tick alignment, reverse                                          | none                                                                                                                                                                                                   | Not supported             |
| Colors: mode (Scheme/Opacity), fill, scale, exponent, steps, reverse     | none                                                                                                                                                                                                   | Not supported             |
| Colors: scheme                                                           | `heatmapColorScheme` (Spectral/Turbo/Blues/Magma)                                                                                                                                                      | Partial                   |
| Colors: start/end value (min/max)                                        | none (visualMap auto-ranges)                                                                                                                                                                           | Not supported             |
| Cell display: value name, cell unit/decimals, cell gap, hide cells le/ge | none                                                                                                                                                                                                   | Not supported             |
| Tooltip mode (Single/All/Hidden)                                         | `tooltip.mode`                                                                                                                                                                                         | Supported                 |
| Tooltip: histogram, color scale, max width/height                        | none                                                                                                                                                                                                   | Not supported             |
| Legend (`legend.show`)                                                   | Grafana legend via `addLegendOptions` (governs the cartesian **overlay** series, not the cells); interactive show/hide (via `hideSeriesFrom`) + color (via `byName`) persist as field-config overrides | Partial / different scope |
| Exemplars color                                                          | none                                                                                                                                                                                                   | Not supported             |
| Annotations                                                              | none                                                                                                                                                                                                   | Not supported             |
| —                                                                        | `heatmapLayout` (Binned/Matrix coordinate model)                                                                                                                                                       | ECharts-only              |
| —                                                                        | `heatmapColorScale.placement` (Right/Bottom/None visualMap)                                                                                                                                            | ECharts-only              |
| —                                                                        | per-field `seriesType` cartesian overlay                                                                                                                                                               | ECharts-only              |

## Standard (field-config) options

| Option         | Core Heatmap                | ECharts Heatmap                                       |
| -------------- | --------------------------- | ----------------------------------------------------- |
| Color scheme   | Disabled                    | Kept (customized to PaletteClassic, byValue+bySeries) |
| Unit           | Hidden (`hideFromDefaults`) | Kept                                                  |
| Decimals       | Disabled                    | Kept                                                  |
| Min / Max      | Disabled                    | Kept                                                  |
| Display name   | Disabled                    | Kept                                                  |
| No value       | Disabled                    | Kept                                                  |
| Thresholds     | Disabled                    | Kept                                                  |
| Value mappings | Disabled                    | Kept                                                  |
| Data links     | Enabled (`showOneClick`)    | Kept                                                  |

All standard options in this module are only meaningful for a cartesian
**overlay** field; they do not affect the heatmap cell layer.

## Notes / known limitations

- **Cannot conditionally hide standard options.** Ideally the standard options
  would appear only when a field is overridden into a cartesian overlay. Grafana
  applies field config to the data frame _after_ panel options are built, so the
  editor cannot know at build time whether an overlay exists. See the `@todo` in
  [module.tsx](./module.tsx).
- **Cannot regroup standard options.** `StandardOptionConfig` in `@grafana/data`
  exposes only `defaultValue`, `settings`, and `hideFromDefaults` — no
  `category`. Standard field-config options therefore render in Grafana's fixed
  categories and cannot be moved into a custom "Cartesian overlays" section. Only
  panel options (e.g. the Grafana legend added via `addLegendOptions`) could be
  relocated to a custom category.
- The core color controls are far richer (opacity mode, exponential scale,
  explicit min/max, step count). This module intentionally exposes a small,
  curated set of ECharts `visualMap` gradients instead.

## ECharts API support

High-level [ECharts option](https://echarts.apache.org/en/option.html) components
used by this module. See [echarts.ts](../../lib/echarts/echarts.ts) for the
registered runtime surface.

| ECharts API                                                                                          | Status          | Notes                                                                                                                                    |
| ---------------------------------------------------------------------------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `series` (custom cells / heatmap)                                                                    | Supported       | Binned cells via a `custom` series; the `matrix` layout uses the native `heatmap` series; both allow a cartesian overlay.                |
| `visualMap`                                                                                          | Partial         | `VisualMapContinuous` gradient only; no `piecewise`.                                                                                     |
| `grid`                                                                                               | Supported       | Single grid; spacing adapts to overlay axes and color-scale placement.                                                                   |
| `xAxis` / `yAxis`                                                                                    | Supported       | Binned: time/value x + bucket y; matrix: category × category.                                                                            |
| `tooltip`                                                                                            | Supported       | Per-cell formatter; overlay rows use their field formatters.                                                                             |
| `markLine` / `markArea`                                                                              | Supported       | Threshold lines / regions on the cartesian overlay.                                                                                      |
| `legend`                                                                                             | Partial         | Grafana DOM legend governs the cartesian overlay series, not the cells. Interactive show/hide + color persist as field-config overrides. |
| `axisPointer`                                                                                        | Partial         | Crosshair via `tooltip.axisPointer`; binned time-x only.                                                                                 |
| `brush`                                                                                              | Partial         | `lineX` drag -> dashboard time range; binned time-x only.                                                                                |
| `animation`                                                                                          | Supported       | ECharts defaults (enabled).                                                                                                              |
| `color` / `textStyle`                                                                                | Supported       | Cell colors from `heatmapColorScheme`; text from the Grafana theme.                                                                      |
| `dataZoom`                                                                                           | Not implemented | Range zoom is delegated to `brush` -> dashboard time range.                                                                              |
| `toolbox` / `dataset` / `title` / `graphic` / `timeline` / `aria`                                    | Not implemented | Not registered.                                                                                                                          |
| Other coordinate systems (`polar` / `parallel` / `singleAxis` / `geo` / `calendar` heatmap variants) | Not implemented | Cartesian `grid` only.                                                                                                                   |
