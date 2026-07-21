import { cartesianTimeSeriesTypes, multiValueSeriesTypes } from 'editor/cartesian';
import { heatmapSeriesTypes, hierarchySeriesTypes } from 'editor/constants';
import { pieSeriesTypes } from 'editor/pie';
import { multivariateSeriesTypes } from 'editor/radar';
import { type SeriesType } from 'editor/types';
import {
  isCartesianSingleValueSeriesType,
  isHierarchySeriesType,
  isMultiValueSeriesType,
  isMultivariateSeriesType,
} from './narrowing';
import { cartesianChartModule } from './cartesian';
import { heatmapChartModule } from './heatmap';
import { hierarchyChartModule } from './hierarchy';
import { multivariateChartModule, radarChartModule } from './multivariate';
import { pieChartModule } from './pie';
import { type ChartModule } from './types';

const pieModule = pieChartModule;

/** All series types with a registered chart module. */
export const supportedChartSeriesTypes: SeriesType[] = [
  ...cartesianTimeSeriesTypes,
  ...multiValueSeriesTypes,
  ...heatmapSeriesTypes,
  ...multivariateSeriesTypes,
  ...pieSeriesTypes,
  ...hierarchySeriesTypes,
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
  if (isMultivariateSeriesType(seriesType)) {
    return multivariateChartModule;
  }
  if (pieSeriesTypes.includes(seriesType)) {
    return pieModule;
  }
  // Treemap and sunburst share the hierarchy module; the module picks the render
  // variant from the type.
  if (isHierarchySeriesType(seriesType)) {
    return hierarchyChartModule;
  }
  throw new Error(`Cannot resolve chart module, invalid ${seriesType}!`);
}

export {
  cartesianChartModule,
  heatmapChartModule,
  hierarchyChartModule,
  multivariateChartModule,
  pieChartModule,
  radarChartModule,
};
