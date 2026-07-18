import { type ReduceDataOptions } from '@grafana/data';
import { TooltipDisplayMode } from '@grafana/schema';
import { resolvePieSlices } from 'lib/echarts/converters/pie';
import { DEFAULT_CHART_LEGEND, getLegendOption } from 'lib/echarts/options/legend';
import { buildPieLegendItems } from 'lib/echarts/options/legendItems';
import { getPieLabelStyle, pieDefaultOptions } from 'lib/echarts/options/pie';
import { getValueFormatter } from 'lib/echarts/style';
import { buildPieTooltip } from 'lib/echarts/tooltip/pie';
import { indexedFormatterResolver } from 'lib/echarts/tooltip/template';
import { type ChartContext, type ChartModule, type EChartPieDataItem, type EChartPieSeriesOption } from './types';

const resolveReduceOptions = (ctx: ChartContext): ReduceDataOptions | undefined => ctx.options.reduceOptions;

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
      ctx.timeZone
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
      ctx.timeZone
    );

    // No numeric-like field at all → no usable data. (Distinct from "all slices
    // hidden", which still renders an empty pie rather than throwing.)
    if (slices.length === 0) {
      return null;
    }

    const visible = slices.filter((slice) => !slice.hidden);
    const data: EChartPieDataItem[] = visible.map((slice) => ({
      name: slice.name,
      // ECharts pie values are numeric-only; undefined renders an empty slice.
      value: slice.value,
      itemStyle: { color: slice.color },
    }));

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
          // Grafana-styled labels: theme font/color and no default text shadow/stroke.
          label: getPieLabelStyle(theme),
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
      ctx.timeZone
    );
  },
};
