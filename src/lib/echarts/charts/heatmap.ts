import { type HeatmapSeriesType } from 'editor/types';
import { heatmapLayoutDefault } from 'lib/echarts/options/constants';
import { buildBinnedHeatmapLegendItems, buildBinnedHeatmapOption } from './binnedHeatmap';
import { buildMatrixHeatmapOption } from './matrixHeatmap';
import { DEFAULT_CHART_LEGEND } from 'lib/echarts/options/legend';
import { type ChartContext, type ChartModule, type EChartBinnedHeatmapOption } from './types';

/**
 * The heatmap panel family. The persisted `seriesType: 'heatmap'` routes here
 * (see `resolveChartModule`); the concrete rendering is picked by the
 * `heatmapLayout` panel option:
 * - `binned` (default): dataplane heatmap frames drawn as interval cells on
 *   continuous axes via a custom series (see `buildBinnedHeatmapOption`).
 * - `matrix`: a category × category grid via the native ECharts heatmap series
 *   (see `buildMatrixHeatmapOption`; not yet implemented).
 */
export const heatmapChartModule: ChartModule = {
  legend: DEFAULT_CHART_LEGEND,
  buildLegendItems(ctx, calcs) {
    return buildBinnedHeatmapLegendItems(ctx, calcs);
  },

  buildOption(ctx: ChartContext<HeatmapSeriesType>, base): EChartBinnedHeatmapOption | null {
    const layout = ctx.options.heatmapLayout ?? heatmapLayoutDefault;
    if (layout === 'matrix') {
      return buildMatrixHeatmapOption(ctx, base);
    }
    return buildBinnedHeatmapOption(ctx, base);
  },
};
