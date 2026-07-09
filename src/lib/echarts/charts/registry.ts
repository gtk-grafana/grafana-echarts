import {
  cartesianTimeSeriesTypes,
  heatmapSeriesTypes,
  multiValueSeriesTypes,
  pieSeriesTypes,
  radarSeriesTypes,
} from 'editor/constants';
import { type SeriesType } from 'editor/types';
import { isMultiValueSeriesType, isCartesianSingleValueSeriesType } from './narrowing';
import { cartesianChartModule } from './cartesian';
import { heatmapChartModule } from './heatmap';
import { pieChartModule } from './pie';
import { radarChartModule } from './radar';
import { type ChartModule } from './types';

const pieModule = pieChartModule;
const radarModule = radarChartModule;

/** All series types with a registered chart module. */
export const supportedChartSeriesTypes: SeriesType[] = [
  ...cartesianTimeSeriesTypes,
  ...multiValueSeriesTypes,
  ...heatmapSeriesTypes,
  ...radarSeriesTypes,
  ...pieSeriesTypes,
];

/**
 * Resolve the chart module for the active series type.
 *
 * Each nested panel fixes its own family via `seriesType`, so routing keys off
 * that identity alone: only the heatmap panel (`seriesType === 'heatmap'`) uses
 * the composite heatmap module. Heatmap-tagged frames no longer force any panel
 * into heatmap rendering — that data-driven detection now lives in each panel's
 * Visualization Suggestions supplier, keeping cross-family mixing (heatmap +
 * line) contained to the composite heatmap panel that owns both layers.
 */
export function resolveChartModule(seriesType: SeriesType): ChartModule {
  if (seriesType === 'heatmap') {
    return heatmapChartModule;
  }
  // Single-value and multi-value cartesian render types share the cartesian panel; the module picks the build path from the type.
  if (isCartesianSingleValueSeriesType(seriesType) || isMultiValueSeriesType(seriesType)) {
    return cartesianChartModule;
  }
  if (radarSeriesTypes.includes(seriesType)) {
    return radarModule;
  }
  if (pieSeriesTypes.includes(seriesType)) {
    return pieModule;
  }
  throw new Error(`Cannot resolve chart module, invalid ${seriesType}!`);
}

export { cartesianChartModule, heatmapChartModule, pieChartModule, radarChartModule };
