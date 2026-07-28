import type { GrafanaTheme2, ValueFormatter } from '@grafana/data';
import type { LineSeriesOption, ScatterSeriesOption } from 'echarts';

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
 * Fast-path props spread into a cartesian series, picked from ECharts' own
 * series option definitions. ECharts exports no ready-made "big-data levers"
 * type — the mixins that would express it (`SeriesSamplingOptionMixin`,
 * `SeriesLargeOptionMixin`) are internal — so the two `Pick`s are the closest
 * thing to a first-party definition. Every key is optional, so each branch of
 * `getSeriesPerfOptions` returns only those relevant to the series' render type.
 *
 * `large`/`largeThreshold` are picked off `ScatterSeriesOption` but are also
 * applied to `bar`: `BarSeriesOption` omits `SeriesLargeOptionMixin` in ECharts'
 * `.d.ts` even though the runtime supports both keys (`BaseBarSeries` defaults
 * `large: false, largeThreshold: 400`), so Scatter's declaration stands in for
 * the missing one.
 */
export type PerfSeriesOptions = Pick<LineSeriesOption, 'showSymbol' | 'sampling'> &
  Pick<ScatterSeriesOption, 'large' | 'largeThreshold'>;

/** Chart shape used to pick the fast path: number of series and the densest series. */
export interface SeriesStats {
  seriesCount: number;
  /** Largest points-per-series across the frames (the density signal). */
  maxPoints: number;
}
