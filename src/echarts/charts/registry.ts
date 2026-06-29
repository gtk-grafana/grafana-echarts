import { DataFrame } from '@grafana/data';
import { isHeatmapFrame } from 'echarts/converters/heatmap';
import {
  cartesianTimeSeriesTypes,
  heatmapSeriesTypes,
  pieSeriesTypes,
  radarSeriesTypes,
} from 'editor/series';
import { SeriesType } from 'editor/types';
import { cartesianChartModule } from './cartesian';
import { heatmapChartModule } from './heatmap';
import { pieChartModule } from './pie';
import { radarChartModule } from './radar';
import { ChartModule } from './types';

const pieModule = pieChartModule;
const radarModule = radarChartModule;

/** All series types with a registered chart module. */
export const supportedChartSeriesTypes: SeriesType[] = [
  ...cartesianTimeSeriesTypes,
  ...heatmapSeriesTypes,
  ...radarSeriesTypes,
  ...pieSeriesTypes,
];

/**
 * Resolve the chart module for the active series type and data frames.
 * Heatmap frames (or forced heatmap type) route to the composite heatmap module.
 */
export function resolveChartModule(seriesType: SeriesType, frames: DataFrame[]): ChartModule | null {
  const forceHeatmap = seriesType === 'heatmap';
  const hasHeatmapFrames = frames.some(isHeatmapFrame);

  if (forceHeatmap || hasHeatmapFrames) {
    return heatmapChartModule;
  }
  if (cartesianTimeSeriesTypes.includes(seriesType)) {
    return cartesianChartModule;
  }
  if (radarSeriesTypes.includes(seriesType)) {
    return radarModule;
  }
  if (pieSeriesTypes.includes(seriesType)) {
    return pieModule;
  }
  return null;
}

export { cartesianChartModule, heatmapChartModule, pieChartModule, radarChartModule };
