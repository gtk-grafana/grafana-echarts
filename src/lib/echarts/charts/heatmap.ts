import { frameHasCartesianOverride, cartesianTimeSeriesTypes } from 'editor/series';
import { frameToHeatmap, isHeatmapFrame } from 'lib/echarts/converters/heatmap';
import { timeSeriesToEChartsOption } from 'lib/echarts/converters/timeSeries';
import {
  cartesianTimeDefaultOptions,
  getCartesianAxisStyle,
  mergeAxisStyle,
} from 'lib/echarts/options/cartesian';
import {
  getHeatmapBucketAxis,
  getHeatmapSeries,
  getHeatmapVisualMap,
  HEATMAP_VISUALMAP_WIDTH,
} from 'lib/echarts/options/heatmap';
import { getCartesianGrid, getLegendOption, DEFAULT_CHART_LEGEND } from 'lib/echarts/options/legend';
import { ChartContext, ChartModule } from './types';

function splitFrames(ctx: ChartContext) {
  const forceHeatmap = ctx.seriesType === 'heatmap';
  const heatmapFrames = ctx.frames.filter(isHeatmapFrame);
  const cartesianFrames = ctx.frames.filter((frame) => !isHeatmapFrame(frame));
  const hasHeatmap = forceHeatmap || heatmapFrames.length > 0;

  const overlayFrames = forceHeatmap ? ctx.frames.filter(frameHasCartesianOverride) : cartesianFrames;
  const heatmapSourceFrames = forceHeatmap
    ? ctx.frames.filter((frame) => !frameHasCartesianOverride(frame))
    : heatmapFrames;

  const heatmap = hasHeatmap ? frameToHeatmap(heatmapSourceFrames, ctx.frames) : null;

  return { hasHeatmap, overlayFrames, heatmap };
}

export const heatmapChartModule: ChartModule = {
  legend: DEFAULT_CHART_LEGEND,

  buildOption(ctx, { isGrafanaLegend }) {
    const { theme, options, seriesType, formatValue } = ctx;
    const { overlayFrames, heatmap } = splitFrames(ctx);

    const overlayType = cartesianTimeSeriesTypes.includes(seriesType) ? seriesType : 'line';
    const cartSeries = timeSeriesToEChartsOption(overlayFrames, overlayType, theme) ?? [];

    if (cartSeries.length === 0 && !heatmap) {
      return null;
    }

    const axisStyle = getCartesianAxisStyle(theme);
    const valueFormatter = (value: unknown) => formatValue(typeof value === 'number' ? value : null);
    const overlayYAxisIndex = heatmap ? 1 : 0;

    const series: unknown[] = [];
    if (heatmap) {
      series.push(getHeatmapSeries(heatmap, { theme, timeZone: ctx.timeZone, formatValue }, 0));
    }
    for (const cartesian of cartSeries) {
      series.push({ ...cartesian, yAxisIndex: overlayYAxisIndex });
    }

    const overlayValueAxis = mergeAxisStyle(
      cartesianTimeDefaultOptions.yAxis as Record<string, unknown>,
      axisStyle,
      undefined,
      valueFormatter
    );

    const bucketAxisExtra = heatmap ? getHeatmapBucketAxis(heatmap) : {};
    const yAxis = heatmap
      ? [
          mergeAxisStyle(
            cartesianTimeDefaultOptions.yAxis as Record<string, unknown>,
            axisStyle,
            { min: heatmap.yMin, max: heatmap.yMax, ...bucketAxisExtra }
          ),
          { ...overlayValueAxis, position: 'right' },
        ]
      : overlayValueAxis;

    const baseGrid = getCartesianGrid(isGrafanaLegend ? undefined : options.legend);
    const grid = heatmap
      ? { ...baseGrid, right: Number(baseGrid.right ?? 16) + HEATMAP_VISUALMAP_WIDTH }
      : baseGrid;

    const xAxisIsTime = cartSeries.length > 0 || (heatmap ? heatmap.xIsTime : true);
    const xAxis = mergeAxisStyle(cartesianTimeDefaultOptions.xAxis as Record<string, unknown>, axisStyle, {
      ...(xAxisIsTime ? {} : { type: 'value' }),
    });

    return {
      ...cartesianTimeDefaultOptions,
      legend: getLegendOption(options.legend, theme, heatmap ? cartSeries.map((s) => s.name) : undefined),
      grid,
      xAxis,
      yAxis,
      series,
      ...(heatmap ? { visualMap: getHeatmapVisualMap(heatmap, theme, 0, options.heatmapColorScheme) } : {}),
    };
  },
};
