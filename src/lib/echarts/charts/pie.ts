import { type ReduceDataOptions } from '@grafana/data';
import { type SortOrder, TooltipDisplayMode } from '@grafana/schema';
import { PIE_SORT_DEFAULT } from 'editor/constants';
import { resolvePieSlices } from 'lib/echarts/converters/pie';
import { DEFAULT_CHART_LEGEND, getLegendOption } from 'lib/echarts/options/legend';
import { buildPieLegendItems } from 'lib/echarts/options/legendItems';
import {
  getPieBorderRadius,
  getPieContentLabel,
  getPieEmphasis,
  getPieEmptyState,
  getPieItemStyle,
  getPieOrientation,
  getPieRadius,
  getPieSelection,
  pieDefaultOptions,
} from 'lib/echarts/options/pie';
import { getValueFormatter } from 'lib/echarts/style';
import { buildPieTooltip } from 'lib/echarts/tooltip/pie';
import { indexedFormatterResolver } from 'lib/echarts/tooltip/template';
import { type ChartContext, type ChartModule, type EChartPieDataItem, type EChartPieSeriesOption } from './types';

const resolveReduceOptions = (ctx: ChartContext): ReduceDataOptions | undefined => ctx.options.reduceOptions;
const resolveSort = (ctx: ChartContext): SortOrder => ctx.options.sort ?? PIE_SORT_DEFAULT;

export const pieChartModule: ChartModule = {
  legend: DEFAULT_CHART_LEGEND,

  // The pie reads hidden slices by category name in `resolvePieSlices`, so the
  // panel must not pre-strip numeric value fields (which would drop the pie's
  // only value field). See `buildPanelChartOption`.
  readsHiddenSeriesInternally: true,

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
    const formatters = visible.map((slice) => getValueFormatter(slice.field, ctx.theme, ctx.timeZone));
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

    // Advanced "Rounded corners": resolved once and merged into every slice's
    // itemStyle (preserving the per-slice color). 0/unset → omitted.
    const borderRadius = getPieBorderRadius(options.sliceBorderRadius);
    const visible = slices.filter((slice) => !slice.hidden);
    const data: EChartPieDataItem[] = visible.map((slice) => ({
      name: slice.name,
      // ECharts pie values are numeric-only; undefined renders an empty slice.
      value: slice.value,
      itemStyle: getPieItemStyle(slice.color, borderRadius),
    }));

    // Advanced "Emphasis" (hover state): omitted entirely at the `none`/unset
    // default so the default hover behavior is unchanged.
    const emphasis = getPieEmphasis(options.emphasisFocus, options.emphasisScale);

    const legend = isGrafanaLegend
      ? { show: false }
      : getLegendOption(
          options.legend,
          theme,
          visible.map((slice) => slice.name)
        );

    const tooltipMode = options.tooltip?.mode ?? TooltipDisplayMode.Single;

    return {
      ...pieDefaultOptions,
      legend,
      series: [
        {
          type: seriesType,
          data,
          // Place the series on its own canvas layer (see the panel's
          // `zLevel.series`), matching the other families so layered canvas
          // capture can isolate it (also what the canvas tests read).
          zlevel: options.zLevel?.series,
          // Pie vs donut (inner hole) from the panel's "Pie chart type" option.
          radius: getPieRadius(options.pieType),
          // Advanced "Select / explode": selectedMode (+ selectedOffset). `off`
          // maps to `selectedMode: false` (the ECharts default), so unchanged.
          ...getPieSelection(options.selectedMode, options.selectedOffset),
          // Advanced "Emphasis": hover focus/scale. Omitted at defaults.
          ...(emphasis ? { emphasis } : {}),
          // Advanced "Zero-sum / empty": stillShowZeroSum / showEmptyCircle.
          // Each key emitted only when it differs from the ECharts `true` default.
          ...getPieEmptyState(options.stillShowZeroSum, options.showEmptyCircle),
          // Advanced "Clockwise / avoid overlap": clockwise / avoidLabelOverlap.
          // Each key emitted only when it differs from the ECharts `true` default.
          ...getPieOrientation(options.clockwise, options.avoidLabelOverlap),
          // Grafana-styled slice labels; content (Name/Value/Percent) from the
          // panel's "Labels" option. No selection → labels hidden (core parity).
          // Advanced label color / text shadow / text stroke thread through here.
          label: getPieContentLabel(options.displayLabels, visible, theme, ctx.timeZone, {
            color: options.labelColor,
            textShadow: options.labelTextShadow,
            textStroke: options.labelTextStroke,
          }),
          // Dedicated pie tooltip (Single slice / All slices). Skipped in None
          // mode, where the panel disables the tooltip entirely.
          ...(tooltipMode === TooltipDisplayMode.None
            ? {}
            : { tooltip: { formatter: buildPieTooltip(visible, tooltipMode, theme, ctx.timeZone) } }),
        },
      ],
    };
  },

  buildLegendItems(ctx, calcs) {
    return buildPieLegendItems(
      ctx.frames,
      ctx.theme,
      calcs,
      ctx.fieldConfig,
      resolveReduceOptions(ctx),
      ctx.replaceVariables,
      ctx.timeZone,
      resolveSort(ctx)
    );
  },
};
