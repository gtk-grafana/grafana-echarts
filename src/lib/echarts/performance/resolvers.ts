import { type DataFrame } from '@grafana/data';
import {
  PERFORMANCE_ANIMATION_DEFAULT,
  PERFORMANCE_DOWNSAMPLING_DEFAULT,
  PERFORMANCE_SHOW_POINTS_DEFAULT,
} from 'editor/constants';
import { type CartesianSingleValueSeriesType, type HeatmapSeriesType, type PerformanceMode } from 'editor/types';
import { forEachTimeSeriesField } from 'lib/echarts/converters/frames';
import {
  ANIMATION_MAX_POINTS,
  ANIMATION_MAX_SERIES,
  LARGE_MODE_THRESHOLD,
  SYMBOL_VISIBLE_MAX_POINTS,
} from 'lib/echarts/performance/constants';
import { type PerfSeriesOptions, type SeriesStats } from 'lib/echarts/performance/types';
import { type PanelOptions } from 'types';

/**
 * Resolvers that turn a chart's shape (series count + points per series) plus any
 * Advanced overrides into ECharts' big-data levers. The thresholds they compare
 * against live in `./constants.ts`; the editor fragment that surfaces the
 * overrides is `lib/grafana/editor/common/performance-options.ts`.
 *
 * These switch dense charts onto the fast path automatically while leaving small
 * charts visually identical (so canvas snapshots below the thresholds don't
 * churn), and let power users override the auto behavior. See
 * `docs/performance.md` for the measurements behind each lever.
 */

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
 * Resolve the panel-level `animation` flag.
 *
 * Precedence:
 * 1. The cartesian Advanced tri-state (`performance.animation`) when it resolves
 *    to `always`/`never`. It is a tri-state rather than a boolean switch
 *    precisely so `auto` is representable — a boolean whose unset state means
 *    "auto" displays as off in the editor while the chart is in fact animating.
 * 2. The shared `animation.enabled` boolean. Part-to-whole writes it via
 *    `applyPartToWholeEditorModeDefaults`, and it is also where a hand-edited or
 *    previously-persisted panel JSON value lands.
 * 3. Otherwise auto: animation stays on until the chart crosses either the
 *    series-count or points-per-series threshold, past which load and transition
 *    animation are pure overhead.
 */
export function resolveAnimation(options: PanelOptions, stats: SeriesStats): boolean {
  const mode = options.performance?.animation ?? PERFORMANCE_ANIMATION_DEFAULT;
  if (mode === 'always') {
    return true;
  }
  if (mode === 'never') {
    return false;
  }

  const explicit = options.animation?.enabled;
  if (explicit != null) {
    return explicit;
  }

  return stats.seriesCount <= ANIMATION_MAX_SERIES && stats.maxPoints <= ANIMATION_MAX_POINTS;
}
