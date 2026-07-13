import { dateTimeFormat, type GrafanaTheme2 } from '@grafana/data';
// `renderItem`'s type must come from the `echarts` barrel so it matches the
// `CustomSeriesOption.renderItem` declaration; the shared-dist copy is a
// separate declaration ECharts' own option type rejects.
import { type CustomSeriesOption, type CustomSeriesRenderItem } from 'echarts';
import {
  type CallbackDataParams,
  type ContinuousVisualMapOption,
  type TopLevelFormatterParams,
} from 'echarts/types/dist/shared';
import type { TimeAxisBaseOption } from 'echarts/types/src/coord/axisCommonTypes';
import type { CartesianAxisOption } from 'echarts/types/src/coord/cartesian/AxisModel';
import { type ZRRectLike } from 'echarts/types/src/util/types';
import {
  type BinnedHeatmapCell,
  type BinnedHeatmapData,
  formatBucketBound,
} from 'lib/echarts/converters/binnedHeatmap';
import { getThemeTextStyle } from 'lib/echarts/options/base';
import { getHeatmapColors, HEATMAP_VALUE_DIM } from 'lib/echarts/options/constants';
import { isRect } from 'lib/echarts/options/narrowing';
import {
  type BinnedHeatmapTooltipContext,
  type HeatmapColorScalePlacement,
  type HeatmapColorScheme,
} from 'lib/echarts/options/types';
import { buildTooltipShell, formatTooltipValue } from 'lib/echarts/tooltip/template';

/**
 * Custom tick/label/grid-line placement for the heatmap bucket (Y) axis so the
 * axis reads as discrete buckets rather than an evenly-spaced numeric scale.
 *
 * ECharts auto-picks "nice" numeric ticks on a value axis (e.g. 0, 5, 10, ...),
 * which land between bucket bounds. Instead we pin:
 * - split lines to every bucket boundary (so each row is fenced off), and
 * - labels to each bucket's upper edge (`le`/numeric bounds) or midpoint
 *   (ordinal rows labelled by name), formatted from the bucket's own label.
 *
 * Uses ECharts `customValues` (value-axis support added in 5.5), so it requires
 * ECharts >= 5.5 (the plugin ships 6.x).
 */
export function getBinnedHeatmapBucketAxis(data: BinnedHeatmapData): CartesianAxisOption | TimeAxisBaseOption {
  const rawBuckets = data.yBuckets;
  if (rawBuckets.length === 0) {
    return {};
  }

  const labelByValue = new Map<number, string>();
  if (data.yLabelPlacement === 'center') {
    for (const bucket of rawBuckets) {
      labelByValue.set((bucket.start + bucket.end) / 2, bucket.label);
    }
  } else {
    // Label the bottom edge of the first bucket too, so the axis isn't missing
    // its lower bound (e.g. the leading "0" of a Prometheus histogram).
    labelByValue.set(rawBuckets[0].start, formatBucketBound(rawBuckets[0].start));
    for (const bucket of rawBuckets) {
      labelByValue.set(bucket.end, bucket.label);
    }
  }

  const labelValues = Array.from(labelByValue.keys()).sort((a, b) => a - b);

  return {
    axisLabel: { customValues: labelValues, formatter: (value: number) => labelByValue.get(Number(value)) ?? '' },
    axisTick: { customValues: labelValues },
    breaks: rawBuckets,
  };
}

/**
 * Encode cells as `[xStart, yStart, xEnd, yEnd, value]` tuples. The custom
 * series `renderItem` reads the two corners to size each rect; the value dim
 * ({@link HEATMAP_VALUE_DIM}) is what the visualMap maps to a color. ECharts
 * passes this same tuple back as the tooltip hover param's `value`.
 * See https://echarts.apache.org/en/option.html#series-custom.data
 */
export function encodeBinnedHeatmapData(cells: BinnedHeatmapCell[]): Array<Array<number | null>> {
  return cells.map((cell) => [cell.xStart, cell.yStart, cell.xEnd, cell.yEnd, cell.value]);
}

/**
 * Intersect two rectangles, returning undefined when they don't overlap.
 * Ported from ECharts' `graphic.clipRectByRect` so the heatmap option code has
 * no ECharts runtime import (letting ECharts load as a shared async chunk).
 * https://github.com/apache/echarts/blob/master/src/util/graphic.ts
 */
function clipRectByRect(target: ZRRectLike, clip: ZRRectLike): ZRRectLike | undefined {
  const x = Math.max(target.x, clip.x);
  const x2 = Math.min(target.x + target.width, clip.x + clip.width);
  const y = Math.max(target.y, clip.y);
  const y2 = Math.min(target.y + target.height, clip.y + clip.height);

  if (x2 >= x && y2 >= y) {
    return { x, y, width: x2 - x, height: y2 - y };
  }
  return undefined;
}

/**
 * Canvas shadow applied to a cell in its emphasis (hover) state. Assignable to
 * an element's `emphasis.style` (a subset of ECharts' path style props).
 */
export interface BinnedHeatmapCellShadow {
  shadowBlur: number;
  shadowColor: string;
}

/**
 * Approximate `theme.shadows.z3` for canvas rendering. The theme's z3 is a CSS
 * box-shadow string that can't be applied to a canvas element, so we map it to a
 * fixed blur plus a theme-derived shadow color (darker/denser on dark themes).
 * Used by the cells' emphasis state so hovering the visualMap (`hoverLink`) or a
 * cell lifts the matching cells, mirroring the ECharts heatmap-cartesian example.
 */
export function getBinnedHeatmapCellEmphasisShadow(theme: GrafanaTheme2): BinnedHeatmapCellShadow {
  return {
    shadowBlur: 10,
    shadowColor: theme.isDark ? 'rgba(0, 0, 0, 0.75)' : 'rgba(0, 0, 0, 0.35)',
  };
}

/**
 * Build the `renderItem` for the binned heatmap custom series: convert each
 * cell's two corners to pixels via `api.coord`, draw a rect clipped to the grid,
 * and fill it with the color the visualMap computed for this item
 * (`api.visual('color')`). Works on a continuous `time` x-axis, unlike the
 * native heatmap series.
 *
 * The returned rect carries an `emphasis.style` shadow so hovering the visualMap
 * (`hoverLink`) or an individual cell lifts the matching cells.
 * See https://echarts.apache.org/en/option.html#series-custom.renderItem
 */
export function makeBinnedHeatmapRenderItem(emphasisShadow: BinnedHeatmapCellShadow): CustomSeriesRenderItem {
  return (params, api) => {
    const start = api.coord([api.value(0), api.value(1)]);
    const end = api.coord([api.value(2), api.value(3)]);

    const rect: ZRRectLike = {
      x: Math.min(start[0], end[0]),
      y: Math.min(start[1], end[1]),
      // +0.5 closes sub-pixel seams between adjacent cells.
      width: Math.abs(end[0] - start[0]) + 0.5,
      height: Math.abs(end[1] - start[1]) + 0.5,
    };

    // ECharts types `coordSys` only as `{ type }`, but on cartesian2d it also
    // carries the grid rect at runtime; narrow to our Rect to clip against it.
    if (!isRect(params.coordSys)) {
      return;
    }
    const shape = clipRectByRect(rect, params.coordSys);

    if (!shape) {
      return;
    }

    return {
      type: 'rect',
      shape,
      // Fill each cell with the color the visualMap computed for this item.
      // (`api.style()` is deprecated for custom series; set the style directly.)
      style: { fill: api.visual('color') },
      emphasis: { style: emphasisShadow },
    };
  };
}

/**
 * Per-cell tooltip for the binned heatmap custom series. Unlike the generic
 * tooltip (which would show the series name "Heatmap" and the raw cell value),
 * this matches core Grafana: the X (time/value) in the header, then a "Value"
 * row and the bucket "Name" row. The bucket label is recovered from the cell's Y
 * bounds via {@link BinnedHeatmapData.yBuckets}, the same labels the bucket axis
 * uses.
 *
 * ECharts hands `params.value` back the encoded `[xStart, yStart, xEnd, yEnd,
 * value]` tuple (item trigger). Returns safe DOM (no innerHTML) via the shared
 * tooltip shell. See https://echarts.apache.org/en/option.html#series-custom.tooltip
 */
export function buildBinnedHeatmapTooltip(
  data: BinnedHeatmapData,
  ctx: BinnedHeatmapTooltipContext
): (params: TopLevelFormatterParams) => HTMLElement {
  const bucketLabels = new Map<string, string>();
  for (const bucket of data.yBuckets) {
    bucketLabels.set(`${bucket.start}:${bucket.end}`, bucket.label);
  }

  const formatX = (x: number): string => {
    if (!Number.isFinite(x)) {
      return String(x);
    }
    return data.xIsTime ? dateTimeFormat(x, { timeZone: ctx.timeZone }) : formatBucketBound(x);
  };

  return (params) => {
    const param = (Array.isArray(params) ? params[0] : params) as CallbackDataParams | undefined;
    const tuple = (Array.isArray(param?.value) ? param.value : []) as Array<number | null>;
    const xStart = Number(tuple[0]);
    const yStart = Number(tuple[1]);
    const yEnd = Number(tuple[3]);
    const value = tuple[HEATMAP_VALUE_DIM] ?? null;

    const bucket = bucketLabels.get(`${yStart}:${yEnd}`) ?? `${formatBucketBound(yStart)} - ${formatBucketBound(yEnd)}`;

    const shell = buildTooltipShell(ctx.theme);
    shell.appendHeader(formatX(xStart));
    shell.appendRow({ label: 'Value', value: formatTooltipValue(value, ctx.formatValue) });
    shell.appendRow({ label: 'Name', value: bucket });
    return shell.root;
  };
}

/**
 * Build the binned heatmap custom series. `yAxisIndex` defaults to 0 (the bucket
 * axis). `zlevel` places the cells on the series canvas layer (see the panel's
 * `zLevel.series`), matching the cartesian series so layered canvas capture can
 * isolate the series draw calls.
 */
export function getBinnedHeatmapSeries(
  data: BinnedHeatmapData,
  tooltipCtx: BinnedHeatmapTooltipContext,
  yAxisIndex = 0,
  zlevel?: number
): CustomSeriesOption {
  return {
    name: 'Heatmap',
    type: 'custom',
    coordinateSystem: 'cartesian2d',
    yAxisIndex,
    zlevel,
    renderItem: makeBinnedHeatmapRenderItem(getBinnedHeatmapCellEmphasisShadow(tooltipCtx.theme)),
    // Map tuple dims to axes: x spans dims [0, 2] (xStart..xEnd), y spans [1, 3]
    // (yStart..yEnd), and the tooltip reads the value dim.
    // See https://echarts.apache.org/en/option.html#series-custom.encode
    encode: { x: [0, 2], y: [1, 3], tooltip: [HEATMAP_VALUE_DIM] },
    data: encodeBinnedHeatmapData(data.cells),
    // Exclude from the toggle legend; the cell layer isn't a togglable series.
    legendHoverLink: false,
    // Per-series tooltip so a hovered cell reads like core Grafana's heatmap.
    // https://echarts.apache.org/en/option.html#series-custom.tooltip
    tooltip: { formatter: buildBinnedHeatmapTooltip(data, tooltipCtx) },
  };
}

/**
 * Continuous visualMap that colors only the binned heatmap series (by
 * `seriesIndex`). Placed on the right (vertical) by default or on the bottom
 * (horizontal), sized to the cell value range. `hoverLink` (on by default)
 * highlights the cells in a hovered value range; the highlight shadow lives on
 * the series emphasis state (see {@link makeBinnedHeatmapRenderItem}).
 * See https://echarts.apache.org/en/option.html#visualMap-continuous
 */
export function getBinnedHeatmapVisualMap(
  data: BinnedHeatmapData,
  theme: GrafanaTheme2,
  seriesIndex: number,
  scheme?: HeatmapColorScheme,
  placement: HeatmapColorScalePlacement = 'right'
): ContinuousVisualMapOption {
  // Position/size the bar per placement. ECharts positions accept a number (px)
  // or a percent/keyword string, so plain px numbers are used here.
  const orientation: Pick<
    ContinuousVisualMapOption,
    'orient' | 'left' | 'right' | 'top' | 'bottom' | 'itemWidth' | 'itemHeight'
  > =
    placement === 'bottom'
      ? { orient: 'horizontal', bottom: 8, left: 'center', itemWidth: 120, itemHeight: 12 }
      : { orient: 'vertical', right: 8, top: 'middle', itemWidth: 12, itemHeight: 120 };

  return {
    type: 'continuous',
    min: data.valueMin,
    max: data.valueMax === data.valueMin ? data.valueMin + 1 : data.valueMax,
    dimension: HEATMAP_VALUE_DIM,
    seriesIndex,
    calculable: true,
    hoverLink: true,
    ...orientation,
    inRange: { color: getHeatmapColors(scheme) },
    textStyle: getThemeTextStyle(theme),
  };
}
