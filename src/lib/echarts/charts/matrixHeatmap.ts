import { debug, LOG_LEVELS } from 'development';
import { type HeatmapSeriesType } from 'editor/types';
import { type BaseOptionParts, type ChartContext, type EChartBinnedHeatmapOption } from './types';

/**
 * Matrix heatmap layout: a category × category grid (one tile per ordinal slot),
 * drawn by the native ECharts `heatmap` series.
 * https://echarts.apache.org/en/option.html#series-heatmap
 *
 * @todo not yet implemented. Selecting the "Matrix" layout renders an empty
 * panel until the native `type: 'heatmap'` path (with its own converter) lands.
 * For now it returns null so the panel stays empty rather than crashing.
 */
export function buildMatrixHeatmapOption(
  _ctx: ChartContext<HeatmapSeriesType>,
  _base: BaseOptionParts
): EChartBinnedHeatmapOption | null {
  debug('matrix heatmap layout not yet implemented', LOG_LEVELS.warn);
  return null;
}
