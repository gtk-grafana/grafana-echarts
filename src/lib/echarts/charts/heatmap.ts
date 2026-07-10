import { frameHasCartesianOverride } from 'editor/series';
import { type HeatmapSeriesType } from 'editor/types';
import { frameToHeatmap } from 'lib/echarts/converters/heatmap';
import { timeSeriesToEChartsOption } from 'lib/echarts/converters/timeSeries';
import {
  cartesianTimeDefaultOptions,
  getCartesianAxisStyle,
  getTimeAxisBounds,
  mergeAxisStyle,
} from 'lib/echarts/options/cartesian';
import { HEATMAP_VISUALMAP_HEIGHT, HEATMAP_VISUALMAP_WIDTH } from 'lib/echarts/options/constants';
import { getHeatmapBucketAxis, getHeatmapSeries, getHeatmapVisualMap } from 'lib/echarts/options/heatmap';
import { DEFAULT_CHART_LEGEND, getCartesianGrid } from 'lib/echarts/options/legend';
import { buildTimeSeriesLegendItems } from 'lib/echarts/options/legendItems';
import { getTimeAxisLabelFormatter } from 'lib/grafana/timeAxisFormat';
import {
  type ChartContext,
  type ChartModule,
  type EChartSingleValueCartesianSeries,
  type EChartHeatmapOption,
} from './types';

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
  buildLegendItems(ctx, calcs) {
    // Heatmap cells are represented by the ECharts visualMap (see buildOption);
    // only the overlaid cartesian series belong in the Grafana DOM legend.
    const overlayFrames = ctx.frames.filter(frameHasCartesianOverride);
    return buildTimeSeriesLegendItems(overlayFrames, ctx.theme, calcs, ctx.timeZone);
  },

  buildOption(ctx: ChartContext<HeatmapSeriesType>, { isGrafanaLegend }): EChartHeatmapOption | null {
    const { theme, options, seriesType, formatValue } = ctx;
    const placement = options.heatmapColorScale?.placement ?? 'right';
    const { overlayFrames, heatmap } = splitFrames(ctx);
    const cartSeries = timeSeriesToEChartsOption({ ...ctx, seriesType, frames: overlayFrames }) ?? [];

    if (cartSeries.length === 0 && !heatmap) {
      return null;
    }

    const axisStyle = getCartesianAxisStyle(theme);

    const valueFormatter = (value: number) => formatValue(value);
    //@todo get value formatter
    // const valueFormatter = getValueFormat(ctx.options);
    const overlayYAxisIndex = heatmap ? 1 : 0;

    // Composite panel: the heatmap cell layer plus optional cartesian overlays (line/bar/scatter),
    const series: EChartSingleValueCartesianSeries[] = [];
    if (heatmap) {
      series.push(getHeatmapSeries(heatmap, { theme, timeZone: ctx.timeZone, formatValue }, 0));
    }
    for (const cartesian of cartSeries) {
      series.push({ ...cartesian, yAxisIndex: overlayYAxisIndex });
    }

    const overlayValueAxis = mergeAxisStyle(cartesianTimeDefaultOptions.yAxis, axisStyle, undefined, valueFormatter);

    const bucketAxisExtra = heatmap ? getHeatmapBucketAxis(heatmap) : {};
    const yAxis = heatmap
      ? [
          mergeAxisStyle(cartesianTimeDefaultOptions.yAxis, axisStyle, {
            min: heatmap.yMin,
            max: heatmap.yMax,
            ...bucketAxisExtra,
          }),
          { ...overlayValueAxis, position: 'right' },
        ]
      : overlayValueAxis;

    const baseGrid = getCartesianGrid(isGrafanaLegend ? undefined : options.legend);
    // Reserve space for the visualMap color scale on whichever side it sits.
    // @todo clean this up
    const grid = heatmap
      ? {
          ...baseGrid,
          left: 20,
          ...(placement === 'bottom'
            ? { bottom: Number(baseGrid.bottom ?? 0) + HEATMAP_VISUALMAP_HEIGHT }
            : { right: Number(baseGrid.right ?? 16) + HEATMAP_VISUALMAP_WIDTH }),
        }
      : baseGrid;

    const xAxisIsTime = cartSeries.length > 0 || (heatmap ? heatmap.xIsTime : true);
    const xAxis = mergeAxisStyle(cartesianTimeDefaultOptions.xAxis, axisStyle, {
      // Pin the time axis to the dashboard range so gappy panels stay aligned;
      // non-time (value) buckets keep their data-derived extent. Time labels use
      // Grafana's timezone-aware formatter to match the tz-aware tooltip.
      ...(xAxisIsTime
        ? {
            ...getTimeAxisBounds(ctx.timeRange),
            axisLabel: { formatter: getTimeAxisLabelFormatter(ctx.timeRange, ctx.timeZone) },
          }
        : { type: 'value' }),
    });

    return {
      ...cartesianTimeDefaultOptions,
      grid,
      // ECharts types xAxis/yAxis as a discriminated union keyed on the axis `type`;
      // the shared cartesian axis helpers are intentionally loose (any axis type),
      // so assert the axis shape while keeping grid/visualMap/series fully typed.
      xAxis: xAxis as EChartHeatmapOption['xAxis'],
      yAxis: yAxis as EChartHeatmapOption['yAxis'],
      series,
      ...(heatmap ? { visualMap: getHeatmapVisualMap(heatmap, theme, 0, options.heatmapColorScheme, placement) } : {}),
    };
  },
};
