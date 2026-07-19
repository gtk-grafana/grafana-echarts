import { type GrafanaTheme2 } from '@grafana/data';
import { type PieSeriesOption } from 'echarts';
import { type ECBasicOption } from 'echarts/types/dist/shared';
import {
  PIE_LABEL_POSITION_DEFAULT,
  PIE_LABELS_DEFAULT,
  PIE_PERCENT_PRECISION_DEFAULT,
  PIE_ROSE_TYPE_DEFAULT,
  PIE_START_ANGLE_DEFAULT,
  PIE_TYPE_DEFAULT,
} from 'editor/constants';
import {
  type PieChartType,
  type PieEmphasisFocus,
  type PieLabel,
  type PieLabelOverflow,
  type PieLabelPosition,
  type PieRoseType,
  type PieSelectedMode,
} from 'editor/types';
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
 * ECharts pie `series.roseType` for the rose (Nightingale) rendering. `radius`
 * encodes each slice's value as its radius, `area` as its area; `none` (the
 * default) is a plain pie. The UI's `'none'` sentinel collapses to `undefined`
 * so ECharts falls back to its own default (a plain pie — equivalent to `false`),
 * keeping default renders (and snapshots) unchanged. `@types/echarts` types this
 * as `'radius' | 'area' | undefined` (it does not accept the runtime `false`), so
 * `undefined` is the type-safe "off" value. Unset falls back to
 * `PIE_ROSE_TYPE_DEFAULT`.
 * https://echarts.apache.org/en/option.html#series-pie.roseType
 */
export function getPieRoseType(roseType: PieRoseType | undefined): PieSeriesOption['roseType'] {
  const value = roseType ?? PIE_ROSE_TYPE_DEFAULT;
  return value === 'none' ? undefined : value;
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
 * ECharts pie arc range (`series.startAngle` / `series.endAngle`, degrees) for
 * the Advanced "Start angle" / "End angle" options. Together they enable half-pie
 * / semicircle-donut layouts. Each key is spread only when it differs from its
 * ECharts default (start ≠ 90; end defined), so the default full pie leaves both
 * keys absent and its render/snapshots are unchanged.
 * https://echarts.apache.org/en/option.html#series-pie.startAngle
 * https://echarts.apache.org/en/option.html#series-pie.endAngle
 */
export function getPieAngles(
  startAngle: number | undefined,
  endAngle: number | undefined
): Pick<PieSeriesOption, 'startAngle' | 'endAngle'> {
  return {
    ...(typeof startAngle === 'number' && startAngle !== PIE_START_ANGLE_DEFAULT ? { startAngle } : {}),
    ...(typeof endAngle === 'number' ? { endAngle } : {}),
  };
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
  /** Override the theme label font size (Advanced "Label font size"). */
  fontSize?: number;
  /** Label overflow handling (Advanced "Label overflow"); `none` is treated as unset. */
  overflow?: PieLabelOverflow;
  /** Label wrap/clip width in px (Advanced "Label width"), paired with `overflow`. */
  width?: number;
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
export function getPieLabelStyle(theme: GrafanaTheme2, opts: PieLabelStyleOptions = {}): PieSeriesOption['label'] {
  const { color, textShadow = false, textStroke = false, fontSize, overflow, width } = opts;
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
    // Advanced-only legibility overrides; omitted at the default so the theme size /
    // no-wrap behavior (and existing snapshots) are unchanged. `overflow: 'none'` is
    // the ECharts default, so it is treated as unset.
    ...(fontSize ? { fontSize } : {}),
    ...(overflow && overflow !== 'none' ? { overflow } : {}),
    ...(width ? { width } : {}),
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
 * shape options: the "Rounded corners" border radius (Tier 3) and the slice
 * separation border (`borderWidth`/`borderColor`, Tier 2). Keeping this in one
 * builder lets shape contributions merge without clobbering `{ color }`; each
 * optional key is added only when set (radius non-zero, `borderWidth > 0`) so the
 * default per-slice item style (and existing snapshots) are unchanged.
 * https://echarts.apache.org/en/option.html#series-pie.itemStyle.borderRadius
 */
export function getPieItemStyle(
  color: string | undefined,
  borderRadius: number | undefined,
  borderWidth?: number,
  borderColor?: string
): EChartPieDataItem['itemStyle'] {
  return {
    color,
    ...(borderRadius ? { borderRadius } : {}),
    ...(borderWidth != null && borderWidth > 0 ? { borderWidth, ...(borderColor ? { borderColor } : {}) } : {}),
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

/**
 * Slice's share of the visible total, as a percentage string. `precision` decimal
 * places (default `PIE_PERCENT_PRECISION_DEFAULT` = 1, no trailing `.0` because the
 * rounded number is stringified). Advanced `percentPrecision` overrides it.
 */
function sliceShare(
  value: number | undefined,
  total: number,
  precision: number = PIE_PERCENT_PRECISION_DEFAULT
): string {
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
 * `labelOptions` carries the Advanced-only overrides: legibility (font size,
 * overflow/width, percent precision) and `position`. All default to unset, leaving
 * the styling and `33.3%` percent output unchanged. `position` places the labels:
 * `outside` (leader lines, ECharts' default), `inside` (on the slice), or `center`
 * (the donut hole); unset falls back to `PIE_LABEL_POSITION_DEFAULT` (`outside`).
 * See https://echarts.apache.org/en/option.html#series-pie.label.position.
 */
export interface PieLabelOptions extends PieLabelStyleOptions {
  percentPrecision?: number;
  position?: PieLabelPosition;
}

export function getPieContentLabel(
  labels: PieLabel[] | undefined,
  slices: PieSliceModel[],
  theme: GrafanaTheme2,
  timeZone?: string,
  labelOptions: PieLabelOptions = {}
): PieSeriesOption['label'] {
  const { percentPrecision, position, ...styleOptions } = labelOptions;
  const style = getPieLabelStyle(theme, styleOptions);
  const resolvedPosition = position ?? PIE_LABEL_POSITION_DEFAULT;
  const selected = labels ?? PIE_LABELS_DEFAULT;
  if (selected.length === 0) {
    return { ...style, position: resolvedPosition, show: false };
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
    position: resolvedPosition,
    show: true,
    formatter: (params) => (typeof params.dataIndex === 'number' ? (lines[params.dataIndex] ?? '') : ''),
  };
}
