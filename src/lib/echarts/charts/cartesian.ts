import { multiValueCartesianTypes } from 'editor/constants';
import { categoryCartesianToEChartsOption } from 'lib/echarts/converters/categoryCartesian';
import { framesHaveTimeField } from 'lib/echarts/converters/frames';
import {
  type MultiValueChartType,
  multiValueCartesianToEChartsOption,
} from 'lib/echarts/converters/multiValueCartesian';
import { timeSeriesToEChartsOption } from 'lib/echarts/converters/timeSeries';
import {
  cartesianCategoryDefaultOptions,
  cartesianTimeDefaultOptions,
  getCartesianAxisStyle,
  mergeAxisStyle,
} from 'lib/echarts/options/cartesian';
import { getCartesianGrid, getLegendOption, DEFAULT_CHART_LEGEND } from 'lib/echarts/options/legend';
import {
  buildCategoryCartesianLegendItems,
  buildMultiValueCartesianLegendItems,
  buildTimeSeriesLegendItems,
} from 'lib/echarts/options/legendItems';
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

/**
 * Multi-value cartesian: candlestick/boxplot on a category x-axis.
 * Each x position carries several aligned dimensions (OHLC or five-number
 * summary) instead of a single y, so the render type also selects the field
 * mapping in the converter.
 */
function buildMultiValueOption(ctx: ChartContext, isGrafanaLegend: boolean): ECBasicOption | null {
  const { frames, theme, options, seriesType, formatValue } = ctx;
  const multiValueData = multiValueCartesianToEChartsOption(frames, seriesType as MultiValueChartType, theme);

  if (!multiValueData || multiValueData.series.length === 0) {
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
    data: multiValueData.categories,
  });

  return {
    ...cartesianCategoryDefaultOptions,
    legend: isGrafanaLegend ? { show: false } : getLegendOption(options.legend, theme),
    grid: getCartesianGrid(isGrafanaLegend ? undefined : options.legend),
    xAxis,
    yAxis,
    series: multiValueData.series,
  };
}

/** True when the panel render type is a multi-value cartesian type (Group 3). */
function isMultiValueType(seriesType: ChartContext['seriesType']): boolean {
  return multiValueCartesianTypes.includes(seriesType);
}

export const cartesianChartModule: ChartModule = {
  legend: DEFAULT_CHART_LEGEND,

  buildOption(ctx, { isGrafanaLegend }) {
    if (isMultiValueType(ctx.seriesType)) {
      return buildMultiValueOption(ctx, isGrafanaLegend);
    }
    return framesHaveTimeField(ctx.frames)
      ? buildTimeOption(ctx, isGrafanaLegend)
      : buildCategoryOption(ctx, isGrafanaLegend);
  },

  buildLegendItems(ctx, calcs) {
    if (isMultiValueType(ctx.seriesType)) {
      return buildMultiValueCartesianLegendItems(ctx.frames, ctx.theme, ctx.seriesType as MultiValueChartType);
    }
    return framesHaveTimeField(ctx.frames)
      ? buildTimeSeriesLegendItems(ctx.frames, ctx.theme, calcs, ctx.timeZone)
      : buildCategoryCartesianLegendItems(ctx.frames, ctx.theme, calcs, ctx.timeZone);
  },
};
