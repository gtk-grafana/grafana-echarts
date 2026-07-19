import { type GrafanaTheme2 } from '@grafana/data';
import { type PieSeriesOption } from 'echarts';
import { type ECBasicOption } from 'echarts/types/dist/shared';
import { PIE_LABELS_DEFAULT, PIE_PERCENT_PRECISION_DEFAULT, PIE_TYPE_DEFAULT } from 'editor/constants';
import { type PieChartType, type PieLabel, type PieLabelOverflow } from 'editor/types';
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
 *
 * The optional `innerRadius`/`outerRadius` (percentages, Advanced-only) override
 * the defaults: an `outerRadius` shrinks/grows the disc, and an `innerRadius`
 * carves a hole even for a plain pie. When neither is set, the pie-vs-donut
 * default logic (and existing snapshots) are unchanged.
 * https://echarts.apache.org/en/option.html#series-pie.radius
 */
export function getPieRadius(
  pieType: PieChartType | undefined,
  innerRadius?: number,
  outerRadius?: number
): PieSeriesOption['radius'] {
  const isDonut = (pieType ?? PIE_TYPE_DEFAULT) === 'donut';
  const outer = outerRadius != null ? `${outerRadius}%` : PIE_OUTER_RADIUS;
  if (isDonut || innerRadius != null) {
    const inner = innerRadius != null ? `${innerRadius}%` : DONUT_INNER_RADIUS;
    return [inner, outer];
  }
  return outer;
}

/**
 * ECharts pie `series.center` (`[x, y]` percentages) when the panel overrides the
 * center. Returns `undefined` when neither coordinate is set, so the ECharts
 * default (centered) is left untouched and existing snapshots stay stable. A
 * single provided axis keeps the other centered at `50%`. Advanced-only.
 * https://echarts.apache.org/en/option.html#series-pie.center
 */
export function getPieCenter(centerX?: number, centerY?: number): PieSeriesOption['center'] | undefined {
  if (centerX == null && centerY == null) {
    return undefined;
  }
  return [`${centerX ?? 50}%`, `${centerY ?? 50}%`];
}

/**
 * ECharts pie `series.minShowLabelAngle`: hide the label on slices whose central
 * angle is below `angle` degrees (declutters many-slice pies). Returns `undefined`
 * for `0`/unset so nothing is written and all labels show (existing behavior).
 * https://echarts.apache.org/en/option.html#series-pie.minShowLabelAngle
 */
export function getPieMinShowLabelAngle(angle: number | undefined): number | undefined {
  return angle != null && angle > 0 ? angle : undefined;
}

/**
 * ECharts pie per-slice `itemStyle` border for slice separation
 * (`borderWidth`/`borderColor`). Returns the border keys only when
 * `borderWidth > 0`; otherwise an empty object so the per-slice `{ color }` is
 * left untouched and existing snapshots stay stable. Advanced-only.
 * https://echarts.apache.org/en/option.html#series-pie.itemStyle.borderWidth
 */
export function getPieItemStyle(
  borderWidth: number | undefined,
  borderColor: string | undefined
): Pick<NonNullable<PieSeriesOption['itemStyle']>, 'borderWidth' | 'borderColor'> {
  if (borderWidth == null || borderWidth <= 0) {
    return {};
  }
  return {
    borderWidth,
    ...(borderColor ? { borderColor } : {}),
  };
}

/**
 * Themed pie slice label: Grafana's font family and primary text color, with the
 * default text shadow/stroke zeroed out. ECharts' default label draws a blurred
 * shadow and a contrast stroke ("awful text shadow") in its own font; clearing
 * them and applying the theme makes labels match the rest of Grafana.
 * https://echarts.apache.org/en/option.html#series-pie.label
 */
export function getPieLabelStyle(
  theme: GrafanaTheme2,
  fontSize?: number,
  overflow?: PieLabelOverflow,
  width?: number
): PieSeriesOption['label'] {
  return {
    ...getThemeTextStyle(theme),
    textShadowBlur: 0,
    textShadowColor: 'transparent',
    textBorderWidth: 0,
    // Advanced-only overrides; omitted at the default so the theme size / no-wrap
    // behavior (and existing snapshots) are unchanged. `overflow: 'none'` is the
    // ECharts default, so it is treated as unset.
    ...(fontSize ? { fontSize } : {}),
    ...(overflow && overflow !== 'none' ? { overflow } : {}),
    ...(width ? { width } : {}),
  };
}

/**
 * Slice's share of the visible total, as a percentage string. `precision` decimal
 * places (default `PIE_PERCENT_PRECISION_DEFAULT` = 1, no trailing `.0` because the
 * rounded number is stringified). Advanced `percentPrecision` overrides it.
 */
function sliceShare(value: number | undefined, total: number, precision: number = PIE_PERCENT_PRECISION_DEFAULT): string {
  if (value == null || total <= 0) {
    return '0%';
  }
  const factor = Math.pow(10, precision);
  return `${Math.round((value / total) * 100 * factor) / factor}%`;
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
 *
 * `labelOptions` carries the Advanced-only legibility overrides (font size,
 * overflow/width, percent precision); all default to unset, leaving the styling
 * and `33.3%` percent output unchanged.
 */
export interface PieLabelOptions {
  fontSize?: number;
  overflow?: PieLabelOverflow;
  width?: number;
  percentPrecision?: number;
}

export function getPieContentLabel(
  labels: PieLabel[] | undefined,
  slices: PieSliceModel[],
  theme: GrafanaTheme2,
  timeZone?: string,
  labelOptions: PieLabelOptions = {}
): PieSeriesOption['label'] {
  const { fontSize, overflow, width, percentPrecision } = labelOptions;
  const style = getPieLabelStyle(theme, fontSize, overflow, width);
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
      parts.push(sliceShare(slice.value, total, percentPrecision));
    }
    return parts.join('\n');
  });

  return {
    ...style,
    show: true,
    formatter: (params) => (typeof params.dataIndex === 'number' ? (lines[params.dataIndex] ?? '') : ''),
  };
}
