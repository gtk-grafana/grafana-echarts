import type { LineSeriesOption, ScatterSeriesOption } from 'echarts';

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
