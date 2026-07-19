import { type GrafanaTheme2 } from '@grafana/data';
import { type PieSeriesOption } from 'echarts';
import { type ECBasicOption } from 'echarts/types/dist/shared';
import { PIE_LABELS_DEFAULT, PIE_TYPE_DEFAULT } from 'editor/constants';
import { type PieChartType, type PieLabel } from 'editor/types';
import { type PieSliceModel } from 'lib/echarts/converters/pie';
import { createBaseOptions, getThemeTextStyle } from 'lib/echarts/options/base';
import { getValueFormatter } from 'lib/echarts/style';
import { formatTooltipValue } from 'lib/echarts/tooltip/template';

/** Base option for pie charts. Series data is merged at render time. */
export const pieDefaultOptions: ECBasicOption = {
  ...createBaseOptions({ includeLegend: true }),
};

/**
 * Outer slice radius, shared by pie and donut so both fill the panel the same;
 * matches ECharts' own default so a plain pie is unchanged.
 */
const PIE_OUTER_RADIUS = '75%';
/** Donut inner (hole) radius, as a fraction of the panel — a pie with the middle cut out. */
const DONUT_INNER_RADIUS = '50%';

/**
 * ECharts pie `series.radius` for the chart type (Grafana Pie chart "Pie chart
 * type": Pie / Donut). A donut is a pie with an inner hole (`[inner, outer]`); a
 * plain pie keeps a single outer radius. Unset falls back to `PIE_TYPE_DEFAULT`.
 * https://echarts.apache.org/en/option.html#series-pie.radius
 */
export function getPieRadius(pieType: PieChartType | undefined): PieSeriesOption['radius'] {
  return (pieType ?? PIE_TYPE_DEFAULT) === 'donut' ? [DONUT_INNER_RADIUS, PIE_OUTER_RADIUS] : PIE_OUTER_RADIUS;
}

/**
 * ECharts pie `series.minAngle` (degrees): the minimum angle of a slice, so tiny
 * long-tail slices are enlarged enough to stay visible and clickable. Returns the
 * value only when it is a positive finite number; `0`, negatives, and `undefined`
 * return `undefined` so the key is dropped at the ECharts default (`0`), keeping
 * existing renders/snapshots unchanged (the "omit when default" trick `getPieRadius`
 * relies on). https://echarts.apache.org/en/option.html#series-pie.minAngle
 */
export function getPieMinAngle(minAngle: number | undefined): PieSeriesOption['minAngle'] {
  return typeof minAngle === 'number' && minAngle > 0 ? minAngle : undefined;
}

/**
 * Themed pie slice label: Grafana's font family and primary text color, with the
 * default text shadow/stroke zeroed out. ECharts' default label draws a blurred
 * shadow and a contrast stroke ("awful text shadow") in its own font; clearing
 * them and applying the theme makes labels match the rest of Grafana.
 * https://echarts.apache.org/en/option.html#series-pie.label
 */
export function getPieLabelStyle(theme: GrafanaTheme2): PieSeriesOption['label'] {
  return {
    ...getThemeTextStyle(theme),
    textShadowBlur: 0,
    textShadowColor: 'transparent',
    textBorderWidth: 0,
  };
}

/** Slice's share of the visible total, as a percentage string (one decimal, no trailing `.0`). */
function sliceShare(value: number | undefined, total: number): string {
  if (value == null || total <= 0) {
    return '0%';
  }
  return `${Math.round((value / total) * 1000) / 10}%`;
}

/**
 * ECharts pie `series.label` for the selected slice-label content (Grafana Pie
 * chart "Labels": Name / Value / Percent). Mirrors core: each selected label is a
 * line, in Name → Value → Percent order; the value formats with the slice field's
 * unit/decimals (like the tooltip) and the percent is the slice's share of the
 * visible total (so labels and tooltip agree). `slices` are the visible slices in
 * render (dataIndex) order.
 *
 * An unset `labels` (`undefined`) falls back to `PIE_LABELS_DEFAULT` (the slice
 * name); an explicit empty selection (the user deselecting every label) hides the
 * label.
 */
export function getPieContentLabel(
  labels: PieLabel[] | undefined,
  slices: PieSliceModel[],
  theme: GrafanaTheme2,
  timeZone?: string
): PieSeriesOption['label'] {
  const style = getPieLabelStyle(theme);
  const selected = labels ?? PIE_LABELS_DEFAULT;
  if (selected.length === 0) {
    return { ...style, show: false };
  }

  // Precompute each slice's label lines once; the formatter closure indexes them
  // by dataIndex on every draw.
  const formatters = slices.map((slice) => getValueFormatter(slice.field, theme, timeZone));
  const total = slices.reduce((sum, slice) => sum + (slice.value ?? 0), 0);
  const lines = slices.map((slice, index) => {
    const parts: string[] = [];
    if (selected.includes('name')) {
      parts.push(slice.name);
    }
    if (selected.includes('value')) {
      parts.push(formatTooltipValue(slice.value ?? null, formatters[index]));
    }
    if (selected.includes('percent')) {
      parts.push(sliceShare(slice.value, total));
    }
    return parts.join('\n');
  });

  return {
    ...style,
    show: true,
    formatter: (params) => (typeof params.dataIndex === 'number' ? (lines[params.dataIndex] ?? '') : ''),
  };
}
