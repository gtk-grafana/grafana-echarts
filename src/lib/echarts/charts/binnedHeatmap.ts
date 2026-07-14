import { type DataFrame, getDisplayProcessor, type GrafanaTheme2, type ValueFormatter } from '@grafana/data';
import { type VizLegendItem } from '@grafana/ui';
import { debug, LOG_LEVELS } from 'development';
import type { TimeAxisBaseOption } from 'echarts/types/src/coord/axisCommonTypes';
import {
  type CartesianAxisOption,
  type XAXisOption,
  type YAXisOption,
} from 'echarts/types/src/coord/cartesian/AxisModel';
import { frameHasCartesianOverride } from 'editor/series';
import { type HeatmapSeriesType } from 'editor/types';
import { buildCartesianYAxes, type CartesianYAxes, getAxisGridSpacing } from 'lib/echarts/axes/yAxes';
import { type BinnedHeatmapData, frameToBinnedHeatmap } from 'lib/echarts/converters/binnedHeatmap';
import { collectTimeSeriesFields } from 'lib/echarts/converters/frames';
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
import { getDefaultShortValueFieldConfig } from 'lib/grafana/fields/fieldConfig';
import { getTimeAxisLabelFormatter } from 'lib/grafana/timeAxisFormat';
import { type PanelOptions } from 'types';
import {
  type BaseOptionParts,
  type ChartContext,
  type EChartBinnedHeatmapOption,
  type EChartSingleValueCartesianSeries,
} from './types';

/** A single entry in the binned heatmap composite series (custom cells + cartesian overlays). */
type BinnedHeatmapSeries = Exclude<NonNullable<EChartBinnedHeatmapOption['series']>, unknown[]>;

/**
 * Frames drawn as cartesian overlays (line/bar/scatter) on top of the heatmap cells, selected by the per-field override.
 */
export function getOverlayFrames(ctx: ChartContext): DataFrame[] {
  return ctx.frames.filter(frameHasCartesianOverride);
}

/**
 * Only the overlaid cartesian series belong in the Grafana DOM legend; the
 * binned heatmap cells are represented by the ECharts visualMap.
 */
export function buildBinnedHeatmapLegendItems(ctx: ChartContext, calcs: string[]): VizLegendItem[] {
  return buildTimeSeriesLegendItems(getOverlayFrames(ctx), ctx.theme, calcs, ctx.timeZone);
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
  const { theme, options, seriesType, formatValue, timeZone } = ctx;
  const placement = options.heatmapColorScale?.placement ?? 'right';
  const { overlayFrames, heatmap } = splitFrames(ctx);
  const cartSeries = timeSeriesToEChartsOption({ ...ctx, seriesType, frames: overlayFrames }) ?? [];

  // no heatmap frames: show empty panel
  if (heatmap === null) {
    debug('Binned heatmap has empty frame', LOG_LEVELS.info);
    return null;
  }

  const axisStyle = getCartesianAxisStyle(theme);

  // Overlay value axes: one per distinct unit, honoring per-field Left/Right/Hidden
  // placement (see `buildCartesianYAxes`). They default to the right (`autoSide`)
  // so they don't collide with the bucket axis, which owns the left slot
  // (`initialLeftCount: 1`). No overlay: keep the single bucket axis object.
  const overlayAxes =
    cartSeries.length > 0
      ? buildCartesianYAxes({
          fields: collectTimeSeriesFields(overlayFrames),
          baseYAxis: cartesianTimeDefaultOptions.yAxis,
          axisStyle,
          theme,
          timeZone,
          fallbackFormatter: formatValue,
          zlevel: options.zLevel?.axis,
          autoSide: 'right',
          initialLeftCount: 1,
        })
      : undefined;

  // Composite panel: the heatmap cell layer plus optional cartesian overlays (line/bar/scatter).
  // Overlay axes follow the bucket axis (index 0), so shift their indices by 1.
  const series = buildSeries(heatmap, theme, ctx, formatValue, options, cartSeries, overlayAxes);
  const yAxis = buildYAxisOption(heatmap, axisStyle, options, overlayAxes);
  const grid = buildGridOption(isGrafanaLegend, options, overlayAxes, placement);
  const xAxis = buildXAxisOption(heatmap, ctx, axisStyle);

  const formatDisplayValue = getDisplayProcessor({
    theme,
    timeZone,
    field: getDefaultShortValueFieldConfig(heatmap.valueField),
  });

  return {
    ...cartesianTimeDefaultOptions,
    grid,
    xAxis,
    yAxis,
    series,
    visualMap: getBinnedHeatmapVisualMap({
      data: heatmap,
      theme,
      seriesIndex: 0,
      placement,
      scheme: options.heatmapColorScheme,
      formatDisplayValue,
    }),
  };
}

const buildYAxisOption = (
  heatmap: BinnedHeatmapData,
  axisStyle: CartesianAxisOption | TimeAxisBaseOption,
  options: PanelOptions,
  overlayAxes: CartesianYAxes | undefined
) => {
  const bucketAxisExtra: CartesianAxisOption | TimeAxisBaseOption = getBinnedHeatmapBucketAxis(heatmap);

  // Primary y-axis (index 0): the bucket scale the heatmap cells are drawn against.
  const bucketYAxis = mergeAxisStyle<YAXisOption>(cartesianTimeDefaultOptions.yAxis, axisStyle, {
    min: heatmap.yMin,
    max: heatmap.yMax,
    zlevel: options.zLevel?.axis,
    ...bucketAxisExtra,
  });

  // https://echarts.apache.org/en/option.html#yAxis
  const yAxis: YAXisOption | YAXisOption[] = overlayAxes ? [bucketYAxis, ...overlayAxes.yAxis] : bucketYAxis;
  return yAxis;
};

const buildXAxisOption = (
  heatmap: BinnedHeatmapData,
  ctx: ChartContext<HeatmapSeriesType>,
  axisStyle: CartesianAxisOption | TimeAxisBaseOption
) => {
  const xAxisIsTime = heatmap?.xIsTime ?? true;

  const getTimeAxisOptions: () => TimeAxisBaseOption = () => ({
    ...getTimeAxisBounds(ctx.timeRange),
    axisLabel: { formatter: getTimeAxisLabelFormatter(ctx.timeRange, ctx.timeZone) },
  });
  const getCategoricalAxisOption: () => CartesianAxisOption = () => ({ type: 'value' });

  const heatmapAxisExtras: CartesianAxisOption | TimeAxisBaseOption = xAxisIsTime
    ? getTimeAxisOptions()
    : getCategoricalAxisOption();

  return mergeAxisStyle<XAXisOption>(cartesianTimeDefaultOptions.xAxis, axisStyle, heatmapAxisExtras);
};

const buildGridOption = (
  isGrafanaLegend: boolean,
  options: PanelOptions,
  overlayAxes: CartesianYAxes | undefined,
  placement: 'right' | 'bottom'
) => {
  const vizLegendOptions = isGrafanaLegend ? undefined : options.legend;
  const extraAxisSpacing = overlayAxes ? getAxisGridSpacing(overlayAxes) : undefined;

  return getHeatmapGrid(placement, vizLegendOptions, extraAxisSpacing);
};

const buildSeries = (
  heatmap: BinnedHeatmapData,
  theme: GrafanaTheme2,
  ctx: ChartContext<HeatmapSeriesType>,
  formatValue: ValueFormatter,
  options: PanelOptions,
  cartSeries: EChartSingleValueCartesianSeries[],
  overlayAxes: CartesianYAxes | undefined
) => {
  const series: BinnedHeatmapSeries[] = [];
  series.push(
    getBinnedHeatmapSeries(heatmap, { theme, timeZone: ctx.timeZone, formatValue }, 0, options.zLevel?.series)
  );
  cartSeries.forEach((cartesian, i) => {
    series.push({ ...cartesian, yAxisIndex: (overlayAxes?.seriesYAxisIndex[i] ?? 0) + 1 });
  });
  return series;
};

/**
 * Split the panel's frames into the heatmap cell layer and an optional cartesian
 * overlay. The split is driven entirely by the per-field override: an overlay
 * frame is drawn on top of the cells, while every other frame feeds the heatmap
 * layer.
 */
function splitFrames(ctx: ChartContext) {
  const overlayFrames = getOverlayFrames(ctx);
  const heatmapSourceFrames = ctx.frames.filter((frame) => !frameHasCartesianOverride(frame));

  // returns null when there are no frames, otherwise throw
  const heatmap = frameToBinnedHeatmap(heatmapSourceFrames, ctx.frames);

  return { overlayFrames, heatmap };
}
