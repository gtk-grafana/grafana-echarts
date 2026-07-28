import { type DataFrame } from '@grafana/data';
import {
  ANIMATION_ENABLED_DEFAULT,
  PERFORMANCE_DOWNSAMPLING_DEFAULT,
  PERFORMANCE_SHOW_POINTS_DEFAULT,
} from 'editor/constants';
import { type CartesianSingleValueSeriesType, type HeatmapSeriesType, type PerformanceMode } from 'editor/types';
import { forEachTimeSeriesField } from 'lib/echarts/converters/frames';
import { LARGE_MODE_THRESHOLD, SYMBOL_VISIBLE_MAX_POINTS } from 'lib/echarts/performance/constants';
import { type PerfSeriesOptions } from 'lib/echarts/performance/types';
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
 * Points in the densest series of a frame set — the density signal every
 * per-series lever resolves against. Counted the same way
 * `timeSeriesToEChartsOption` emits series (via `forEachTimeSeriesField`, so the
 * numeric-fallback X field is honored). Non-time-series frames (pie, radar,
 * category) yield counts well below the threshold, so the resolvers no-op.
 */
export function getMaxPointsPerSeries(frames: DataFrame[]): number {
  let maxPoints = 0;
  forEachTimeSeriesField(frames, ({ field }) => {
    maxPoints = Math.max(maxPoints, field.values.length);
  });
  return maxPoints;
}

/** Resolve line-series point-marker visibility from the (defaulted) Show points mode. */
function resolveShowSymbol(showPoints: PerformanceMode, maxPoints: number): boolean {
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
      // @todo compare against minmax
      sampling: downsampling && dense ? 'lttb' : undefined,
    };
  }

  if (type === 'scatter' || type === 'bar') {
    return maxPoints >= LARGE_MODE_THRESHOLD ? { large: true, largeThreshold: LARGE_MODE_THRESHOLD } : {};
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
