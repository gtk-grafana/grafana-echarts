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

/**
 * The two density measures the levers key off. They are genuinely different axes
 * and must not be conflated — see the note in `./constants.ts`.
 */
export interface SeriesDensity {
  /**
   * Points summed across every series. Total drawn-element cost (symbols) scales
   * with this, not with per-series depth.
   */
  totalPoints: number;
  /**
   * Points in the densest single series. What the within-a-series levers
   * (`sampling`, `large`) key off, since neither helps a chart made of many
   * short series.
   */
  maxPointsPerSeries: number;
}
