import { type HeatmapColorScheme, type HeatmapLayout } from 'lib/echarts/options/types';

export const heatmapColorSchemeDefault: HeatmapColorScheme = 'spectral';
/** Default heatmap layout: the continuous, interval-cell dataplane rendering. */
export const heatmapLayoutDefault: HeatmapLayout = 'binned';
/**
 * Color stops per scheme, low value -> high value. Kept as static gradients
 * (matching common scientific colormaps) so the layer reads consistently in
 * both themes; the visualMap interpolates between the stops.
 */
export const COLOR_SCHEMES: Record<HeatmapColorScheme, string[]> = {
  spectral: [
    '#5e4fa2',
    '#3288bd',
    '#66c2a5',
    '#abdda4',
    '#e6f598',
    '#fee08b',
    '#fdae61',
    '#f46d43',
    '#d53e4f',
    '#9e0142',
  ],
  blues: ['#f7fbff', '#deebf7', '#c6dbef', '#9ecae1', '#6baed6', '#4292c6', '#2171b5', '#08519c', '#08306b'],
  turbo: [
    '#30123b',
    '#4145ab',
    '#4675ed',
    '#39a2fc',
    '#1bcfd4',
    '#24eca6',
    '#61fc6c',
    '#a4fc3b',
    '#d1e834',
    '#f3c63a',
    '#fe9b2d',
    '#f36315',
    '#d93806',
    '#b11901',
    '#7a0402',
  ],
  magma: ['#000004', '#1c1044', '#4f127b', '#812581', '#b5367a', '#e55064', '#fb8761', '#fec287', '#fcfdbf'],
};
/** Resolve the gradient color stops for a scheme (falls back to the default). */
export function getHeatmapColors(scheme?: HeatmapColorScheme): string[] {
  return COLOR_SCHEMES[scheme ?? heatmapColorSchemeDefault] ?? COLOR_SCHEMES[heatmapColorSchemeDefault];
}
/** Dimension index of the cell value within the encoded heatmap data tuple. */
export const HEATMAP_VALUE_DIM = 4;
/** Reserved width (px) for the vertical visualMap color scale on the right. */
export const HEATMAP_VISUALMAP_WIDTH = 82;
/**
 * Reserved height (px) for the horizontal visualMap color scale on the bottom.
 * Sized to hold the x-axis labels AND the color bar in a dedicated band below
 * them, so the bar clears the labels instead of overlapping them.
 */
export const HEATMAP_VISUALMAP_HEIGHT = 60;
