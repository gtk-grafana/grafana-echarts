import { getDisplayProcessor } from '@grafana/data';
import { type GridOption } from 'echarts/types/dist/shared';
import { type XAXisOption, type YAXisOption } from 'echarts/types/src/coord/cartesian/AxisModel';
import { type HeatmapSeriesType } from 'editor/types';
import { frameToMatrixHeatmap } from 'lib/echarts/converters/matrixHeatmap';
import { getHeatmapGrid } from 'lib/echarts/grid/grid';
import { cartesianCategoryDefaultOptions, getCartesianAxisStyle, mergeAxisStyle } from 'lib/echarts/options/cartesian';
import { getMatrixHeatmapSeries, getMatrixHeatmapVisualMap } from 'lib/echarts/options/matrixHeatmap';
import { getDefaultShortValueFieldConfig } from 'lib/grafana/fields/fieldConfig';
import { type BaseOptionParts, type ChartContext, type EChartMatrixHeatmapOption } from './types';

/**
 * Matrix heatmap layout: a category x category grid (one tile per ordinal slot),
 * drawn by the native ECharts `heatmap` series on two category axes.
 * https://echarts.apache.org/en/option.html#series-heatmap
 *
 * Consumes the wide/pivot shape (see `frameToMatrixHeatmap`): the first frame's
 * string field supplies the Y (row) categories and each numeric field is an X
 * (column) category. Cells-only: unlike the binned layout there is no cartesian
 * overlay. Returns null when no numeric data is present (empty panel).
 */
export function buildMatrixHeatmapOption(
  ctx: ChartContext<HeatmapSeriesType>,
  { isGrafanaLegend }: BaseOptionParts
): EChartMatrixHeatmapOption | null {
  const { theme, options, timeZone, formatValue } = ctx;
  const data = frameToMatrixHeatmap(ctx.frames, theme);

  // no numeric data: show empty panel
  if (data === null) {
    return null;
  }

  const placement = options.heatmapColorScale?.placement ?? 'right';
  const axisStyle = getCartesianAxisStyle(theme);

  const xAxis = mergeAxisStyle<XAXisOption>(cartesianCategoryDefaultOptions.xAxis, axisStyle, {
    type: 'category',
    data: data.xCategories,
  });
  const yAxis = mergeAxisStyle<YAXisOption>(cartesianCategoryDefaultOptions.yAxis, axisStyle, {
    type: 'category',
    data: data.yCategories,
    zlevel: options.zLevel?.axis,
  });

  const vizLegendOptions = isGrafanaLegend ? undefined : options.legend;
  const grid: GridOption = getHeatmapGrid(placement, vizLegendOptions);

  const formatDisplayValue = getDisplayProcessor({
    timeZone,
    theme,
    field: getDefaultShortValueFieldConfig(data.xField),
  });
  return {
    ...cartesianCategoryDefaultOptions,
    grid,
    xAxis,
    yAxis,
    series: [
      getMatrixHeatmapSeries(
        data,
        { theme, timeZone, formatValue, tooltipSink: ctx.tooltipSink },
        options.zLevel?.series
      ),
    ],
    visualMap: getMatrixHeatmapVisualMap({
      data,
      theme,
      seriesIndex: 0,
      scheme: options.heatmapColorScheme,
      placement,
      formatDisplayValue,
    }),
  };
}
