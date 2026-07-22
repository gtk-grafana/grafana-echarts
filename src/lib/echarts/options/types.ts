import type { GrafanaTheme2, ValueFormatter } from '@grafana/data';
import type { ScatterSeriesOption } from 'echarts/types/dist/echarts';
import type { LineSeriesOption } from 'echarts/types/src/chart/line/LineSeries';

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
export type HeatmapColorScalePlacement = 'right' | 'bottom' | 'none';
/** Theme + formatting context the binned heatmap tooltip needs to match Grafana. */
export interface BinnedHeatmapTooltipContext {
  theme: GrafanaTheme2;
  timeZone: string;
  formatValue: ValueFormatter;
}

/**
 * @todo these are still hacky types, but at least we're pulling them from echarts
 * Fast-path props spread into a cartesian series, taken from ECharts' own series
 * option definitions: from the line series & from the scatter series. Every key is optional,
 * so each branch of `getSeriesPerfOptions` returns only those relevant to the series' render type.
 */
export type PerfSeriesOptions = Pick<LineSeriesOption, 'showSymbol' | 'sampling' | 'zlevel'> &
  Pick<ScatterSeriesOption, 'large' | 'largeThreshold'>;

/** Chart shape used to pick the fast path: number of series and the densest series. */
export interface SeriesStats {
  seriesCount: number;
  /** Largest points-per-series across the frames (the density signal). */
  maxPoints: number;
}
