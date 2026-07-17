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
 * Resolve the chart module for a concrete series type.
 *
 * Routing keys off the (already-resolved) series type alone: each nested panel
 * fixes its own family, and `'Auto'`/unset values are resolved to a concrete
 * type upstream — scoped to the panel's family — before they reach here (see
 * `resolveSeriesType`/`resolveAutoSeriesType`). Only the heatmap panel
 * (`seriesType === 'heatmap'`) uses the composite heatmap module; heatmap-tagged
 * frames no longer force any other panel into heatmap rendering (that data-driven
 * detection lives in each panel's Visualization Suggestions supplier).
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
