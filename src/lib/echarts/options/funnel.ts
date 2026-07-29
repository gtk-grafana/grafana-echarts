import { type GrafanaTheme2 } from '@grafana/data';
import { type FunnelSeriesOption } from 'echarts';
import { type ECBasicOption } from 'echarts/types/dist/shared';
import { FUNNEL_ALIGN_DEFAULT, FUNNEL_LABEL_POSITION_DEFAULT, FUNNEL_ORIENT_DEFAULT } from 'editor/funnel';
import { PIE_LABELS_DEFAULT } from 'editor/pie';
import { type FunnelAlign, type FunnelLabelPosition, type FunnelOrient, type PieLabel } from 'editor/types';
import { type PieSliceModel } from 'lib/echarts/converters/types';
import { createBaseOptions, getThemeTextStyle } from 'lib/echarts/options/base';
import { buildPieLabelLines, getPieItemStyle } from 'lib/echarts/options/pie';
import { type PanelOptions } from 'types';

/** Base option for funnel charts. Series data is merged at render time. */
export const funnelDefaultOptions: ECBasicOption = {
  ...createBaseOptions({ includeLegend: true }),
};

/**
 * ECharts funnel `series.orient` for the layout direction. Returns `undefined`
 * at the default (`vertical`) so the key is omitted and the ECharts default
 * stands; only `horizontal` is emitted.
 * https://echarts.apache.org/en/option.html#series-funnel.orient
 */
export function getFunnelOrient(orient: FunnelOrient | undefined): FunnelSeriesOption['orient'] | undefined {
  const value = orient ?? FUNNEL_ORIENT_DEFAULT;
  return value === FUNNEL_ORIENT_DEFAULT ? undefined : value;
}

/**
 * ECharts funnel `series.funnelAlign` for the cross-axis alignment. `funnelAlign`
 * only applies to a vertical funnel; a horizontal funnel only supports center
 * alignment, so when `orient` is horizontal any stored `left`/`right` is ignored
 * (it would otherwise break the layout) and `undefined` is returned. For a vertical
 * funnel, `center` (the default) returns `undefined` so the key is omitted, and
 * `left` / `right` are emitted.
 * https://echarts.apache.org/en/option.html#series-funnel.funnelAlign
 */
export function getFunnelAlign(
  align: FunnelAlign | undefined,
  orient?: FunnelOrient
): FunnelSeriesOption['funnelAlign'] | undefined {
  if ((orient ?? FUNNEL_ORIENT_DEFAULT) === 'horizontal') {
    return undefined;
  }
  const value = align ?? FUNNEL_ALIGN_DEFAULT;
  return value === FUNNEL_ALIGN_DEFAULT ? undefined : value;
}

/**
 * ECharts funnel `series.gap` (px between trapezoids). Returns `undefined` for
 * `0`/unset (the ECharts default) so the key is dropped; positive values pass
 * through.
 * https://echarts.apache.org/en/option.html#series-funnel.gap
 */
export function getFunnelGap(gap: number | undefined): number | undefined {
  return typeof gap === 'number' && gap > 0 ? gap : undefined;
}

/**
 * ECharts funnel `series.minSize` / `series.maxSize` (trapezoid extent as a
 * percentage of the layout box). Each key is emitted only when set; unset falls
 * back to the ECharts defaults (`'0%'` / `'100%'`).
 * https://echarts.apache.org/en/option.html#series-funnel.minSize
 */
export function getFunnelSize(
  minSize: number | undefined,
  maxSize: number | undefined
): Pick<FunnelSeriesOption, 'minSize' | 'maxSize'> {
  return {
    ...(minSize != null ? { minSize: `${minSize}%` } : {}),
    ...(maxSize != null ? { maxSize: `${maxSize}%` } : {}),
  };
}

/**
 * ECharts funnel `series.label` for the selected slice-label content, reusing the
 * pie's Name / Value / Percent content (`buildPieLabelLines`) so funnel labels
 * format exactly like pie labels. The style is the same flat, theme-colored label
 * the pie uses (Grafana font/color with the ECharts default shadow/stroke zeroed),
 * built here from the shared `getThemeTextStyle` rather than the pie-typed
 * `getPieLabelStyle` (whose label type is not assignable to the funnel label).
 * `position` places the labels on/around the trapezoid; unset falls back to
 * `FUNNEL_LABEL_POSITION_DEFAULT` (`inside`). An unset `labels` shows the slice
 * name (`PIE_LABELS_DEFAULT`); an explicit empty selection hides the label. See
 * `getPieContentLabel` for the pie counterpart.
 */
export function getFunnelLabel(
  labels: PieLabel[] | undefined,
  slices: PieSliceModel[],
  theme: GrafanaTheme2,
  timeZone: string | undefined,
  position: FunnelLabelPosition | undefined
): FunnelSeriesOption['label'] {
  const resolvedPosition = position ?? FUNNEL_LABEL_POSITION_DEFAULT;
  // Flat, theme-colored label matching the pie's default: clear ECharts' blurred
  // shadow and contrast stroke so labels read like the rest of Grafana.
  const style = { ...getThemeTextStyle(theme), textShadowBlur: 0, textShadowColor: 'transparent', textBorderWidth: 0 };
  const selected = labels ?? PIE_LABELS_DEFAULT;
  // An explicit empty selection hides the label (matching core/pie); an unset
  // selection falls through to the slice name.
  if (selected.length === 0) {
    return { ...style, position: resolvedPosition, show: false };
  }
  // Precompute each slice's label lines once; the formatter closure indexes them
  // by dataIndex on every draw (as the pie does).
  const lines = buildPieLabelLines(labels, slices, theme, timeZone);
  return {
    ...style,
    position: resolvedPosition,
    show: true,
    formatter: (params) => lines[params.dataIndex],
  };
}

/**
 * Per-slice funnel label color for the on-trapezoid placements. Mirrors the pie's
 * `resolvePieLabelColor` inside-label behavior: when the label sits on the segment
 * (`inside` for a vertical funnel, `center` for a horizontal one) it must contrast
 * with the slice fill, so the color is chosen per slice via Grafana core's
 * `theme.colors.getContrastText(slice.color)`. Outside placements
 * (`left`/`right`/`top`/`bottom`) sit on the panel background, so `undefined`
 * leaves the series-level theme label color to stand. Unset falls back to the
 * vertical default (`inside`), matching `getFunnelLabel`.
 */
export function resolveFunnelLabelColor(
  theme: GrafanaTheme2,
  slice: PieSliceModel,
  position: FunnelLabelPosition | undefined
): string | undefined {
  const resolved = position ?? FUNNEL_LABEL_POSITION_DEFAULT;
  if (resolved === 'inside' || resolved === 'center') {
    return theme.colors.getContrastText(slice.color);
  }
  return undefined;
}

/** Extras threaded from the chart module into the funnel series build. */
export interface FunnelSeriesExtras {
  /** Canvas layer for the series (see the panel's `zLevel.series`). */
  zlevel?: number;
  /** The dedicated funnel tooltip (reusing the pie tooltip); omitted in None mode. */
  tooltip?: FunnelSeriesOption['tooltip'];
}

/**
 * Build the ECharts funnel series from the visible pie slices. Reuses the pie
 * slice model verbatim: each trapezoid is one slice, colored via `getPieItemStyle`
 * and labelled via `getFunnelLabel` (Name / Value / Percent).
 *
 * Two keys are fixed rather than exposed: `min: 0` maps a value of 0 to the
 * minimum size so trapezoid width is proportional to value (a true part-to-whole
 * read, like the pie's angle), and `sort: 'none'` preserves the resolver's slice
 * order (which already honors the shared Slice sorting option) instead of letting
 * ECharts re-sort. The layout options (orient / align / gap / min-max size) are
 * each omitted at their ECharts default.
 * https://echarts.apache.org/en/option.html#series-funnel
 */
export function getFunnelSeries(
  visible: PieSliceModel[],
  options: PanelOptions,
  theme: GrafanaTheme2,
  timeZone: string | undefined,
  { zlevel, tooltip }: FunnelSeriesExtras = {}
): FunnelSeriesOption {
  const position = options.funnelLabelPosition;
  const data: NonNullable<FunnelSeriesOption['data']> = visible.map((slice) => {
    // On-trapezoid labels (inside/center) get a per-slice contrast color, applied to
    // both the normal and emphasis label so it survives hover (ECharts otherwise
    // reverts the label to the slice color on emphasis) — mirrors the pie.
    const labelColor = resolveFunnelLabelColor(theme, slice, position);
    return {
      name: slice.name,
      // ECharts funnel values are numeric; undefined renders an empty trapezoid.
      value: slice.value,
      // Per-slice color (Advanced pie shape extras are pie-only, so no borders here).
      itemStyle: getPieItemStyle(slice.color, undefined),
      ...(labelColor ? { label: { color: labelColor }, emphasis: { label: { color: labelColor } } } : {}),
    };
  });

  const orient = getFunnelOrient(options.funnelOrient);
  // Horizontal funnels force center alignment (see getFunnelAlign); a stored
  // left/right is ignored so the layout can't break.
  const funnelAlign = getFunnelAlign(options.funnelAlign, options.funnelOrient);
  const gap = getFunnelGap(options.funnelGap);

  return {
    type: 'funnel',
    data,
    ...(zlevel != null ? { zlevel } : {}),
    // Proportional widths (value 0 → minSize), so the funnel reads as part-to-whole.
    min: 0,
    // Keep the resolver's order (honors the shared Slice sorting option).
    sort: 'none',
    // Layout options, each omitted at its ECharts default.
    ...(orient ? { orient } : {}),
    ...(funnelAlign ? { funnelAlign } : {}),
    ...(gap != null ? { gap } : {}),
    ...getFunnelSize(options.funnelMinSize, options.funnelMaxSize),
    // Grafana-styled labels; content (Name/Value/Percent) reuses the pie builder.
    // Per-slice contrast color for on-trapezoid labels is set on `data` above.
    label: getFunnelLabel(options.displayLabels, visible, theme, timeZone, position),
    ...(tooltip ? { tooltip } : {}),
  };
}
