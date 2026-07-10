import { type VizLegendItem } from '@grafana/ui';
import { type GridOption } from 'echarts/types/dist/shared';
import type { TimeAxisBaseOption } from 'echarts/types/src/coord/axisCommonTypes';
import {
  type CartesianAxisOption,
  type XAXisOption,
  type YAXisOption,
} from 'echarts/types/src/coord/cartesian/AxisModel';
import { frameHasCartesianOverride } from 'editor/series';
import { type HeatmapSeriesType } from 'editor/types';
import { frameToBinnedHeatmap } from 'lib/echarts/converters/binnedHeatmap';
import { timeSeriesToEChartsOption } from 'lib/echarts/converters/timeSeries';
import { getHeatmapGrid } from 'lib/echarts/grid/grid';
import {
  getBinnedHeatmapBucketAxis,
  getBinnedHeatmapSeries,
  getBinnedHeatmapVisualMap,
} from 'lib/echarts/options/binnedHeatmap';
import {
  cartesianTimeDefaultOptions,
  getCartesianAxisStyle,
  getTimeAxisBounds,
  mergeAxisStyle,
} from 'lib/echarts/options/cartesian';
import { buildTimeSeriesLegendItems } from 'lib/echarts/options/legendItems';
import { getTimeAxisLabelFormatter } from 'lib/grafana/timeAxisFormat';
import { type BaseOptionParts, type ChartContext, type EChartBinnedHeatmapOption } from './types';

/** A single entry in the binned heatmap composite series (custom cells + cartesian overlays). */
type BinnedHeatmapSeries = Exclude<NonNullable<EChartBinnedHeatmapOption['series']>, unknown[]>;

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

  // returns null when there are no frames, otherwise throw
  const heatmap = frameToBinnedHeatmap(heatmapSourceFrames, ctx.frames);

  return { overlayFrames, heatmap };
}

/**
 * Only the overlaid cartesian series belong in the Grafana DOM legend; the
 * binned heatmap cells are represented by the ECharts visualMap.
 */
export function buildBinnedHeatmapLegendItems(ctx: ChartContext, calcs: string[]): VizLegendItem[] {
  const overlayFrames = ctx.frames.filter(frameHasCartesianOverride);
  return buildTimeSeriesLegendItems(overlayFrames, ctx.theme, calcs, ctx.timeZone);
}

/**
 * Build the binned heatmap option: the custom-series cell layer (interval
 * rectangles on continuous time/value axes) plus optional cartesian overlays.
 * Returns null when no heatmap frames are present (empty panel).
 */
export function buildBinnedHeatmapOption(
  ctx: ChartContext<HeatmapSeriesType>,
  { isGrafanaLegend }: BaseOptionParts
): EChartBinnedHeatmapOption | null {
  const { theme, options, seriesType, formatValue } = ctx;
  const placement = options.heatmapColorScale?.placement ?? 'right';
  const { overlayFrames, heatmap } = splitFrames(ctx);
  const cartSeries = timeSeriesToEChartsOption({ ...ctx, seriesType, frames: overlayFrames }) ?? [];

  // no heatmap frames: show empty panel
  if (heatmap === null) {
    return null;
  }

  const axisStyle = getCartesianAxisStyle(theme);
  const overlayYAxisIndex = 1;

  // Composite panel: the heatmap cell layer plus optional cartesian overlays (line/bar/scatter).
  const series: BinnedHeatmapSeries[] = [];
  series.push(getBinnedHeatmapSeries(heatmap, { theme, timeZone: ctx.timeZone, formatValue }, 0, options.zLevel?.series));
  for (const cartesian of cartSeries) {
    series.push({ ...cartesian, yAxisIndex: overlayYAxisIndex });
  }

  const bucketAxisExtra: CartesianAxisOption | TimeAxisBaseOption = getBinnedHeatmapBucketAxis(heatmap);

  const yAxis = mergeAxisStyle<YAXisOption>(cartesianTimeDefaultOptions.yAxis, axisStyle, {
    min: heatmap.yMin,
    max: heatmap.yMax,
    ...bucketAxisExtra,
  });

  const vizLegendOptions = isGrafanaLegend ? undefined : options.legend;
  const grid: GridOption = getHeatmapGrid(placement, vizLegendOptions);
  const xAxisIsTime = heatmap?.xIsTime ?? true;

  const getTimeAxisOptions: () => TimeAxisBaseOption = () => ({
    ...getTimeAxisBounds(ctx.timeRange),
    axisLabel: { formatter: getTimeAxisLabelFormatter(ctx.timeRange, ctx.timeZone) },
  });
  const getCategoricalAxisOption: () => CartesianAxisOption = () => ({ type: 'value' });

  const heatmapAxisExtras: CartesianAxisOption | TimeAxisBaseOption = xAxisIsTime
    ? getTimeAxisOptions()
    : getCategoricalAxisOption();

  const xAxis = mergeAxisStyle<XAXisOption>(cartesianTimeDefaultOptions.xAxis, axisStyle, heatmapAxisExtras);

  return {
    ...cartesianTimeDefaultOptions,
    grid,
    xAxis,
    yAxis,
    series,
    visualMap: getBinnedHeatmapVisualMap(heatmap, theme, 0, options.heatmapColorScheme, placement),
  };
}
