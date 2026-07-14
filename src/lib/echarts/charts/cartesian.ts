import { type Field } from '@grafana/data';
import { type XAXisOption } from 'echarts/types/src/coord/cartesian/AxisModel';
import { type CartesianSingleValueSeriesType, type MultiValueSeriesType } from 'editor/types';
import { buildCartesianYAxes, getAxisGridSpacing } from 'lib/echarts/axes/yAxes';
import { isCartesianSingleValueSeriesType, isMultiValueSeriesType } from 'lib/echarts/charts/narrowing';
import { categoryCartesianToEChartsOption } from 'lib/echarts/converters/categoryCartesian';
import {
  collectTimeSeriesFields,
  findCategoricalFrame,
  framesHaveTimeField,
  mapNumericFields,
} from 'lib/echarts/converters/frames';
import { multiValueCartesianToEChartsOption } from 'lib/echarts/converters/multiValueCartesian';
import { timeSeriesToEChartsOption } from 'lib/echarts/converters/timeSeries';
import { getCartesianGrid } from 'lib/echarts/grid/grid';
import {
  cartesianCategoryDefaultOptions,
  cartesianTimeDefaultOptions,
  getCartesianAxisStyle,
  getTimeAxisBounds,
  mergeAxisStyle,
} from 'lib/echarts/options/cartesian';
import { DEFAULT_CHART_LEGEND, getLegendOption } from 'lib/echarts/options/legend';
import {
  buildCategoryCartesianLegendItems,
  buildMultiValueCartesianLegendItems,
  buildTimeSeriesLegendItems,
} from 'lib/echarts/options/legendItems';
import { buildThresholdMarks, type ThresholdMarks } from 'lib/echarts/options/thresholds';
import { getFieldValueFormatters } from 'lib/echarts/style';
import { indexedFormatterResolver } from 'lib/echarts/tooltip/template';
import { getFieldMinMax } from 'lib/grafana/fields/fieldConfig';
import { isNumberField } from 'lib/grafana/narrowing';
import {
  findThresholdField,
  getThresholdsStyleMode,
  resolveFieldThresholds,
  thresholdDisplayForMode,
} from 'lib/grafana/fields/thresholds';
import { getTimeAxisLabelFormatter } from 'lib/grafana/timeAxisFormat';
import {
  type ChartContext,
  type ChartModule,
  type EChartCartesianSeriesOption,
  type EChartMultiValueCartesianSeriesOption,
} from './types';

// Cartesian family (Groups 1-2). The x-axis mode follows the data, not the
// series type: time frames render on a `time` axis, while Numeric frames with no
// time field render on a `category` axis built from the shared categorical
// model. See the plan's "axis type should follow data" note.

/** Time-axis cartesian: `[time, value]` series on a time grid. */
function buildTimeOption(
  ctx: ChartContext<CartesianSingleValueSeriesType>,
  isGrafanaLegend: boolean
): EChartCartesianSeriesOption | null {
  const { theme, options, formatValue, timeZone } = ctx;

  const cartSeries = timeSeriesToEChartsOption(ctx);

  if (!cartSeries || cartSeries.length === 0) {
    return null;
  }

  const axisStyle = getCartesianAxisStyle(theme);

  // One y-axis per distinct field unit; each series is pinned to its unit's axis.
  const axes = buildCartesianYAxes({
    fields: cartesianSeriesFields(ctx),
    baseYAxis: cartesianTimeDefaultOptions.yAxis,
    axisStyle,
    theme,
    timeZone,
    fallbackFormatter: formatValue,
    zlevel: options.zLevel?.axis,
  });
  const indexedSeries = cartSeries.map((cartesian, i) => ({ ...cartesian, yAxisIndex: axes.seriesYAxisIndex[i] ?? 0 }));
  const series = attachThresholdMarks(indexedSeries, cartesianThresholdMarks(ctx));

  // Pin the time axis to the dashboard range so gaps in this panel's data still
  // align with sibling panels sharing the same range. Labels are formatted via
  // Grafana's timezone-aware formatter (ECharts' built-in date labels would
  // render in browser-local time, ignoring the dashboard timezone).
  const xAxis = mergeAxisStyle<XAXisOption>(cartesianTimeDefaultOptions.xAxis, axisStyle, {
    ...getTimeAxisBounds(ctx.timeRange),
    axisLabel: { formatter: getTimeAxisLabelFormatter(ctx.timeRange, ctx.timeZone) },
  });

  return {
    ...cartesianTimeDefaultOptions,
    legend: isGrafanaLegend ? { show: false } : getLegendOption(options.legend, theme),
    grid: getCartesianGrid(isGrafanaLegend ? undefined : options.legend, getAxisGridSpacing(axes)),
    xAxis,
    yAxis: axes.yAxis,
    series,
  };
}

/** Category-axis cartesian: plain y-values over a category x-axis. */
function buildCategoryOption(
  ctx: ChartContext<CartesianSingleValueSeriesType>,
  isGrafanaLegend: boolean
): EChartCartesianSeriesOption | null {
  const { theme, options, formatValue, seriesType, timeZone } = ctx;

  if (!isCartesianSingleValueSeriesType(seriesType)) {
    throw new Error(`Categorical-x requires a cartesian series type! ${seriesType}`);
  }

  const categoryData = categoryCartesianToEChartsOption({ ...ctx, seriesType });
  const axisStyle = getCartesianAxisStyle(theme);

  // One y-axis per distinct field unit; each series is pinned to its unit's axis.
  const axes = buildCartesianYAxes({
    fields: cartesianSeriesFields(ctx),
    baseYAxis: cartesianCategoryDefaultOptions.yAxis,
    axisStyle,
    theme,
    timeZone,
    fallbackFormatter: formatValue,
    zlevel: options.zLevel?.axis,
  });

  const baseSeries = categoryData.series;
  const seriesArray = Array.isArray(baseSeries) ? baseSeries : baseSeries ? [baseSeries] : [];
  const indexedSeries = seriesArray.map((cartesian, i) => ({
    ...cartesian,
    yAxisIndex: axes.seriesYAxisIndex[i] ?? 0,
  }));
  const series = attachThresholdMarks(indexedSeries, cartesianThresholdMarks(ctx));

  // The category axis carries its labels in `data`; there is no per-tick value
  // to format, so no value formatter is applied to the x-axis.
  const xAxis = mergeAxisStyle(cartesianCategoryDefaultOptions.xAxis, axisStyle, {
    data: categoryData.categories,
  });

  return {
    ...cartesianCategoryDefaultOptions,
    legend: isGrafanaLegend ? { show: false } : getLegendOption(options.legend, theme),
    grid: getCartesianGrid(isGrafanaLegend ? undefined : options.legend, getAxisGridSpacing(axes)),
    xAxis,
    yAxis: axes.yAxis,
    series,
  };
}

/**
 * Multi-value cartesian: candlestick/boxplot on a category x-axis.
 * Each x position carries several aligned dimensions (OHLC or five-number
 * summary) instead of a single y, so the render type also selects the field
 * mapping in the converter.
 */
function buildMultiValueOption(
  ctx: ChartContext<MultiValueSeriesType>,
  isGrafanaLegend: boolean
): EChartMultiValueCartesianSeriesOption | null {
  const { theme, options, formatValue, timeRange, timeZone } = ctx;
  const multiValueData = multiValueCartesianToEChartsOption(ctx);

  if (!multiValueData) {
    return null;
  }

  const axisStyle = getCartesianAxisStyle(theme);

  // Candlestick/boxplot share one value axis. Source explicit Min/Max from the
  // first numeric field (the same field backing the panel `formatValue`); any
  // unset side keeps ECharts' `scale: true` auto-fit.
  const representativeField = ctx.frames.flatMap((frame) => frame.fields).find(isNumberField);
  const { min, max } = representativeField ? getFieldMinMax(representativeField) : {};

  const yAxis = mergeAxisStyle(
    cartesianCategoryDefaultOptions.yAxis,
    axisStyle,
    {
      zlevel: options.zLevel?.axis,
      min,
      max,
    },
    formatValue
  );

  // Candlestick/boxplot render on a category axis whose labels are ISO
  // timestamps (kept ISO for deterministic categories). Format them for display
  // via Grafana's timezone-aware formatter; non-time categories pass through.
  const xAxis = mergeAxisStyle(cartesianCategoryDefaultOptions.xAxis, axisStyle, {
    data: multiValueData.categories,
    axisLabel: { formatter: getTimeAxisLabelFormatter(timeRange, timeZone) },
  });

  const baseSeries = multiValueData.series;
  const seriesArray = Array.isArray(baseSeries) ? baseSeries : baseSeries ? [baseSeries] : [];
  const series = attachThresholdMarks(seriesArray, cartesianThresholdMarks(ctx));

  return {
    ...cartesianCategoryDefaultOptions,
    legend: isGrafanaLegend ? { show: false } : getLegendOption(options.legend, theme),
    grid: getCartesianGrid(isGrafanaLegend ? undefined : options.legend),
    xAxis,
    yAxis,
    series,
  };
}

/**
 * Numeric value fields in the same order the converters emit series, so a
 * tooltip's `seriesIndex` maps back to its source field. Multi-value
 * (candlestick/boxplot) draws a single series from several fields, so there is
 * no per-series field to return; the resolver falls back to the panel formatter.
 */
function cartesianSeriesFields(ctx: ChartContext): Field[] {
  if (isMultiValueSeriesType(ctx.seriesType)) {
    return [];
  }
  if (framesHaveTimeField(ctx.frames)) {
    return collectTimeSeriesFields(ctx.frames);
  }
  const frame = findCategoricalFrame(ctx.frames);
  return frame ? mapNumericFields(frame, ctx.frames, ctx.theme).map(({ field }) => field) : [];
}

/**
 * Threshold line/region overlays for the panel, derived from the first field
 * with an active threshold display. Thresholds render once on the shared value
 * axis, so callers attach the result to a single series. Returns `undefined`
 * when no field requests thresholds.
 */
function cartesianThresholdMarks(ctx: ChartContext): ThresholdMarks | undefined {
  const field = findThresholdField(ctx.frames.flatMap((frame) => frame.fields));
  if (!field) {
    return undefined;
  }

  const display = thresholdDisplayForMode(getThresholdsStyleMode(field));
  const steps = resolveFieldThresholds(field, ctx.theme);
  if (!display || !steps) {
    return undefined;
  }

  return buildThresholdMarks(steps, display);
}

/**
 * Attach threshold overlays to the first series so the horizontal lines/regions
 * paint once on the shared y-axis rather than being duplicated per series.
 */
function attachThresholdMarks<T>(series: T[], marks: ThresholdMarks | undefined): T[] {
  if (!marks || series.length === 0) {
    return series;
  }
  return [{ ...series[0], ...marks }, ...series.slice(1)];
}

export const cartesianChartModule: ChartModule = {
  legend: DEFAULT_CHART_LEGEND,

  getTooltipValueFormatter(ctx) {
    const formatters = getFieldValueFormatters(cartesianSeriesFields(ctx), ctx.theme, ctx.timeZone);
    return indexedFormatterResolver(formatters, ctx.formatValue, 'seriesIndex');
  },

  buildOption(
    ctx: ChartContext<CartesianSingleValueSeriesType | MultiValueSeriesType>,
    { isGrafanaLegend }
  ): EChartCartesianSeriesOption | EChartMultiValueCartesianSeriesOption | null {
    // @todo gate invalid frames and always throw in internal methods

    const seriesType = ctx.seriesType;

    if (isMultiValueSeriesType(seriesType)) {
      // @todo this is a unnecessary spread to get typescript playing nicely, I guess we need narrowing methods for context as well to avoid this
      return buildMultiValueOption({ ...ctx, seriesType }, isGrafanaLegend);
    }

    if (isCartesianSingleValueSeriesType(ctx.seriesType)) {
      return framesHaveTimeField(ctx.frames)
        ? buildTimeOption({ ...ctx, seriesType }, isGrafanaLegend)
        : buildCategoryOption({ ...ctx, seriesType }, isGrafanaLegend);
    }

    throw new Error(`Invalid series type: ${ctx.seriesType}`);
  },

  buildLegendItems(ctx, calcs) {
    const seriesType = ctx.seriesType;
    if (isMultiValueSeriesType(seriesType)) {
      return buildMultiValueCartesianLegendItems({ ...ctx, seriesType });
    }
    return framesHaveTimeField(ctx.frames)
      ? buildTimeSeriesLegendItems(ctx.frames, ctx.theme, calcs, ctx.timeZone)
      : buildCategoryCartesianLegendItems(ctx.frames, ctx.theme, calcs, ctx.timeZone);
  },
};
