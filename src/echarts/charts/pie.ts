import { pieToEChartsOption } from 'echarts/converters/pie';
import { getLegendOption, DEFAULT_CHART_LEGEND } from 'echarts/options/legend';
import { buildPieLegendItems } from 'echarts/options/legendItems';
import { pieDefaultOptions } from 'echarts/options/pie';
import { ChartModule } from './types';

export const pieChartModule: ChartModule = {
  legend: DEFAULT_CHART_LEGEND,

  buildOption(ctx, { isGrafanaLegend }) {
    const { frames, theme, options, seriesType } = ctx;
    const slices = pieToEChartsOption(frames, theme);

    if (!slices) {
      return null;
    }

    return {
      ...pieDefaultOptions,
      legend: isGrafanaLegend
        ? { show: false }
        : getLegendOption(options.legend, theme, slices.map((slice) => slice.name)),
      series: [{ type: seriesType, data: slices }],
    };
  },

  buildLegendItems(ctx, calcs) {
    return buildPieLegendItems(ctx.frames, ctx.theme, calcs, ctx.timeZone);
  },
};
