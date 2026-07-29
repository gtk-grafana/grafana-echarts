/**
 * Proximity hit-testing for cartesian (time series) charts, reproducing core
 * Grafana's Single-tooltip hover rule.
 *
 * ECharts' native `trigger: 'item'` only fires when the cursor is literally
 * inside a rendered element's hit area — for a line series that is the symbol (a
 * few px, and not rendered at all once points are dense) or the polyline stroke
 * (`strokeContainThreshold`, ~5px). Core Grafana instead shows the tooltip
 * whenever the cursor is *near* a series, which is what this module reproduces.
 *
 * The result feeds `dispatchAction({ type: 'showTip', seriesIndex, dataIndex })`,
 * so the existing `tooltip.formatter` → `TooltipSink` pipeline still builds the
 * model — this module only decides *which* point is hovered, never what the
 * tooltip says.
 *
 * ## The rule (uPlot `cursor.hover` + `cursor.focus`, as Grafana configures them)
 *
 * Grafana never measures a 2D radius. It runs two independent 1-D tests in
 * sequence, on different axes:
 *
 * 1. **Snap on x.** Each series' datapoint nearest the cursor's x *value*.
 * 2. **Refine on x distance.** Normally unlimited — a point stays a candidate no
 *    matter how far left/right it is. Only when the snapped point is a gap does
 *    a limit apply: scan outward for the nearest real point, and take it only if
 *    it is within {@link NULL_SCAN_PROXIMITY_PX}.
 * 3. **Pick on y distance.** The winner is the series whose candidate is
 *    *vertically* closest to the cursor, and only if within
 *    {@link FOCUS_PROXIMITY_PX}. Nothing within that band means no tooltip.
 *
 * Setting {@link ProximityOptions.hoverProximity} (core's "Hover proximity"
 * panel option, which has no default) replaces *both* limits with that one
 * value, and disables the gap-scan special case.
 *
 * Upstream: `grafana/grafana`
 * (`public/app/core/components/TimeSeries/utils.ts`, `cursor` config) and
 * uPlot 1.6.32 (`src/uPlot.js`, `cursor.dataIdx` / `cursor.focus` dispatch).
 *
 * ## Where this deviates, and why
 *
 * uPlot requires every series to share one x array, so core snaps once to a
 * single global index. This panel's converter emits per-series `[time, value]`
 * tuples from unaligned frames, so there is no global index — the snap is done
 * per series instead. For the common case (frames sharing a time field) the two
 * are identical; for unaligned frames, per-series snapping is strictly better,
 * since a global index would be meaningless for the other frames.
 */
import { type DataFrame } from '@grafana/data';
import { TooltipDisplayMode } from '@grafana/schema';
import { type SeriesType } from 'editor/types';
import { isCartesianSingleValueSeriesType } from 'lib/echarts/charts/narrowing';
import { forEachTimeSeriesField, framesHaveTimeField } from 'lib/echarts/converters/frames';
import { type EChartsType } from 'lib/echarts/echarts';

/**
 * Vertical band (px) within which a series counts as hovered. Core's
 * `DEFAULT_FOCUS_PROXIMITY` (`TimeSeries/utils.ts`), also uPlot's
 * `cursor.focus.prox` default in `UPlotConfigBuilder`.
 */
export const FOCUS_PROXIMITY_PX = 30;

/**
 * How far (px) to scan left/right for a real point when the cursor snaps onto a
 * gap. Core's `DEFAULT_HOVER_NULL_PROXIMITY`.
 */
export const NULL_SCAN_PROXIMITY_PX = 15;

/**
 * One series' raw values, in the order
 * `timeSeriesToEChartsOption` emits series, so the array index *is* the ECharts
 * `seriesIndex`.
 *
 * Values are unscaled field values (epoch-ms for `x`); pixel positions are
 * resolved through the chart's coordinate system, which keeps this correct for
 * log axes, multiple y axes, and zoomed ranges.
 */
export interface SeriesPoints {
  x: ArrayLike<number>;
  y: ArrayLike<number | null | undefined>;
}

/**
 * Per-series values for {@link findHoveredPoint}, flattened in the same order
 * `timeSeriesToEChartsOption` emits series — both walk
 * {@link forEachTimeSeriesField}, which is what makes the array index usable as
 * the ECharts `seriesIndex`.
 */
export function collectSeriesPoints(frames: DataFrame[]): SeriesPoints[] {
  const series: SeriesPoints[] = [];
  forEachTimeSeriesField(frames, ({ field, timeField }) => {
    series.push({ x: timeField.values, y: field.values });
  });
  return series;
}

/**
 * Whether hover should be resolved by proximity rather than by ECharts' own
 * hit-testing. Only one shape qualifies: a single-value cartesian chart over a
 * time axis, which is exactly what `timeSeriesToEChartsOption` emits
 * `[time, value]` series for (and so the only shape whose array index is a valid
 * `seriesIndex`). Category axes, pie, hierarchy and heatmap keep native
 * hit-testing.
 *
 * Bars are excluded: proximity picks the vertically-nearest point across series,
 * which for a column of bars is the nearest bar *top* rather than the bar the
 * cursor is actually over. Bars have a large hit area, so ECharts' native
 * item/axis hover already tooltips (and emphasises) the hovered bar correctly —
 * matching what the user is pointing at (see `useEChartsTooltip`).
 *
 * None mode renders no tooltip at all, so it skips the work entirely.
 */
function shouldUseProximity(seriesType: SeriesType, mode: TooltipDisplayMode): boolean {
  return (
    mode !== TooltipDisplayMode.None && seriesType !== 'bar' && isCartesianSingleValueSeriesType(seriesType) === true
  );
}

/**
 * The proximity inputs for a chart, or `undefined` when the family or mode does
 * not use proximity hover (see {@link shouldUseProximity}).
 *
 * Built for both remaining tooltip modes, but used differently by each: in
 * Single it decides what the tooltip shows, in All only which row is emphasised
 * (see `useEChartsTooltip`).
 */
export function collectProximitySeries(
  frames: DataFrame[],
  seriesType: SeriesType,
  mode: TooltipDisplayMode
): SeriesPoints[] | undefined {
  if (!shouldUseProximity(seriesType, mode) || !framesHaveTimeField(frames)) {
    return undefined;
  }
  return collectSeriesPoints(frames);
}

/** The datapoint under (or near) the cursor. */
export interface ProximityHit {
  seriesIndex: number;
  dataIndex: number;
  /** Vertical distance in px from the cursor to the datapoint. */
  distance: number;
}

export interface ProximityOptions {
  /**
   * Core's "Hover proximity" option. When set, it becomes *both* the x and the y
   * limit. When omitted, x is unbounded and y is {@link FOCUS_PROXIMITY_PX}.
   */
  hoverProximity?: number;
}

/**
 * Index of the value in ascending `x` closest to `target`.
 *
 * Binary search, so a 10k-point series costs ~14 comparisons per mouse move
 * rather than a full scan. Returns -1 for an empty series.
 */
export function nearestIndex(x: ArrayLike<number>, target: number): number {
  const len = x.length;
  if (len === 0) {
    return -1;
  }

  let lo = 0;
  let hi = len - 1;
  // Narrow to the bracketing pair [lo, hi] with x[lo] <= target <= x[hi].
  while (hi - lo > 1) {
    const mid = (lo + hi) >>> 1;
    if (x[mid] <= target) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  return target - x[lo] <= x[hi] - target ? lo : hi;
}

/** First index at or beyond `from` (walking by `step`) whose value is real. */
function scanForValue(y: SeriesPoints['y'], from: number, step: -1 | 1): number | null {
  for (let i = from; i >= 0 && i < y.length; i += step) {
    if (y[i] != null) {
      return i;
    }
  }
  return null;
}

/**
 * Resolve which point of one series is the candidate for the cursor, applying
 * the x-distance stage. `null` means this series has no candidate.
 *
 * Mirrors uPlot's compiled `cursor.dataIdx`: a real point passes straight
 * through unless an explicit proximity is configured; a gap triggers an outward
 * scan whose result is only accepted within the applicable limit.
 */
function refineByX(
  chart: EChartsType,
  seriesIndex: number,
  { x, y }: SeriesPoints,
  snapped: number,
  cursorPx: number,
  hoverProximity: number | undefined
): number | null {
  const xPixel = (index: number): number | null => {
    const point = chart.convertToPixel({ seriesIndex }, [x[index], 0]);
    return Array.isArray(point) && Number.isFinite(point[0]) ? point[0] : null;
  };

  if (y[snapped] != null) {
    if (hoverProximity == null) {
      // No x limit: the point stays a candidate however far away it is, and the
      // vertical stage decides. This is core's default and is why hovering an
      // empty region of the plot still tooltips the line running through it.
      return snapped;
    }
    const px = xPixel(snapped);
    return px != null && Math.abs(cursorPx - px) <= hoverProximity ? snapped : null;
  }

  // The cursor landed on a gap; look outward for the nearest real point.
  const left = scanForValue(y, snapped - 1, -1);
  const right = scanForValue(y, snapped + 1, 1);
  if (left == null && right == null) {
    return null;
  }

  const limit = hoverProximity ?? NULL_SCAN_PROXIMITY_PX;
  const leftPx = left == null ? null : xPixel(left);
  const rightPx = right == null ? null : xPixel(right);
  const leftDelta = leftPx == null ? Infinity : cursorPx - leftPx;
  const rightDelta = rightPx == null ? Infinity : rightPx - cursorPx;

  // uPlot prefers the left candidate on a tie.
  if (leftDelta <= rightDelta) {
    return leftDelta <= limit ? left : null;
  }
  return rightDelta <= limit ? right : null;
}

/**
 * The hovered datapoint for `cursor` (in chart/zrender pixel coordinates), or
 * `null` when no series is close enough — which in Single mode means no tooltip,
 * matching core.
 *
 * Ties break toward the lower `seriesIndex` (strict `<`, as in uPlot), so the
 * resolved point is stable while the cursor sits still.
 */
export function findHoveredPoint(
  chart: EChartsType,
  cursor: { x: number; y: number },
  series: readonly SeriesPoints[],
  { hoverProximity }: ProximityOptions = {}
): ProximityHit | null {
  // Outside the grid (over an axis, the legend gutter, or panel padding) there
  // is nothing to hover, and `convertFromPixel` would extrapolate past the axis
  // bounds rather than report the miss.
  if (!chart.containPixel({ gridIndex: 0 }, [cursor.x, cursor.y])) {
    return null;
  }

  const cursorData = chart.convertFromPixel({ gridIndex: 0 }, [cursor.x, cursor.y]);
  if (!Array.isArray(cursorData) || !Number.isFinite(cursorData[0])) {
    return null;
  }
  const cursorX = cursorData[0];
  const focusLimit = hoverProximity ?? FOCUS_PROXIMITY_PX;

  let best: ProximityHit | null = null;

  for (let seriesIndex = 0; seriesIndex < series.length; seriesIndex++) {
    const points = series[seriesIndex];
    const snapped = nearestIndex(points.x, cursorX);
    if (snapped < 0) {
      continue;
    }

    const dataIndex = refineByX(chart, seriesIndex, points, snapped, cursor.x, hoverProximity);
    if (dataIndex == null) {
      continue;
    }
    // `refineByX` only ever returns an index with a real value; re-reading it
    // through a local narrows the type without an assertion.
    const value = points.y[dataIndex];
    if (value == null) {
      continue;
    }

    const point = chart.convertToPixel({ seriesIndex }, [points.x[dataIndex], value]);
    if (!Array.isArray(point) || !Number.isFinite(point[1])) {
      continue;
    }

    const distance = Math.abs(point[1] - cursor.y);
    if (distance < (best?.distance ?? Infinity)) {
      best = { seriesIndex, dataIndex, distance };
    }
  }

  return best != null && best.distance <= focusLimit ? best : null;
}
