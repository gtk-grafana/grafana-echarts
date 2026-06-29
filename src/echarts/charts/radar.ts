import { resolveLinksFromFrames } from 'echarts/data/links';
import { radarToEChartsOption } from 'echarts/converters/radar';
import { getLegendOption } from 'echarts/options/legend';
import { buildRadarLegendItems } from 'echarts/options/legendItems';
import { radarDefaultOptions } from 'echarts/options/radar';
import { ChartModule } from './types';

export const radarChartModule: ChartModule = {
  tooltipKind: 'radar',
  supportsTableLegend: true,

  buildOption(ctx, { tableLegend }) {
    const { frames, theme, options, seriesType } = ctx;
    const radar = radarToEChartsOption(frames, theme);

    if (!radar) {
      return null;
    }

    return {
      ...radarDefaultOptions,
      legend: tableLegend
        ? { show: false }
        : getLegendOption(options.legend, theme, radar.data.map((polygon) => polygon.name)),
      radar: { indicator: radar.indicator },
      series: [{ type: seriesType, data: radar.data }],
    };
  },

  buildLegendItems(ctx, calcs) {
    return buildRadarLegendItems(ctx.frames, ctx.theme, calcs, ctx.timeZone);
  },

  resolveLinks(ctx) {
    return resolveLinksFromFrames(ctx.frames, 'radar');
  },

  getTooltipExtras(ctx) {
    const radar = radarToEChartsOption(ctx.frames, ctx.theme);
    return {
      radarIndicators: radar ? radar.indicator.map((indicator) => indicator.name) : [],
      xIsTime: true,
      syncEnabled: false,
    };
  },
};
