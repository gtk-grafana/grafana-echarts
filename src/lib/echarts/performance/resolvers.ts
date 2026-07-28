import { type DataFrame } from '@grafana/data';
import {
  ANIMATION_ENABLED_DEFAULT,
  PERFORMANCE_DOWNSAMPLING_DEFAULT,
  PERFORMANCE_SHOW_POINTS_DEFAULT,
} from 'editor/constants';
import { type CartesianSingleValueSeriesType, type HeatmapSeriesType, type PerformanceMode } from 'editor/types';
import { forEachTimeSeriesField } from 'lib/echarts/converters/frames';
import {
  LARGE_MODE_THRESHOLD,
  SAMPLING_MIN_POINTS_PER_SERIES,
  SYMBOL_VISIBLE_MAX_TOTAL_POINTS,
} from 'lib/echarts/performance/constants';
import { type PerfSeriesOptions, type SeriesDensity } from 'lib/echarts/performance/types';
import { type PanelOptions } from 'types';

/**
 * Resolvers that turn a chart's density plus any Advanced overrides into ECharts'
 * big-data levers. The threshold they compare against lives in `./constants.ts`;
 * the editor fragment that surfaces the overrides is
 * `lib/grafana/editor/common/performance-options.ts`.
 *
 * These switch dense charts onto the fast path automatically while leaving small
 * charts visually identical (so canvas snapshots below the threshold don't
 * churn), and let power users override the auto behavior. See
 * `docs/performance.md` for the measurements behind each lever.
 */

/**
 * Both density measures for a frame set: total points across all series, and
 * points in the densest single series. Counted the same way
 * `timeSeriesToEChartsOption` emits series (via `forEachTimeSeriesField`, so the
 * numeric-fallback X field is honored). Non-time-series frames (pie, radar,
 * category) yield counts well below the thresholds, so the resolvers no-op.
 */
export function getSeriesDensity(frames: DataFrame[]): SeriesDensity {
  let totalPoints = 0;
  let maxPointsPerSeries = 0;
  forEachTimeSeriesField(frames, ({ field }) => {
    const points = field.values.length;
    totalPoints += points;
    maxPointsPerSeries = Math.max(maxPointsPerSeries, points);
  });
  return { totalPoints, maxPointsPerSeries };
}

/**
 * Resolve line-series point-marker visibility from the (defaulted) Show points
 * mode. Auto keys off **total** points, not per-series: the cost is the number of
 * markers drawn, and a chart of 1000 short series draws just as many as one long
 * one.
 */
function resolveShowSymbol(showPoints: PerformanceMode, totalPoints: number): boolean {
  switch (showPoints) {
    case 'always':
      return true;
    case 'never':
      return false;
    case 'auto':
    default:
      return totalPoints <= SYMBOL_VISIBLE_MAX_TOTAL_POINTS;
  }
}

/**
 * Fast-path props for one series given its resolved render type, the chart's
 * density, and the panel's Advanced overrides.
 *
 * - `line`: hide per-point symbols once the chart's **total** point count crosses
 *   the threshold (unless Show points forces it), and enable LTTB `sampling` once
 *   a **single series** is deep enough to be worth thinning (unless Downsampling
 *   is off). The two use different measures on purpose — see `./constants.ts`.
 * - `scatter` / `bar`: enable `large` mode above `LARGE_MODE_THRESHOLD`
 *   per-series, matching ECharts' own `largeThreshold` semantics. Scatter is
 *   symbols-by-definition (no `showSymbol`), so `large` is its lever;
 *   `effectScatter` (ripple animation, meant for a few highlighted points) and
 *   heatmap (`type: undefined`) are left untouched.
 */
export function getSeriesPerfOptions({
  type,
  density,
  options,
}: {
  type: CartesianSingleValueSeriesType | HeatmapSeriesType | undefined;
  density: SeriesDensity;
  options: PanelOptions;
}): PerfSeriesOptions {
  const performance = options.performance;
  const { totalPoints, maxPointsPerSeries } = density;

  if (type === 'line') {
    const showPoints = performance?.showPoints ?? PERFORMANCE_SHOW_POINTS_DEFAULT;
    const downsampling = performance?.downsampling ?? PERFORMANCE_DOWNSAMPLING_DEFAULT;
    const worthSampling = maxPointsPerSeries > SAMPLING_MIN_POINTS_PER_SERIES;
    return {
      showSymbol: resolveShowSymbol(showPoints, totalPoints),
      // @todo compare against minmax
      sampling: downsampling && worthSampling ? 'lttb' : undefined,
    };
  }

  if (type === 'scatter' || type === 'bar') {
    return maxPointsPerSeries >= LARGE_MODE_THRESHOLD ? { large: true, largeThreshold: LARGE_MODE_THRESHOLD } : {};
  }

  return {};
}

/**
 * Resolve the panel-level `animation` flag: the shared `animation.enabled`
 * opt-in, defaulting to off for every family.
 *
 * Density thresholds were tried here first — animate until a chart crosses a
 * series-count or points-per-series limit — and removed, because the sequencing
 * cannot work. A panel only learns a response is dense once it is already
 * rendering it; Grafana re-renders with the *previous* data while a query is in
 * flight, so that render animates on the old count; and any threshold leaves a
 * band below it (growing 10 -> 40 series) that animates a chart already heavy
 * enough to feel it. The threshold fired correctly, just too late to help.
 *
 * So animation is opt-in instead, which also matches core Grafana more closely —
 * its viz panels do not animate at all. Deliberately takes no frame stats:
 * nothing about the data affects the answer any more. See `docs/performance.md`.
 */
export function resolveAnimation(options: PanelOptions): boolean {
  return options.animation?.enabled ?? ANIMATION_ENABLED_DEFAULT;
}
