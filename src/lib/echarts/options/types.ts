import type { GrafanaTheme2, ValueFormatter } from '@grafana/data';

/** Built-in color gradients offered for the heatmap cell layer. */
export type HeatmapColorScheme = 'spectral' | 'blues' | 'turbo' | 'magma';

/**
 * Heatmap coordinate model:
 * - `binned`: cells positioned by explicit bounds on continuous axes (Grafana
 *   dataplane heatmap frames: time/numeric X, numeric bucket Y). Drawn as a
 *   custom series of interval rectangles. The default.
 * - `matrix`: a category x category grid (one tile per ordinal slot), drawn by
 *   the native ECharts heatmap series.
 *   https://echarts.apache.org/en/option.html#series-heatmap
 */
export type HeatmapLayout = 'binned' | 'matrix';

/**
 * Where the heatmap color scale (the ECharts `visualMap` legend) is rendered
 * relative to the cell grid.
 */
export type HeatmapColorScalePlacement = 'right' | 'bottom';
/** Theme + formatting context the binned heatmap tooltip needs to match Grafana. */
export interface BinnedHeatmapTooltipContext {
  theme: GrafanaTheme2;
  timeZone: string;
  formatValue: ValueFormatter;
}
