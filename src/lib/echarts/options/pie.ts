import { type GrafanaTheme2 } from '@grafana/data';
import { type PieSeriesOption } from 'echarts';
import { type ECBasicOption } from 'echarts/types/dist/shared';
import { PIE_LABELS_DEFAULT, PIE_TYPE_DEFAULT } from 'editor/constants';
import { type PieChartType, type PieEmphasisFocus, type PieLabel, type PieSelectedMode } from 'editor/types';
import { type EChartPieDataItem } from 'lib/echarts/charts/types';
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

/** Re-enabled label text-shadow blur radius (px) when the Advanced switch is on. */
const PIE_LABEL_TEXT_SHADOW_BLUR = 3;
/** Re-enabled label text-stroke width (px) when the Advanced switch is on. */
const PIE_LABEL_TEXT_BORDER_WIDTH = 2;

/**
 * Advanced label-style overrides threaded through `getPieLabelStyle`: an explicit
 * `color` (overriding the theme text color) and switches that re-enable the
 * ECharts label text shadow / stroke this helper zeroes by default.
 */
export interface PieLabelStyleOptions {
  /** Override the theme text color (Advanced "Label color"). */
  color?: string;
  /** Re-enable the label drop shadow (Advanced "Label text shadow"). */
  textShadow?: boolean;
  /** Re-enable the label contrast stroke (Advanced "Label text stroke"). */
  textStroke?: boolean;
}

/**
 * Themed pie slice label: Grafana's font family and primary text color, with the
 * default text shadow/stroke zeroed out. ECharts' default label draws a blurred
 * shadow and a contrast stroke ("awful text shadow") in its own font; clearing
 * them and applying the theme makes labels match the rest of Grafana.
 *
 * Advanced options (Tier 3) override this: `color` replaces the theme text color,
 * and the `textShadow` / `textStroke` switches re-enable the zeroed shadow/stroke.
 * With no options (the default) the output is unchanged — the flat, theme-colored
 * label — so existing snapshots stay stable.
 * https://echarts.apache.org/en/option.html#series-pie.label
 */
export function getPieLabelStyle(
  theme: GrafanaTheme2,
  textStyle?: Pick<PieLabelStyleOptions, 'textShadow' | 'textStroke'>,
  color?: string
): PieSeriesOption['label'] {
  const { textShadow = false, textStroke = false } = textStyle ?? {};
  return {
    ...getThemeTextStyle(theme),
    // An explicit label color overrides the theme text color from getThemeTextStyle.
    ...(color ? { color } : {}),
    // Default: zeroed (flat) shadow/stroke. The Advanced switches re-enable each,
    // drawing a subtle drop shadow / contrast stroke against the panel background.
    textShadowBlur: textShadow ? PIE_LABEL_TEXT_SHADOW_BLUR : 0,
    textShadowColor: textShadow ? theme.colors.background.canvas : 'transparent',
    textBorderWidth: textStroke ? PIE_LABEL_TEXT_BORDER_WIDTH : 0,
    ...(textStroke ? { textBorderColor: theme.colors.background.canvas } : {}),
  };
}

/**
 * ECharts pie `series.selectedMode` / `series.selectedOffset` for the Advanced
 * "Select / explode" option. `off` (or unset) maps to `false` (matching ECharts'
 * default, so nothing changes); `single` / `multiple` allow selecting slices,
 * which explode outward by `selectedOffset` px when set.
 * https://echarts.apache.org/en/option.html#series-pie.selectedMode
 */
export function getPieSelection(
  mode: PieSelectedMode | undefined,
  offset: number | undefined
): Pick<PieSeriesOption, 'selectedMode' | 'selectedOffset'> {
  const selectedMode: PieSeriesOption['selectedMode'] = !mode || mode === 'off' ? false : mode;
  return {
    selectedMode,
    ...(selectedMode && offset ? { selectedOffset: offset } : {}),
  };
}

/**
 * Resolve the Advanced "Rounded corners" value into an ECharts
 * `itemStyle.borderRadius`. A radius of 0 (the default) or unset returns
 * `undefined` so the key is omitted (square corners; snapshot-stable).
 * https://echarts.apache.org/en/option.html#series-pie.itemStyle.borderRadius
 */
export function getPieBorderRadius(radius: number | undefined): number | undefined {
  return radius && radius > 0 ? radius : undefined;
}

/**
 * Per-slice ECharts `itemStyle`, composing the slice color with the Advanced
 * "Rounded corners" border radius. Keeping this in one builder lets shape
 * contributions merge without clobbering `{ color }`; `borderRadius` is only
 * added when non-zero so the default per-slice item style is unchanged.
 */
export function getPieItemStyle(
  color: string | undefined,
  borderRadius: number | undefined
): EChartPieDataItem['itemStyle'] {
  return {
    color,
    ...(borderRadius ? { borderRadius } : {}),
  };
}

/**
 * ECharts pie `series.emphasis` for the Advanced "Emphasis" option (hover state).
 * `focus` is omitted at the `none` default (ECharts' default); `scale` is emitted
 * only when explicitly set. Returns `undefined` when nothing is configured so the
 * key is omitted entirely and the default hover behavior is unchanged.
 * https://echarts.apache.org/en/option.html#series-pie.emphasis
 */
export function getPieEmphasis(
  focus: PieEmphasisFocus | undefined,
  scale: boolean | undefined
): PieSeriesOption['emphasis'] | undefined {
  const emphasis: NonNullable<PieSeriesOption['emphasis']> = {};
  if (focus && focus !== 'none') {
    emphasis.focus = focus;
  }
  if (typeof scale === 'boolean') {
    emphasis.scale = scale;
  }
  return Object.keys(emphasis).length > 0 ? emphasis : undefined;
}

/**
 * ECharts pie zero-sum / empty-circle keys for the Advanced "Zero-sum / empty"
 * option. Both ECharts defaults are `true`, so each key is emitted only when set
 * to `false`; leaving the defaults returns `{}` (snapshot-stable).
 * https://echarts.apache.org/en/option.html#series-pie.stillShowZeroSum
 */
export function getPieEmptyState(
  stillShowZeroSum: boolean | undefined,
  showEmptyCircle: boolean | undefined
): Pick<PieSeriesOption, 'stillShowZeroSum' | 'showEmptyCircle'> {
  return {
    ...(stillShowZeroSum === false ? { stillShowZeroSum: false } : {}),
    ...(showEmptyCircle === false ? { showEmptyCircle: false } : {}),
  };
}

/**
 * ECharts pie clockwise / avoid-label-overlap keys for the Advanced "Clockwise /
 * avoid overlap" option. Both ECharts defaults are `true`, so each key is emitted
 * only when set to `false`; leaving the defaults returns `{}` (snapshot-stable).
 * https://echarts.apache.org/en/option.html#series-pie.clockwise
 */
export function getPieOrientation(
  clockwise: boolean | undefined,
  avoidLabelOverlap: boolean | undefined
): Pick<PieSeriesOption, 'clockwise' | 'avoidLabelOverlap'> {
  return {
    ...(clockwise === false ? { clockwise: false } : {}),
    ...(avoidLabelOverlap === false ? { avoidLabelOverlap: false } : {}),
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
  timeZone?: string,
  labelStyle?: PieLabelStyleOptions
): PieSeriesOption['label'] {
  const style = getPieLabelStyle(
    theme,
    { textShadow: labelStyle?.textShadow, textStroke: labelStyle?.textStroke },
    labelStyle?.color
  );
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
