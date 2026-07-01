import { dateTimeFormat, type GrafanaTheme2 } from '@grafana/data';
import { formatBucketBound, type HeatmapCell, type HeatmapData } from 'lib/echarts/converters/heatmap';
import { getThemeTextStyle } from 'lib/echarts/options/base';
import { type ValueFormatter } from 'lib/echarts/style';
import { buildTooltipShell, formatTooltipValue } from 'lib/echarts/tooltip/template';
import { type CallbackDataParams, type TopLevelFormatterParams } from 'echarts/types/dist/shared';

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
export function getHeatmapBucketAxis(data: HeatmapData): Record<string, unknown> {
  const buckets = data.yBuckets;
  if (buckets.length === 0) {
    return {};
  }

  const boundaries = Array.from(new Set(buckets.flatMap((bucket) => [bucket.start, bucket.end])))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);

  const labelByValue = new Map<number, string>();
  if (data.yLabelPlacement === 'center') {
    for (const bucket of buckets) {
      labelByValue.set((bucket.start + bucket.end) / 2, bucket.label);
    }
  } else {
    // Label the bottom edge of the first bucket too, so the axis isn't missing
    // its lower bound (e.g. the leading "0" of a Prometheus histogram).
    labelByValue.set(buckets[0].start, formatBucketBound(buckets[0].start));
    for (const bucket of buckets) {
      labelByValue.set(bucket.end, bucket.label);
    }
  }

  const labelValues = Array.from(labelByValue.keys()).sort((a, b) => a - b);

  return {
    axisLabel: { customValues: labelValues, formatter: (value: number) => labelByValue.get(Number(value)) ?? '' },
    axisTick: { customValues: labelValues },
    splitLine: { customValues: boundaries },
  };
}

/** Built-in color gradients offered for the heatmap cell layer. */
export type HeatmapColorScheme = 'spectral' | 'blues' | 'turbo' | 'magma';

export const heatmapColorSchemeDefault: HeatmapColorScheme = 'spectral';

/**
 * Color stops per scheme, low value -> high value. Kept as static gradients
 * (matching common scientific colormaps) so the layer reads consistently in
 * both themes; the visualMap interpolates between the stops.
 */
const COLOR_SCHEMES: Record<HeatmapColorScheme, string[]> = {
  spectral: [
    '#5e4fa2', '#3288bd', '#66c2a5', '#abdda4', '#e6f598',
    '#fee08b', '#fdae61', '#f46d43', '#d53e4f', '#9e0142',
  ],
  blues: [
    '#f7fbff', '#deebf7', '#c6dbef', '#9ecae1', '#6baed6',
    '#4292c6', '#2171b5', '#08519c', '#08306b',
  ],
  turbo: [
    '#30123b', '#4145ab', '#4675ed', '#39a2fc', '#1bcfd4',
    '#24eca6', '#61fc6c', '#a4fc3b', '#d1e834', '#f3c63a',
    '#fe9b2d', '#f36315', '#d93806', '#b11901', '#7a0402',
  ],
  magma: [
    '#000004', '#1c1044', '#4f127b', '#812581', '#b5367a',
    '#e55064', '#fb8761', '#fec287', '#fcfdbf',
  ],
};

/** Resolve the gradient color stops for a scheme (falls back to the default). */
export function getHeatmapColors(scheme?: HeatmapColorScheme): string[] {
  return COLOR_SCHEMES[scheme ?? heatmapColorSchemeDefault] ?? COLOR_SCHEMES[heatmapColorSchemeDefault];
}

/** Dimension index of the cell value within the encoded heatmap data tuple. */
export const HEATMAP_VALUE_DIM = 4;

/**
 * Encode cells as `[xStart, yStart, xEnd, yEnd, value]` tuples. The custom
 * series `renderItem` reads the two corners to size each rect; the value dim
 * ({@link HEATMAP_VALUE_DIM}) is what the visualMap maps to a color. ECharts
 * passes this same tuple back as the tooltip hover param's `value`.
 * See https://echarts.apache.org/en/option.html#series-custom.data
 */
export function encodeHeatmapData(cells: HeatmapCell[]): Array<Array<number | null>> {
  return cells.map((cell) => [cell.xStart, cell.yStart, cell.xEnd, cell.yEnd, cell.value]);
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Intersect two rectangles, returning undefined when they don't overlap.
 * Ported from ECharts' `graphic.clipRectByRect` so the heatmap option code has
 * no ECharts runtime import (letting ECharts load as a shared async chunk).
 * https://github.com/apache/echarts/blob/master/src/util/graphic.ts
 */
function clipRectByRect(target: Rect, clip: Rect): Rect | undefined {
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
 * `renderItem` for the heatmap custom series: convert each cell's two corners to
 * pixels via `api.coord`, draw a rect clipped to the grid, and fill it with the
 * color the visualMap computed for this item (`api.visual('color')`). Works on a
 * continuous `time` x-axis, unlike the native heatmap series.
 */
export function heatmapRenderItem(params: any, api: any) {
  const xStart = api.value(0);
  const yStart = api.value(1);
  const xEnd = api.value(2);
  const yEnd = api.value(3);

  const start = api.coord([xStart, yStart]);
  const end = api.coord([xEnd, yEnd]);

  const rect = {
    x: Math.min(start[0], end[0]),
    y: Math.min(start[1], end[1]),
    // +0.5 closes sub-pixel seams between adjacent cells.
    width: Math.abs(end[0] - start[0]) + 0.5,
    height: Math.abs(end[1] - start[1]) + 0.5,
  };

  const coordSys = params.coordSys;
  const shape = clipRectByRect(rect, {
    x: coordSys.x,
    y: coordSys.y,
    width: coordSys.width,
    height: coordSys.height,
  });

  if (!shape) {
    return;
  }

  return {
    type: 'rect',
    shape,
    style: api.style({ fill: api.visual('color') }),
  };
}

/** Theme + formatting context the heatmap tooltip needs to match Grafana. */
export interface HeatmapTooltipContext {
  theme: GrafanaTheme2;
  timeZone: string;
  formatValue: ValueFormatter;
}

/**
 * Per-cell tooltip for the heatmap custom series. Unlike the generic tooltip
 * (which would show the series name "Heatmap" and the raw cell value), this
 * matches core Grafana: the X (time/value) in the header, then a "Value" row and
 * the bucket "Name" row. The bucket label is recovered from the cell's Y bounds
 * via {@link HeatmapData.yBuckets}, the same labels the bucket axis uses.
 *
 * ECharts hands `params.value` back the encoded `[xStart, yStart, xEnd, yEnd,
 * value]` tuple (item trigger). Returns safe DOM (no innerHTML) via the shared
 * tooltip shell. See https://echarts.apache.org/en/option.html#series-custom.tooltip
 */
export function buildHeatmapTooltip(
  data: HeatmapData,
  ctx: HeatmapTooltipContext
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

    const bucket =
      bucketLabels.get(`${yStart}:${yEnd}`) ?? `${formatBucketBound(yStart)} - ${formatBucketBound(yEnd)}`;

    const shell = buildTooltipShell(ctx.theme);
    shell.appendHeader(formatX(xStart));
    shell.appendRow({ label: 'Value', value: formatTooltipValue(value, ctx.formatValue) });
    shell.appendRow({ label: 'Name', value: bucket });
    return shell.root;
  };
}

/**
 * Build the heatmap custom series. `yAxisIndex` defaults to 0 (the bucket axis).
 */
export function getHeatmapSeries(data: HeatmapData, tooltipCtx: HeatmapTooltipContext, yAxisIndex = 0) {
  return {
    name: 'Heatmap',
    type: 'custom',
    coordinateSystem: 'cartesian2d',
    yAxisIndex,
    renderItem: heatmapRenderItem,
    // Map tuple dims to axes: x spans dims [0, 2] (xStart..xEnd), y spans [1, 3]
    // (yStart..yEnd), and the tooltip reads the value dim.
    // See https://echarts.apache.org/en/option.html#series-custom.encode
    encode: { x: [0, 2], y: [1, 3], tooltip: [HEATMAP_VALUE_DIM] },
    data: encodeHeatmapData(data.cells),
    // Exclude from the toggle legend; the cell layer isn't a togglable series.
    legendHoverLink: false,
    // Per-series tooltip so a hovered cell reads like core Grafana's heatmap.
    // https://echarts.apache.org/en/option.html#series-custom.tooltip
    tooltip: { formatter: buildHeatmapTooltip(data, tooltipCtx) },
  };
}

/** Reserved width (px) for the vertical visualMap color scale on the right. */
export const HEATMAP_VISUALMAP_WIDTH = 60;

/**
 * Continuous visualMap that colors only the heatmap series (by `seriesIndex`).
 * Rendered vertically on the right so it does not clash with a bottom legend;
 * sized to the cell value range.
 */
export function getHeatmapVisualMap(
  data: HeatmapData,
  theme: GrafanaTheme2,
  seriesIndex: number,
  scheme?: HeatmapColorScheme
) {
  return {
    type: 'continuous',
    min: data.valueMin,
    max: data.valueMax === data.valueMin ? data.valueMin + 1 : data.valueMax,
    dimension: HEATMAP_VALUE_DIM,
    seriesIndex,
    calculable: true,
    orient: 'vertical',
    right: 8,
    top: 'middle',
    itemWidth: 12,
    itemHeight: 120,
    inRange: { color: getHeatmapColors(scheme) },
    textStyle: { ...getThemeTextStyle(theme) },
  };
}
