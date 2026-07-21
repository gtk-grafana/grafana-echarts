import { type ReduceDataOptions } from '@grafana/data';
import { type SortOrder, TooltipDisplayMode } from '@grafana/schema';
import { PIE_LEGEND_VALUES_DEFAULT, PIE_SORT_DEFAULT } from 'editor/pie';
import { getPieSliceFormatters, resolvePieSlices } from 'lib/echarts/converters/pie';
import { DEFAULT_CHART_LEGEND, getLegendOption } from 'lib/echarts/options/legend';
import { buildPieLegendItems } from 'lib/echarts/options/legendItems';
import {
  getPieAngles,
  getPieBorderRadius,
  getPieCenter,
  getPieCenterEmphasisLabel,
  getPieCenterTitle,
  getPieContentLabel,
  getPieEmphasis,
  getPieEmptyState,
  getPieItemStyle,
  getPieMinAngle,
  getPieMinShowLabelAngle,
  getPieOrientation,
  getPieRadius,
  getPieRoseType,
  getPieSelection,
  type PieLabelStyleOptions,
  pieDefaultOptions,
  resolvePieLabelColor,
} from 'lib/echarts/options/pie';
import { buildPieTooltipModel } from 'lib/echarts/tooltip/pie';
import { indexedFormatterResolver, NOOP_TOOLTIP_SINK, toEmittingFormatter } from 'lib/echarts/tooltip/model';
import { type ChartContext, type ChartModule, type EChartPieDataItem, type EChartPieSeriesOption } from './types';

const resolveReduceOptions = (ctx: ChartContext): ReduceDataOptions | undefined => ctx.options.reduceOptions;
const resolveSort = (ctx: ChartContext): SortOrder => ctx.options.sort ?? PIE_SORT_DEFAULT;

export const pieChartModule: ChartModule = {
  legend: DEFAULT_CHART_LEGEND,

  getTooltipValueFormatter(ctx) {
    // Per-slice formatter (by dataIndex) so each slice honors its own field's
    // unit/decimals. This is only the fallback for the generic tooltip path; the
    // dedicated pie formatter set on the series owns the rendered content.
    const visible = resolvePieSlices(
      ctx.frames,
      ctx.theme,
      ctx.fieldConfig,
      resolveReduceOptions(ctx),
      ctx.replaceVariables,
      ctx.timeZone,
      resolveSort(ctx)
    ).filter((slice) => !slice.hidden);
    const formatters = getPieSliceFormatters(visible, ctx.theme, ctx.timeZone);
    return indexedFormatterResolver(formatters, ctx.formatValue, 'dataIndex');
  },

  buildOption(ctx: ChartContext<'pie'>, { isGrafanaLegend }): EChartPieSeriesOption | null {
    const { theme, options, seriesType } = ctx;
    const slices = resolvePieSlices(
      ctx.frames,
      theme,
      ctx.fieldConfig,
      resolveReduceOptions(ctx),
      ctx.replaceVariables,
      ctx.timeZone,
      resolveSort(ctx)
    );

    // No numeric-like field at all → no usable data. (Distinct from "all slices
    // hidden", which still renders an empty pie rather than throwing.)
    if (slices.length === 0) {
      return null;
    }

    // Rounded corners (Advanced): resolved once and merged into every slice's
    // itemStyle, preserving the per-slice color. 0/unset → omitted.
    const borderRadius = getPieBorderRadius(options.sliceBorderRadius);
    const visible = slices.filter((slice) => !slice.hidden);

    // Advanced "Label color" stores a Grafana color token (e.g. `dark-red`), which
    // ECharts cannot use as a raw canvas fill — resolve it to a concrete color once.
    const resolvedLabelColor = options.labelColor ? theme.visualization.getColorByName(options.labelColor) : undefined;

    const data: EChartPieDataItem[] = visible.map((slice) => {
      // Per-slice label color: explicit "Label color" wins; else an `inside` label
      // gets a per-slice contrast color. Applied to both the normal and emphasis
      // label so it survives hover (ECharts otherwise reverts to the slice color).
      const labelColor = resolvePieLabelColor(theme, slice, options.labelPosition, resolvedLabelColor);
      return {
        name: slice.name,
        // ECharts pie values are numeric-only; undefined renders an empty slice.
        value: slice.value,
        // Per-slice color plus the Advanced rounded corners and slice-separation
        // border; every extra is omitted at its default.
        itemStyle: getPieItemStyle(slice.color, borderRadius, options.sliceBorderWidth, options.sliceBorderColor),
        ...(labelColor ? { label: { color: labelColor }, emphasis: { label: { color: labelColor } } } : {}),
      };
    });

    // Advanced label style overrides, shared by the slice content label and (at
    // center) the hover emphasis label. The resolved (non-token) label color is
    // used so the series-level label color is a valid canvas fill.
    const labelStyleOptions: PieLabelStyleOptions = {
      fontSize: options.labelFontSize,
      overflow: options.labelOverflow,
      width: options.labelWidth,
      color: resolvedLabelColor,
      textShadow: options.labelTextShadow,
      textStroke: options.labelTextStroke,
    };

    // Center label readout (Advanced): with `labelPosition: 'center'` the per-slice
    // labels are hidden; the hovered slice value shows via an emphasis label, and a
    // chosen reducer drives the persistent center `title`. Both are absent for the
    // other positions, keeping their render unchanged.
    const isCenterLabel = options.labelPosition === 'center';
    // A reducer drives the persistent center title; the hovered slice's detail then
    // comes from the normal tooltip, so the boxless hover readout is only added when
    // no reducer is set. Edge case: a reducer set but with a non-finite aggregate
    // yields no title (getPieCenterTitle returns undefined) and, being gated off
    // here, no hover readout either — an empty hole, consistent with tooltip-only.
    const centerTitle = isCenterLabel
      ? getPieCenterTitle(options.centerValueReducer, visible, theme, ctx.timeZone, options.centerX, options.centerY)
      : undefined;
    const centerEmphasisLabel =
      isCenterLabel && !options.centerValueReducer
        ? getPieCenterEmphasisLabel(options.displayLabels, visible, theme, ctx.timeZone, labelStyleOptions)
        : undefined;

    // Hover emphasis (Advanced): focus/scale omitted at the `none`/unset default so
    // the default hover behavior is unchanged. At center, the emphasis label (the
    // hovered slice's value) is merged in on top.
    const baseEmphasis = getPieEmphasis(options.emphasisFocus, options.emphasisScale);
    const emphasis = centerEmphasisLabel ? { ...(baseEmphasis ?? {}), label: centerEmphasisLabel } : baseEmphasis;

    const legend = isGrafanaLegend
      ? { show: false }
      : getLegendOption(
          options.legend,
          theme,
          visible.map((slice) => slice.name)
        );

    const tooltipMode = options.tooltip?.mode ?? TooltipDisplayMode.Single;
    const hideZeros = options.tooltip?.hideZeros ?? false;

    // Center override and min-angle-to-show-label (Advanced): both omitted at
    // their defaults so the ECharts default (centered, all labels shown) stands.
    const center = getPieCenter(options.centerX, options.centerY);
    const minShowLabelAngle = getPieMinShowLabelAngle(options.minShowLabelAngle);

    return {
      ...pieDefaultOptions,
      legend,
      // Persistent donut-center readout (Advanced, center label + a chosen
      // reducer). Absent otherwise, so no title is drawn.
      ...(centerTitle ? { title: centerTitle } : {}),
      series: [
        {
          type: seriesType,
          data,
          // Place the series on its own canvas layer (see the panel's
          // `zLevel.series`), matching the other families so layered canvas
          // capture can isolate it (also what the canvas tests read).
          zlevel: options.zLevel?.series,
          // Pie vs donut (inner hole) from the "Pie chart type" option, with the
          // Advanced inner/outer radius overrides.
          radius: getPieRadius(options.pieType, options.innerRadius, options.outerRadius),
          // Advanced center offset (percentages).
          ...(center ? { center } : {}),
          // Rose (Nightingale) rendering; `none`/unset keeps a plain pie.
          roseType: getPieRoseType(options.roseType),
          // Min slice angle (degrees): enlarge tiny long-tail slices so they stay
          // visible/clickable. Omitted at the default 0.
          minAngle: getPieMinAngle(options.minAngle),
          // Arc range (Start / End angle): omitted at the defaults, keeping the
          // full-pie render.
          ...getPieAngles(options.startAngle, options.endAngle),
          // Hide labels on slices below this central angle.
          ...(minShowLabelAngle != null ? { minShowLabelAngle } : {}),
          // Select / explode: `off` maps to `selectedMode: false` (unchanged).
          ...getPieSelection(options.selectedMode, options.selectedOffset),
          // Hover emphasis focus/scale; omitted at defaults.
          ...(emphasis ? { emphasis } : {}),
          // Zero-sum / empty circle: each key emitted only when it differs from
          // the ECharts `true` default.
          ...getPieEmptyState(options.stillShowZeroSum, options.showEmptyCircle),
          // Clockwise / avoid label overlap: each key emitted only when it differs
          // from the ECharts `true` default.
          ...getPieOrientation(options.clockwise, options.avoidLabelOverlap),
          // Grafana-styled slice labels; content (Name/Value/Percent) from the
          // "Labels" option. No selection → labels hidden (core parity). Advanced
          // placement, legibility, and color / text shadow / stroke threaded in.
          label: getPieContentLabel(options.displayLabels, visible, theme, ctx.timeZone, {
            ...labelStyleOptions,
            position: options.labelPosition,
          }),
          // Dedicated pie tooltip (Single slice / All slices). Skipped in None
          // mode, where the panel disables the tooltip entirely.
          ...(tooltipMode === TooltipDisplayMode.None
            ? {}
            : {
                tooltip: {
                  formatter: toEmittingFormatter(
                    buildPieTooltipModel(visible, tooltipMode, theme, ctx.timeZone, hideZeros),
                    ctx.tooltipSink ?? NOOP_TOOLTIP_SINK
                  ),
                },
              }),
        },
      ],
    };
  },

  // The pie legend's value columns come from its own Percent / Value option
  // (`legend.values`), not the generic reducer `calcs` — a reducer over a
  // single-value slice is meaningless — so the `calcs` param is ignored here.
  buildLegendItems(ctx) {
    return buildPieLegendItems(
      ctx.frames,
      ctx.theme,
      ctx.options.legend?.values ?? PIE_LEGEND_VALUES_DEFAULT,
      ctx.fieldConfig,
      resolveReduceOptions(ctx),
      ctx.replaceVariables,
      ctx.timeZone,
      resolveSort(ctx)
    );
  },
};
