import { type Field, fieldReducers, FieldType, type GrafanaTheme2, reduceField } from '@grafana/data';
import { type PieSeriesOption, type TitleComponentOption } from 'echarts';
import { type ECBasicOption } from 'echarts/types/dist/shared';
import {
  PIE_ANIMATION_ENABLED_DEFAULT,
  PIE_AVOID_LABEL_OVERLAP_DEFAULT,
  PIE_BORDER_RADIUS_DEFAULT,
  PIE_BORDER_WIDTH_DEFAULT,
  PIE_CLOCKWISE_DEFAULT,
  PIE_EMPHASIS_FOCUS_DEFAULT,
  PIE_EMPHASIS_SCALE_DEFAULT,
  PIE_LABEL_FONT_SIZE_DEFAULT,
  PIE_LABEL_OVERFLOW_DEFAULT,
  PIE_LABEL_POSITION_DEFAULT,
  PIE_LABEL_TEXT_SHADOW_DEFAULT,
  PIE_LABEL_TEXT_STROKE_DEFAULT,
  PIE_LABELS_DEFAULT,
  PIE_MIN_ANGLE_DEFAULT,
  PIE_MIN_SHOW_LABEL_ANGLE_DEFAULT,
  PIE_ROSE_TYPE_DEFAULT,
  PIE_SELECTED_MODE_DEFAULT,
  PIE_SHOW_EMPTY_CIRCLE_DEFAULT,
  PIE_START_ANGLE_DEFAULT,
  PIE_STILL_SHOW_ZERO_SUM_DEFAULT,
  PIE_TYPE_DEFAULT,
} from 'editor/pie';
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
import { formatPieShare, getPieSliceFormatters, getPieSliceTotal } from 'lib/echarts/converters/pie';
import { type PieSliceModel } from 'lib/echarts/converters/types';
import { createBaseOptions, getThemeTextStyle } from 'lib/echarts/options/base';
import { getValueFormatter } from 'lib/echarts/style';
import { formatTooltipValue } from 'lib/echarts/tooltip/model';
import { isAdvancedEditorMode, isApiEditorMode } from 'lib/grafana/editor/common/editor-mode';
import { type PanelOptions } from 'types';

/** Base option for pie charts. Series data is merged at render time. */
export const pieDefaultOptions: ECBasicOption = {
  ...createBaseOptions({ includeLegend: true }),
};

/**
 * Default values for every Advanced-gated pie option, keyed by its `PanelOptions`
 * path. In Default editor mode these are spread over the stored options (see
 * `applyPieEditorModeDefaults`) so a panel renders exactly like an untouched pie
 * even if advanced values were configured earlier and then the user switched back
 * to Default — the render path itself never reads `editorMode`, so this is what
 * keeps hidden advanced values from leaking into the chart. Options whose default
 * is "unset" are set to `undefined` so any stored value is cleared. `animation` is
 * included (per the shared `@internal animation.enabled`) so Default mode restores
 * animation too.
 */
export const ADVANCED_PIE_DEFAULTS: Partial<PanelOptions> = {
  roseType: PIE_ROSE_TYPE_DEFAULT,
  minAngle: PIE_MIN_ANGLE_DEFAULT,
  startAngle: PIE_START_ANGLE_DEFAULT,
  endAngle: undefined,
  labelPosition: PIE_LABEL_POSITION_DEFAULT,
  centerValueReducer: undefined,
  labelFontSize: PIE_LABEL_FONT_SIZE_DEFAULT,
  labelOverflow: PIE_LABEL_OVERFLOW_DEFAULT,
  labelWidth: undefined,
  minShowLabelAngle: PIE_MIN_SHOW_LABEL_ANGLE_DEFAULT,
  sliceBorderWidth: PIE_BORDER_WIDTH_DEFAULT,
  sliceBorderColor: undefined,
  outerRadius: undefined,
  innerRadius: undefined,
  centerX: undefined,
  centerY: undefined,
  selectedMode: PIE_SELECTED_MODE_DEFAULT,
  selectedOffset: undefined,
  sliceBorderRadius: PIE_BORDER_RADIUS_DEFAULT,
  emphasisFocus: PIE_EMPHASIS_FOCUS_DEFAULT,
  emphasisScale: PIE_EMPHASIS_SCALE_DEFAULT,
  labelColor: undefined,
  stillShowZeroSum: PIE_STILL_SHOW_ZERO_SUM_DEFAULT,
  showEmptyCircle: PIE_SHOW_EMPTY_CIRCLE_DEFAULT,
  clockwise: PIE_CLOCKWISE_DEFAULT,
  avoidLabelOverlap: PIE_AVOID_LABEL_OVERLAP_DEFAULT,
  labelTextShadow: PIE_LABEL_TEXT_SHADOW_DEFAULT,
  labelTextStroke: PIE_LABEL_TEXT_STROKE_DEFAULT,
  animation: { enabled: PIE_ANIMATION_ENABLED_DEFAULT },
};

/**
 * Normalize the pie's panel options for rendering by editor mode. Advanced and
 * API modes render the stored options as-is; Default mode spreads
 * `ADVANCED_PIE_DEFAULTS` over them so advanced options are forced back to their
 * defaults (the controls are hidden, so their stored values must not affect the
 * render). Applied once in `buildPanelChartOption` for pie series types, before
 * both the series build and the `animation` read.
 */
export function applyPieEditorModeDefaults(options: PanelOptions): PanelOptions {
  if (isAdvancedEditorMode(options) || isApiEditorMode(options)) {
    return options;
  }
  return { ...options, ...ADVANCED_PIE_DEFAULTS };
}

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
 * The optional `innerRadius`/`outerRadius` (percentages, Advanced) override the
 * defaults: an `outerRadius` shrinks/grows the disc, and an `innerRadius` carves a
 * hole even for a plain pie. When neither is set the pie-vs-donut default stands.
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
 * @todo it centers from right side of text so it doesn't appear centered
 * ECharts pie `series.center` (`[x, y]` percentages) when the panel overrides the
 * center. Returns `undefined` when neither coordinate is set, so the ECharts
 * default (centered) is left untouched. A single provided axis keeps the other
 * centered at `50%`. Advanced-only.
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
 * for `0`/unset so nothing is written and all labels show.
 * https://echarts.apache.org/en/option.html#series-pie.minShowLabelAngle
 */
export function getPieMinShowLabelAngle(angle: number | undefined): number | undefined {
  return angle != null && angle > 0 ? angle : undefined;
}

/**
 * ECharts pie `series.roseType` for the rose (Nightingale) rendering. `radius`
 * encodes each slice's value as its radius, `area` as its area; `none` (the
 * default) is a plain pie. The UI's `'none'` sentinel collapses to `undefined` so
 * ECharts falls back to its own default (a plain pie — equivalent to `false`).
 * `@types/echarts` types this as `'radius' | 'area' | undefined` (it does not
 * accept the runtime `false`), so `undefined` is the type-safe "off" value. Unset
 * falls back to `PIE_ROSE_TYPE_DEFAULT`.
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
 * return `undefined` so the key is dropped at the ECharts default (`0`).
 * https://echarts.apache.org/en/option.html#series-pie.minAngle
 */
export function getPieMinAngle(minAngle: number | undefined): PieSeriesOption['minAngle'] {
  return typeof minAngle === 'number' && minAngle > 0 ? minAngle : undefined;
}

/**
 * ECharts pie arc range (`series.startAngle` / `series.endAngle`, degrees) for the
 * Advanced "Start angle" / "End angle" options. Together they enable half-pie /
 * semicircle-donut layouts. Each key is spread only when it differs from its
 * ECharts default (start ≠ 90; end defined), so the default full pie leaves both
 * keys absent.
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
 * Advanced options override this: `color` replaces the theme text color, and the
 * `textShadow` / `textStroke` switches re-enable the zeroed shadow/stroke. With no
 * options (the default) the output is the flat, theme-colored label.
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
    // Advanced legibility overrides, omitted at the default so the theme size /
    // no-wrap behavior stands. `overflow: 'none'` is the ECharts default, so it is
    // treated as unset.
    ...(fontSize ? { fontSize } : {}),
    ...(overflow && overflow !== 'none' ? { overflow } : {}),
    ...(width ? { width } : {}),
  };
}

/**
 * Per-slice pie label color for the Advanced "Label color" / "Label position"
 * options. Resolved once per slice and applied to both the slice's normal and
 * emphasis label so the color survives hover (ECharts otherwise reverts the label
 * to the slice color on emphasis).
 *
 * An explicit `resolvedLabelColor` (the Advanced "Label color", already resolved
 * from its Grafana color token via `theme.visualization.getColorByName`) wins at
 * any position. With no explicit color, `inside` labels sit on the slice fill, so
 * the color is chosen per-slice for contrast via Grafana core's
 * `theme.colors.getContrastText(slice.color)`; `outside` / `center` labels sit on
 * the panel background, so `undefined` leaves the series-level theme color to
 * stand. Returns `undefined` when nothing overrides the series label color.
 */
export function resolvePieLabelColor(
  theme: GrafanaTheme2,
  slice: PieSliceModel,
  labelPosition: PieLabelPosition | undefined,
  resolvedLabelColor: string | undefined
): string | undefined {
  if (resolvedLabelColor) {
    return resolvedLabelColor;
  }
  if (labelPosition === 'inside') {
    return theme.colors.getContrastText(slice.color);
  }
  return undefined;
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
  // Unlike the omit-at-default sibling helpers (`getPieEmptyState`,
  // `getPieOrientation`), this always emits `selectedMode` — including the `false`
  // default. That is intentional and harmless: ECharts' pie `selectedMode` default
  // is already `false`, and emitting it keeps the "off" path explicit (a single
  // spread that sets the mode either way) rather than conditionally dropping the key.
  return {
    selectedMode,
    ...(selectedMode && offset ? { selectedOffset: offset } : {}),
  };
}

/**
 * Resolve the Advanced "Rounded corners" value into an ECharts
 * `itemStyle.borderRadius`. A radius of 0 (the default) or unset returns
 * `undefined` so the key is omitted (square corners).
 * https://echarts.apache.org/en/option.html#series-pie.itemStyle.borderRadius
 */
export function getPieBorderRadius(radius: number | undefined): number | undefined {
  return radius && radius > 0 ? radius : undefined;
}

/**
 * Per-slice ECharts `itemStyle`, composing the slice color with the Advanced shape
 * options: the "Rounded corners" border radius and the slice separation border
 * (`borderWidth`/`borderColor`). Keeping this in one builder lets shape
 * contributions merge without clobbering `{ color }`; each optional key is added
 * only when set (radius non-zero, `borderWidth > 0`) so the default per-slice item
 * style is unchanged.
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
 * option. Both ECharts defaults are `true`, so each key is emitted only when set to
 * `false`; leaving the defaults returns `{}`.
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
 * only when set to `false`; leaving the defaults returns `{}`.
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
 * ECharts pie `series.label` for the selected slice-label content (Grafana Pie
 * chart "Labels": Name / Value / Percent). Mirrors core: each selected label is a
 * line, in Name → Value → Percent order; the value formats with the slice field's
 * unit/decimals (like the tooltip) and the percent is the slice's share of the
 * visible total (so labels and tooltip agree), rendered with the field's `decimals`
 * (whole numbers by default). `slices` are the visible slices in render (dataIndex)
 * order.
 *
 * An unset `labels` (`undefined`) falls back to `PIE_LABELS_DEFAULT` (the slice
 * name); an explicit empty selection (the user deselecting every label) hides the
 * label.
 *
 * `labelOptions` carries the Advanced overrides: legibility (font size,
 * overflow/width) and `position`. `position` places the labels: `outside` (leader
 * lines, ECharts' default), `inside` (on the slice), or `center` (the donut hole);
 * unset falls back to `PIE_LABEL_POSITION_DEFAULT` (`outside`).
 *
 * At `center` the per-slice base label is hidden (`show: false`): drawing every
 * slice's content stacked in the donut hole is unreadable, so the center is driven
 * instead by a persistent `title` readout (see `getPieCenterTitle`) and the hovered
 * slice's value via an emphasis label (see `getPieCenterEmphasisLabel`).
 */
export interface PieLabelOptions extends PieLabelStyleOptions {
  position?: PieLabelPosition;
}

/**
 * Each visible slice's label text (Name / Value / Percent lines, in that order),
 * indexed by dataIndex. Shared by the slice content label and the center emphasis
 * label so both format a slice identically. An empty selection yields empty
 * strings.
 */
export function buildPieLabelLines(
  labels: PieLabel[] | undefined,
  slices: PieSliceModel[],
  theme: GrafanaTheme2,
  timeZone?: string
): string[] {
  const selected = labels ?? PIE_LABELS_DEFAULT;
  const formatters = getPieSliceFormatters(slices, theme, timeZone);
  const total = getPieSliceTotal(slices);
  return slices.map((slice, index) => {
    const parts: string[] = [];
    if (selected.includes('name')) {
      parts.push(slice.name);
    }
    if (selected.includes('value')) {
      parts.push(formatTooltipValue(slice.value ?? null, formatters[index]));
    }
    if (selected.includes('percent')) {
      parts.push(formatPieShare(slice.value, total, slice.field.config.decimals));
    }
    return parts.join('\n');
  });
}

export function getPieContentLabel(
  labels: PieLabel[] | undefined,
  slices: PieSliceModel[],
  theme: GrafanaTheme2,
  timeZone?: string,
  labelOptions: PieLabelOptions = {}
): PieSeriesOption['label'] {
  const { position, ...styleOptions } = labelOptions;
  const style = getPieLabelStyle(theme, styleOptions);
  const resolvedPosition = position ?? PIE_LABEL_POSITION_DEFAULT;
  const selected = labels ?? PIE_LABELS_DEFAULT;
  // Center: the base slice labels are hidden; the readout comes from the title +
  // emphasis label instead (see this function's doc).
  if (resolvedPosition === 'center' || selected.length === 0) {
    return { ...style, position: resolvedPosition, show: false };
  }

  // Precompute each slice's label lines once; the formatter closure indexes them
  // by dataIndex on every draw.
  const lines = buildPieLabelLines(labels, slices, theme, timeZone);
  return {
    ...style,
    position: resolvedPosition,
    show: true,
    formatter: (params) => lines[params.dataIndex],
  };
}

/**
 * ECharts pie `emphasis.label` for the center readout: when `labelPosition` is
 * `center` and no `centerValueReducer` is set, hovering a slice shows that slice's
 * content centered in the donut hole (a boxless readout). Only used in the
 * no-reducer case — when a reducer drives the persistent center `title`, the
 * hovered slice's detail comes from the normal tooltip instead, so this label is
 * not added (the caller gates it). Returns the emphasis label config for the
 * hovered slice, aligned dead-center in the hole.
 */
export function getPieCenterEmphasisLabel(
  labels: PieLabel[] | undefined,
  slices: PieSliceModel[],
  theme: GrafanaTheme2,
  timeZone?: string,
  styleOptions: PieLabelStyleOptions = {}
): NonNullable<PieSeriesOption['emphasis']>['label'] | undefined {
  const lines = buildPieLabelLines(labels, slices, theme, timeZone);
  return {
    ...getPieLabelStyle(theme, styleOptions),
    show: true,
    position: 'center',
    // Center the readout in the donut hole (no box, so it must self-align).
    align: 'center',
    verticalAlign: 'middle',
    formatter: (params) => lines[params.dataIndex],
  };
}

/**
 * ECharts `title` for the persistent donut-center readout, shown with
 * `labelPosition: 'center'` when a `centerValueReducer` is chosen. The reducer
 * aggregates the visible slice values into one number, formatted with the first
 * visible slice's unit/decimals; the title renders the reducer's display name
 * (e.g. "Mean") above the value. Returns `undefined` when there is no reducer, no
 * visible slice, or the aggregate is non-finite (so nothing is drawn until a slice
 * is hovered).
 *
 * `centerX`/`centerY` (the Advanced center offset, percentages) track the title to
 * the pie center so it stays in the hole when the pie is repositioned; unset falls
 * back to `50%` (panel center, matching the pie's own default). The anchor is
 * centered on both axes (`textAlign`/`textVerticalAlign: 'center'/'middle'`) so the
 * text block's middle — not its corner — sits at the pie center.
 */
export function getPieCenterTitle(
  reducerId: string | undefined,
  slices: PieSliceModel[],
  theme: GrafanaTheme2,
  timeZone?: string,
  centerX?: number,
  centerY?: number
): TitleComponentOption | undefined {
  if (!reducerId || slices.length === 0) {
    return undefined;
  }
  // Reduce across the visible values, borrowing the first slice's field config
  // (unit/decimals) — part-to-whole slices share a unit. `state` is cleared so no
  // stale calc cache leaks in.
  const field: Field = {
    name: 'center',
    type: FieldType.number,
    config: slices[0].field.config,
    values: slices.map((slice) => slice.value ?? null),
    state: undefined,
  };
  // `FieldCalcs` values are typed `any`; treat as unknown and narrow to a finite number.
  const aggregate: unknown = reduceField({ field, reducers: [reducerId] })[reducerId];
  if (typeof aggregate !== 'number' || !Number.isFinite(aggregate)) {
    return undefined;
  }
  const valueText = formatTooltipValue(aggregate, getValueFormatter(field, theme, timeZone));
  const reducerName = fieldReducers.getIfExists(reducerId)?.name ?? reducerId;
  return {
    // Anchor the text block's center on the pie center (tracks centerX/centerY).
    // `top: 'center'` is invalid for a title (only 'middle'), and pairing
    // `left: 'center'` with `textAlign: 'center'` double-shifts the block; using an
    // explicit percentage with both align axes centers it correctly.
    left: `${centerX ?? 50}%`,
    top: `${centerY ?? 50}%`,
    textAlign: 'center',
    textVerticalAlign: 'middle',
    // Two lines: the reducer name (muted) above the aggregate value (prominent).
    text: `{name|${reducerName}}\n{value|${valueText}}`,
    textStyle: {
      rich: {
        name: { fontSize: 11, color: theme.colors.text.secondary, padding: [0, 0, 2, 0] },
        value: { fontSize: 18, fontWeight: 'bold', color: theme.colors.text.primary },
      },
    },
  };
}
