import { type DataFrame } from '@grafana/data';
import { PERFORMANCE_DOWNSAMPLING_DEFAULT, PERFORMANCE_SHOW_POINTS_DEFAULT } from 'editor/constants';
import { type CartesianSingleValueSeriesType, type HeatmapSeriesType, type ShowPointsMode } from 'editor/types';
import { forEachTimeSeriesField } from 'lib/echarts/converters/frames';
import { type PanelOptions } from 'types';

/**
 * Single source of truth for the cartesian time-series "fast path": the density
 * thresholds and the resolvers that turn a chart's shape (series count + points
 * per series) plus any Advanced overrides into ECharts' big-data levers.
 *
 * A Chrome profile of 500 time-series showed the initial render was one ~4.5s
 * main-thread task dominated by per-point symbols, transition diffing/animation,
 * and scene-graph work that scales with element count — all things ECharts lets
 * you turn off. These resolvers switch dense charts onto that fast path
 * automatically while leaving small charts visually identical (so canvas
 * snapshots below the thresholds don't churn), and let power users override the
 * auto behavior from the Advanced editor.
 */

/**
 * Per-series point count at/below which point markers stay visible and LTTB
 * sampling stays off (auto mode). Above it, a line series hides its symbols and
 * (when downsampling is enabled) samples to reduce drawn points. Symbols at
 * every point are the single biggest render cost in the profiled regression.
 */
export const SYMBOL_VISIBLE_MAX_POINTS = 100;
/** Series count above which animation auto-disables (transition diffing scales with series). */
export const ANIMATION_MAX_SERIES = 50;
/** Per-series point count above which animation auto-disables. */
export const ANIMATION_MAX_POINTS = 5000;
/**
 * Per-series point count at/above which scatter/bar series switch on ECharts'
 * `large` mode (a batched, symbol-simplified renderer). Also emitted as the
 * series' `largeThreshold` so ECharts only engages the optimization per-series
 * above this count. https://echarts.apache.org/en/option.html#series-scatter.large
 */
export const LARGE_MODE_THRESHOLD = 2000;

/** Chart shape used to pick the fast path: number of series and the densest series. */
export interface SeriesStats {
  seriesCount: number;
  /** Largest points-per-series across the frames (the density signal). */
  maxPoints: number;
}

/**
 * Series count + densest-series point count for a frame set, counted the same
 * way `timeSeriesToEChartsOption` emits series (via `forEachTimeSeriesField`, so
 * the numeric-fallback X field is honored). Non-time-series frames (pie, radar,
 * category) yield small counts well below every threshold, so the resolvers
 * no-op for them.
 */
export function getSeriesStats(frames: DataFrame[]): SeriesStats {
  let seriesCount = 0;
  let maxPoints = 0;
  forEachTimeSeriesField(frames, ({ field }) => {
    seriesCount += 1;
    maxPoints = Math.max(maxPoints, field.values.length);
  });
  return { seriesCount, maxPoints };
}

/**
 * Per-series performance props spread into a cartesian series. `showSymbol` /
 * `sampling` apply to line series; `large` / `largeThreshold` to scatter and
 * bar. Only the keys relevant to the series' type are set.
 */
export interface PerfSeriesOptions {
  showSymbol?: boolean;
  sampling?: 'lttb';
  large?: boolean;
  largeThreshold?: number;
}

/** Resolve line-series point-marker visibility from the (defaulted) Show points mode. */
function resolveShowSymbol(showPoints: ShowPointsMode, maxPoints: number): boolean {
  switch (showPoints) {
    case 'always':
      return true;
    case 'never':
      return false;
    case 'auto':
    default:
      // Keep markers while the densest series is still sparse enough to read.
      return maxPoints <= SYMBOL_VISIBLE_MAX_POINTS;
  }
}

/**
 * Fast-path props for one series given its resolved render type, the chart's
 * densest-series point count, and the panel's Advanced overrides.
 *
 * - `line`: hide per-point symbols on dense data (unless Show points forces it)
 *   and enable LTTB `sampling` above the density threshold (unless Downsampling
 *   is off). LTTB is a no-op when points already fit the pixels, so it only ever
 *   removes redundant draw work.
 * - `scatter` / `bar`: enable `large` mode above `LARGE_MODE_THRESHOLD`. Scatter
 *   is symbols-by-definition (no `showSymbol`), so `large` is its lever;
 *   `effectScatter` (ripple animation, meant for a few highlighted points) and
 *   heatmap (`type: undefined`) are left untouched.
 */
export function getSeriesPerfOptions({
  type,
  maxPoints,
  options,
}: {
  type: CartesianSingleValueSeriesType | HeatmapSeriesType | undefined;
  maxPoints: number;
  options: PanelOptions;
}): PerfSeriesOptions {
  const performance = options.performance;

  if (type === 'line') {
    const showPoints = performance?.showPoints ?? PERFORMANCE_SHOW_POINTS_DEFAULT;
    const downsampling = performance?.downsampling ?? PERFORMANCE_DOWNSAMPLING_DEFAULT;
    const dense = maxPoints > SYMBOL_VISIBLE_MAX_POINTS;
    return {
      showSymbol: resolveShowSymbol(showPoints, maxPoints),
      sampling: downsampling && dense ? 'lttb' : undefined,
    };
  }

  if (type === 'scatter' || type === 'bar') {
    return maxPoints >= LARGE_MODE_THRESHOLD ? { large: true, largeThreshold: LARGE_MODE_THRESHOLD } : {};
  }

  return {};
}

/**
 * Resolve the panel-level `animation` flag. An explicit `animation.enabled`
 * (from the Advanced toggle or persisted JSON) always wins; otherwise animation
 * auto-disables once a chart crosses either the series-count or points-per-series
 * threshold (transition diffing and load animation are pure overhead on dense
 * data). Small/non-time-series charts stay animated, matching prior behavior.
 */
export function resolveAnimation(options: PanelOptions, stats: SeriesStats): boolean {
  const explicit = options.animation?.enabled;
  if (explicit != null) {
    return explicit;
  }
  return stats.seriesCount <= ANIMATION_MAX_SERIES && stats.maxPoints <= ANIMATION_MAX_POINTS;
}
