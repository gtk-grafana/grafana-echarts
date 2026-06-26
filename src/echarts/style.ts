import {
  Field,
  formattedValueToString,
  getDisplayProcessor,
  getFieldSeriesColor,
  GrafanaTheme2,
} from '@grafana/data';

/**
 * Formats a numeric value the way Grafana would for the given field, honoring
 * the standard Unit, Decimals, No value, and Value mappings field config.
 */
export type ValueFormatter = (value: number | null) => string;

/**
 * Resolve the color to use for an entire series/slice from a Grafana field.
 *
 * Uses the field's standard Color scheme config (`field.config.color`). For
 * by-series modes (e.g. the classic palette) this resolves via the field's
 * series index; for by-value modes it colors by the field's reduced value.
 *
 * Falls back to a theme color when no usable color can be derived so callers
 * always receive a renderable string.
 */
export function getSeriesColor(field: Field, theme: GrafanaTheme2): string {
  const seriesColor = getFieldSeriesColor(field, theme).color;
  if (seriesColor) {
    return seriesColor;
  }

  return theme.visualization.getColorByName('text');
}

/**
 * Resolve a color from Grafana's classic visualization palette by index,
 * cycling when the index exceeds the palette length. Useful for charts that
 * color by category (e.g. pie slices) rather than by field.
 */
export function getPaletteColorByIndex(index: number, theme: GrafanaTheme2): string {
  const { palette } = theme.visualization;
  const name = palette[index % palette.length];
  return theme.visualization.getColorByName(name);
}

/**
 * Build a value formatter for a field, reusing the field's already-computed
 * `display` processor when Grafana has applied field overrides, and otherwise
 * constructing one from the field config + theme.
 *
 * The returned formatter is convenient for ECharts `tooltip.valueFormatter` and
 * axis label formatters so rendered values match the rest of Grafana.
 */
export function getValueFormatter(field: Field, theme: GrafanaTheme2, timeZone?: string): ValueFormatter {
  const display = field.display ?? getDisplayProcessor({ field, theme, timeZone });

  return (value: number | null) => formattedValueToString(display(value));
}
