import { GrafanaTheme2 } from '@grafana/data';
import { graphic } from 'echarts';
import { HeatmapCell, HeatmapData } from 'echarts/converters/heatmap';

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
 * series `renderItem` reads the two corners to size each rect; the value dim is
 * what the visualMap maps to a color.
 */
export function encodeHeatmapData(cells: HeatmapCell[]): Array<Array<number | null>> {
  return cells.map((cell) => [cell.xStart, cell.yStart, cell.xEnd, cell.yEnd, cell.value]);
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
  const shape = graphic.clipRectByRect(rect, {
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

/**
 * Build the heatmap custom series. `yAxisIndex` defaults to 0 (the bucket axis).
 */
export function getHeatmapSeries(data: HeatmapData, yAxisIndex = 0) {
  return {
    name: 'Heatmap',
    type: 'custom' as const,
    coordinateSystem: 'cartesian2d' as const,
    yAxisIndex,
    renderItem: heatmapRenderItem,
    encode: { x: [0, 2], y: [1, 3], tooltip: [HEATMAP_VALUE_DIM] },
    data: encodeHeatmapData(data.cells),
    // Exclude from the toggle legend; the cell layer isn't a togglable series.
    legendHoverLink: false,
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
    type: 'continuous' as const,
    min: data.valueMin,
    max: data.valueMax === data.valueMin ? data.valueMin + 1 : data.valueMax,
    dimension: HEATMAP_VALUE_DIM,
    seriesIndex,
    calculable: true,
    orient: 'vertical' as const,
    right: 8,
    top: 'middle' as const,
    itemWidth: 12,
    itemHeight: 120,
    inRange: { color: getHeatmapColors(scheme) },
    textStyle: { color: theme.colors.text.primary, fontFamily: theme.typography.fontFamily },
  };
}
