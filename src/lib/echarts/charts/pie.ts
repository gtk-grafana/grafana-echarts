import { type ReduceDataOptions } from '@grafana/data';
import { type SortOrder, TooltipDisplayMode } from '@grafana/schema';
import { PIE_SORT_DEFAULT } from 'editor/constants';
import { resolvePieSlices } from 'lib/echarts/converters/pie';
import { DEFAULT_CHART_LEGEND, getLegendOption } from 'lib/echarts/options/legend';
import { buildPieLegendItems } from 'lib/echarts/options/legendItems';
import {
  getPieCenter,
  getPieContentLabel,
  getPieItemStyle,
  getPieMinShowLabelAngle,
  getPieRadius,
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

    const visible = slices.filter((slice) => !slice.hidden);
    // Advanced-only slice separation border, merged into each slice's itemStyle
    // (empty object at the default, so the per-slice color is preserved unchanged).
    const borderStyle = getPieItemStyle(options.sliceBorderWidth, options.sliceBorderColor);
    const data: EChartPieDataItem[] = visible.map((slice) => ({
      name: slice.name,
      // ECharts pie values are numeric-only; undefined renders an empty slice.
      value: slice.value,
      itemStyle: { color: slice.color, ...borderStyle },
    }));

    const legend = isGrafanaLegend
      ? { show: false }
      : getLegendOption(
          options.legend,
          theme,
          visible.map((slice) => slice.name)
        );

    const tooltipMode = options.tooltip?.mode ?? TooltipDisplayMode.Single;

    // Advanced-only center override and min-angle-to-show-label; both omitted at
    // their defaults so the ECharts default (centered, all labels shown) stands.
    const center = getPieCenter(options.centerX, options.centerY);
    const minShowLabelAngle = getPieMinShowLabelAngle(options.minShowLabelAngle);

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
          // Pie vs donut (inner hole) from the panel's "Pie chart type" option,
          // with Advanced-only inner/outer radius overrides.
          radius: getPieRadius(options.pieType, options.innerRadius, options.outerRadius),
          // Advanced-only center offset (percentages).
          ...(center ? { center } : {}),
          // Advanced-only: hide labels on slices below this central angle.
          ...(minShowLabelAngle != null ? { minShowLabelAngle } : {}),
          // Grafana-styled slice labels; content (Name/Value/Percent) from the
          // panel's "Labels" option. No selection → labels hidden (core parity).
          // Advanced-only font size / overflow / percent precision threaded in.
          label: getPieContentLabel(options.displayLabels, visible, theme, ctx.timeZone, {
            fontSize: options.labelFontSize,
            overflow: options.labelOverflow,
            width: options.labelWidth,
            percentPrecision: options.percentPrecision,
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
