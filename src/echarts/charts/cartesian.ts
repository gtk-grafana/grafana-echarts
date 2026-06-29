import { resolveLinksFromFrames } from 'echarts/data/links';
import { timeSeriesToEChartsOption } from 'echarts/converters/timeSeries';
import {
  cartesianTimeDefaultOptions,
  getCartesianAxisStyle,
  mergeAxisStyle,
} from 'echarts/options/cartesian';
import { getCartesianGrid, getLegendOption } from 'echarts/options/legend';
import { buildTimeSeriesLegendItems } from 'echarts/options/legendItems';
import { ChartModule, TooltipExtras } from './types';

export const cartesianChartModule: ChartModule = {
  tooltipKind: 'timeseries',
  supportsTableLegend: true,

  buildOption(ctx, { tableLegend }) {
    const { frames, theme, options, seriesType, formatValue } = ctx;
    const cartSeries = timeSeriesToEChartsOption(frames, seriesType, theme);

    if (!cartSeries || cartSeries.length === 0) {
      return null;
    }

    const axisStyle = getCartesianAxisStyle(theme);
    const valueFormatter = (value: unknown) => formatValue(typeof value === 'number' ? value : null);

    const yAxis = mergeAxisStyle(
      cartesianTimeDefaultOptions.yAxis as Record<string, unknown>,
      axisStyle,
      undefined,
      valueFormatter
    );

    const xAxis = mergeAxisStyle(cartesianTimeDefaultOptions.xAxis as Record<string, unknown>, axisStyle);

    return {
      ...cartesianTimeDefaultOptions,
      legend: tableLegend
        ? { show: false }
        : getLegendOption(options.legend, theme),
      grid: getCartesianGrid(tableLegend ? undefined : options.legend),
      xAxis,
      yAxis,
      series: cartSeries,
    };
  },

  buildLegendItems(ctx, calcs) {
    return buildTimeSeriesLegendItems(ctx.frames, ctx.theme, calcs, ctx.timeZone);
  },

  resolveLinks(ctx) {
    return resolveLinksFromFrames(ctx.frames, 'timeseries');
  },

  getTooltipExtras(): TooltipExtras {
    return { radarIndicators: [], xIsTime: true, syncEnabled: true };
  },
};
