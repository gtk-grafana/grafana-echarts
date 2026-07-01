import { radarToEChartsOption } from 'echarts/converters/radar';
import { getLegendOption, DEFAULT_CHART_LEGEND } from 'echarts/options/legend';
import { buildRadarLegendItems } from 'echarts/options/legendItems';
import { radarDefaultOptions } from 'echarts/options/radar';
import { ChartModule } from './types';

export const radarChartModule: ChartModule = {
  tooltipKind: 'radar',
  legend: DEFAULT_CHART_LEGEND,

  buildOption(ctx, { isGrafanaLegend }) {
    const { frames, theme, options, seriesType } = ctx;
    const radar = radarToEChartsOption(frames, theme);

    if (!radar) {
      return null;
    }

    return {
      ...radarDefaultOptions,
      legend: isGrafanaLegend
        ? { show: false }
        : getLegendOption(options.legend, theme, radar.data.map((polygon) => polygon.name)),
      radar: { indicator: radar.indicator },
      series: [{ type: seriesType, data: radar.data }],
    };
  },

  buildLegendItems(ctx, calcs) {
    return buildRadarLegendItems(ctx.frames, ctx.theme, calcs, ctx.timeZone);
  },
};
