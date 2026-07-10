import { pieToEChartsOption } from 'lib/echarts/converters/pie';
import { DEFAULT_CHART_LEGEND, getLegendOption } from 'lib/echarts/options/legend';
import { buildPieLegendItems } from 'lib/echarts/options/legendItems';
import { pieDefaultOptions } from 'lib/echarts/options/pie';
import { type ChartContext, type ChartModule, type EChartPieSeriesOption } from './types';

export const pieChartModule: ChartModule = {
  legend: DEFAULT_CHART_LEGEND,

  buildOption(ctx: ChartContext<'pie'>, { isGrafanaLegend }): EChartPieSeriesOption | null {
    const { frames, theme, options, seriesType } = ctx;
    const slices = pieToEChartsOption(frames, theme);

    if (!slices) {
      return null;
    }

    const legend = isGrafanaLegend
      ? { show: false }
      : getLegendOption(
          options.legend,
          theme,
          slices.map((slice) => slice.name)
        );

    return {
      ...pieDefaultOptions,
      legend,
      series: [{ type: seriesType, data: slices }],
    };
  },

  buildLegendItems(ctx, calcs) {
    return buildPieLegendItems(ctx.frames, ctx.theme, calcs, ctx.timeZone);
  },
};
