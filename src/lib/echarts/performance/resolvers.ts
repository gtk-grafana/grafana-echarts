import { type DataFrame } from '@grafana/data';
import {
  ANIMATION_ENABLED_DEFAULT,
  PERFORMANCE_DOWNSAMPLING_DEFAULT,
  PERFORMANCE_SHOW_POINTS_DEFAULT,
  RELATIONS_ANIMATION_ENABLED_DEFAULT,
} from 'editor/constants';
import {
  type CartesianSingleValueSeriesType,
  type HeatmapSeriesType,
  type PerformanceMode,
  type SeriesType,
} from 'editor/types';
import { isRelationsSeriesType } from 'lib/echarts/charts/narrowing';
import { forEachTimeSeriesField } from 'lib/echarts/converters/frames';
import { LARGE_MODE_THRESHOLD, SYMBOL_VISIBLE_MAX_TOTAL_POINTS } from 'lib/echarts/performance/constants';
import { type PerfSeriesOptions, type SeriesDensity } from 'lib/echarts/performance/types';
import { type PanelOptions } from 'types';

/**
 * Resolvers that turn a chart's density plus any Advanced overrides into ECharts'
 * big-data levers. The thresholds they compare against live in `./constants.ts`;
 * the editor fragment that surfaces the overrides is
 * `lib/grafana/editor/common/performance-options.ts`.
 *
 * These switch dense charts onto the fast path automatically while leaving small
 * charts visually identical (so canvas snapshots below the threshold don't
 * churn), and let power users override the auto behavior. See
 * `docs/performance.md` for the measurements behind each lever.
 */

/**
 * Both density measures for a set of already-flattened series value arrays.
 * `getSeriesDensity` below is the frame-shaped entry point; the category-axis
 * converter has its series flattened already (`frameToCategorical`) and calls
 * this directly, so both cartesian paths measure density the same way.
 */
export function getDensityFromSeriesValues(seriesValues: ReadonlyArray<readonly unknown[]>): SeriesDensity {
  let totalPoints = 0;
  let maxPointsPerSeries = 0;
  for (const values of seriesValues) {
    totalPoints += values.length;
    maxPointsPerSeries = Math.max(maxPointsPerSeries, values.length);
  }
  return { totalPoints, maxPointsPerSeries };
}

/**
 * Both density measures for a frame set: total points across all series, and
 * points in the densest single series. Counted the same way
 * `timeSeriesToEChartsOption` emits series (via `forEachTimeSeriesField`, so the
 * numeric-fallback X field is honored). Non-time-series frames (pie, radar) yield
 * counts well below the thresholds, so the resolvers no-op.
 */
export function getSeriesDensity(frames: DataFrame[]): SeriesDensity {
  const seriesValues: Array<readonly unknown[]> = [];
  forEachTimeSeriesField(frames, ({ field }) => {
    seriesValues.push(field.values);
  });
  return getDensityFromSeriesValues(seriesValues);
}

/**
 * Whether a series draws at least one line segment, i.e. holds two *adjacent*
 * non-null values. Returns on the first pair found, so for ordinary dense data it
 * costs a single comparison.
 *
 * A series without one paints nothing at all when symbols are hidden: ECharts
 * emits a zero-length `moveTo`/`stroke` per point, which covers no pixels, so the
 * point markers are the only thing that renders it. Two ordinary shapes hit this
 * — a single-point series (a Prometheus instant query), and a series whose values
 * are each separated by nulls (`connectNulls` is off, so a null breaks the path).
 */
function hasDrawableLineSegment(values: readonly unknown[]): boolean {
  for (let i = 1; i < values.length; i++) {
    if (values[i] != null && values[i - 1] != null) {
      return true;
    }
  }
  return false;
}

/**
 * Resolve line-series point-marker visibility from the (defaulted) Show points
 * mode, the chart's total density, and the series' own values.
 *
 * Auto keys off **total** points, not per-series: the cost is the number of
 * markers drawn, and a chart of 1000 short series draws just as many as one long
 * one. It makes one exception above that total — a series with no drawable line
 * segment keeps its markers, because hiding them would render that series as
 * literally nothing (see {@link hasDrawableLineSegment}). Core Grafana guards the
 * same case, via the `pointsFilter` its uPlot series builder applies to
 * gap-isolated points.
 *
 * `always` and `never` are explicit overrides and are obeyed literally, so unlike
 * core, `never` *will* blank an isolated-point series — that is what asking for no
 * markers on a chart that draws no lines means. Only the heuristic promises to
 * keep the data visible.
 */
function resolveShowSymbol(showPoints: PerformanceMode, totalPoints: number, values: readonly unknown[]): boolean {
  switch (showPoints) {
    case 'always':
      return true;
    case 'never':
      return false;
    case 'auto':
    default:
      return totalPoints <= SYMBOL_VISIBLE_MAX_TOTAL_POINTS || !hasDrawableLineSegment(values);
  }
}

/**
 * Fast-path props for one series given its resolved render type, the chart's
 * density, and the panel's Advanced overrides.
 *
 * - `line`: hide per-point symbols once the chart's **total** point count crosses
 *   the threshold (unless Show points forces it, or the series would vanish), and
 *   arm LTTB `sampling` unless Downsampling is off.
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
  values,
}: {
  type: CartesianSingleValueSeriesType | HeatmapSeriesType | undefined;
  density: SeriesDensity;
  options: PanelOptions;
  /** This series' own values, in emit order. Only the `line` branch reads them. */
  values: readonly unknown[];
}): PerfSeriesOptions {
  const performance = options.performance;
  const { totalPoints, maxPointsPerSeries } = density;

  if (type === 'line') {
    const showPoints = performance?.showPoints ?? PERFORMANCE_SHOW_POINTS_DEFAULT;
    const downsampling = performance?.downsampling ?? PERFORMANCE_DOWNSAMPLING_DEFAULT;
    return {
      showSymbol: resolveShowSymbol(showPoints, totalPoints, values),
      // Armed whenever downsampling is on, with no point threshold of our own,
      // because ECharts re-gates it on the rendered width: its `dataSample`
      // processor thins a series only once `round(count / axisWidthPx * dpr) > 1`,
      // i.e. at roughly 1.5x more points than the x axis has pixels. Any
      // points-per-series threshold we set below that never fires first, so it
      // would only be decoration — see `./constants.ts`.
      // @todo compare against minmax
      sampling: downsampling ? 'lttb' : undefined,
    };
  }

  if (type === 'scatter' || type === 'bar') {
    return maxPointsPerSeries >= LARGE_MODE_THRESHOLD ? { large: true, largeThreshold: LARGE_MODE_THRESHOLD } : {};
  }

  return {};
}

/**
 * Resolve the panel-level `animation` flag: the shared `animation.enabled`
 * opt-in, defaulting to off for every family **except relations**.
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
 *
 * The relations family is the one exception, and `seriesType` is passed only so this
 * can tell: a mark there is a whole *field*, so the panel is tens of marks rather than
 * tens of thousands of points and the density argument above does not reach it. See
 * `RELATIONS_ANIMATION_ENABLED_DEFAULT`. Omitting `seriesType` keeps the off default,
 * which is what every caller that does not know its family wants.
 */
export function resolveAnimation(options: PanelOptions, seriesType?: SeriesType): boolean {
  const familyDefault =
    seriesType != null && isRelationsSeriesType(seriesType)
      ? RELATIONS_ANIMATION_ENABLED_DEFAULT
      : ANIMATION_ENABLED_DEFAULT;
  return options.animation?.enabled ?? familyDefault;
}
