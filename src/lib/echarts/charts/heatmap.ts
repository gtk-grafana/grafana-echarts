import { cartesianTimeSeriesTypes } from 'editor/constants';
import { frameHasCartesianOverride } from 'editor/series';
import { frameToHeatmap } from 'lib/echarts/converters/heatmap';
import { timeSeriesToEChartsOption } from 'lib/echarts/converters/timeSeries';
import {
  cartesianTimeDefaultOptions,
  getCartesianAxisStyle,
  getTimeAxisBounds,
  mergeAxisStyle,
} from 'lib/echarts/options/cartesian';
import { HEATMAP_VISUALMAP_WIDTH } from 'lib/echarts/options/constants';
import { getHeatmapBucketAxis, getHeatmapSeries, getHeatmapVisualMap, } from 'lib/echarts/options/heatmap';
import { DEFAULT_CHART_LEGEND, getCartesianGrid } from 'lib/echarts/options/legend';
import { type ChartContext, type ChartModule } from './types';

/**
 * Split the panel's frames into the heatmap cell layer and an optional cartesian
 * overlay. Only this composite heatmap panel is allowed to mix families, and the
 * split is driven entirely by the per-field override: a frame whose numeric
 * field is overridden to a cartesian type (line/bar/scatter) is drawn as an
 * overlay on top of the cells, while every other frame feeds the heatmap layer.
 * See `frameHasCartesianOverride`.
 */
function splitFrames(ctx: ChartContext) {
  const overlayFrames = ctx.frames.filter(frameHasCartesianOverride);
  const heatmapSourceFrames = ctx.frames.filter((frame) => !frameHasCartesianOverride(frame));

  const heatmap = frameToHeatmap(heatmapSourceFrames, ctx.frames);

  return { overlayFrames, heatmap };
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

    const valueFormatter = (value: number) => formatValue(value);
    //@todo get value formatter
    // const valueFormatter = getValueFormat(ctx.options);
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
      // Pin the time axis to the dashboard range so gappy panels stay aligned;
      // non-time (value) buckets keep their data-derived extent.
      ...(xAxisIsTime ? getTimeAxisBounds(ctx.timeRange) : { type: 'value' }),
    });

    return {
      ...cartesianTimeDefaultOptions,
      // @todo clean up
      // legend: getLegendOption(options.legend, theme, heatmap ? cartSeries.map((s) => s.name) : undefined),
      grid,
      xAxis,
      yAxis,
      series,
      ...(heatmap ? { visualMap: getHeatmapVisualMap(heatmap, theme, 0, options.heatmapColorScheme) } : {}),
    };
  },
};
