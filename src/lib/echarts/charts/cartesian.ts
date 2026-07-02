import { categoryCartesianToEChartsOption } from 'lib/echarts/converters/categoryCartesian';
import { framesHaveTimeField } from 'lib/echarts/converters/frames';
import { timeSeriesToEChartsOption } from 'lib/echarts/converters/timeSeries';
import {
  cartesianCategoryDefaultOptions,
  cartesianTimeDefaultOptions,
  getCartesianAxisStyle,
  mergeAxisStyle,
} from 'lib/echarts/options/cartesian';
import { getCartesianGrid, getLegendOption, DEFAULT_CHART_LEGEND } from 'lib/echarts/options/legend';
import { buildCategoryCartesianLegendItems, buildTimeSeriesLegendItems } from 'lib/echarts/options/legendItems';
import { type ChartContext, type ChartModule } from './types';
import { type ECBasicOption } from 'echarts/types/dist/shared';

// Cartesian family (Groups 1-2). The x-axis mode follows the data, not the
// series type: time frames render on a `time` axis, while Numeric frames with no
// time field render on a `category` axis built from the shared categorical
// model. See the plan's "axis type should follow data" note.

/** Time-axis cartesian (Group 1): `[time, value]` series on a time grid. */
function buildTimeOption(ctx: ChartContext, isGrafanaLegend: boolean): ECBasicOption | null {
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
    legend: isGrafanaLegend ? { show: false } : getLegendOption(options.legend, theme),
    grid: getCartesianGrid(isGrafanaLegend ? undefined : options.legend),
    xAxis,
    yAxis,
    series: cartSeries,
  };
}

/** Category-axis cartesian: plain y-values over a category x-axis. */
function buildCategoryOption(ctx: ChartContext, isGrafanaLegend: boolean): ECBasicOption | null {
  const { frames, theme, options, seriesType, formatValue } = ctx;
  const categoryData = categoryCartesianToEChartsOption(frames, seriesType, theme);

  if (!categoryData || categoryData.series.length === 0) {
    return null;
  }

  const axisStyle = getCartesianAxisStyle(theme);
  const valueFormatter = (value: unknown) => formatValue(typeof value === 'number' ? value : null);

  const yAxis = mergeAxisStyle(
    cartesianCategoryDefaultOptions.yAxis as Record<string, unknown>,
    axisStyle,
    undefined,
    valueFormatter
  );

  // The category axis carries its labels in `data`; there is no per-tick value
  // to format, so no value formatter is applied to the x-axis.
  const xAxis = mergeAxisStyle(cartesianCategoryDefaultOptions.xAxis as Record<string, unknown>, axisStyle, {
    data: categoryData.categories,
  });

  return {
    ...cartesianCategoryDefaultOptions,
    legend: isGrafanaLegend ? { show: false } : getLegendOption(options.legend, theme),
    grid: getCartesianGrid(isGrafanaLegend ? undefined : options.legend),
    xAxis,
    yAxis,
    series: categoryData.series,
  };
}

export const cartesianChartModule: ChartModule = {
  legend: DEFAULT_CHART_LEGEND,

  buildOption(ctx, { isGrafanaLegend }) {
    return framesHaveTimeField(ctx.frames)
      ? buildTimeOption(ctx, isGrafanaLegend)
      : buildCategoryOption(ctx, isGrafanaLegend);
  },

  buildLegendItems(ctx, calcs) {
    return framesHaveTimeField(ctx.frames)
      ? buildTimeSeriesLegendItems(ctx.frames, ctx.theme, calcs, ctx.timeZone)
      : buildCategoryCartesianLegendItems(ctx.frames, ctx.theme, calcs, ctx.timeZone);
  },
};
