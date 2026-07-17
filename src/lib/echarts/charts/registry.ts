import { type DataFrame, getPanelDataSummary, type PanelDataSummary } from '@grafana/data';
import {
  cartesianTimeSeriesTypes,
  heatmapSeriesTypes,
  multiValueSeriesTypes,
  pieSeriesTypes,
  radarSeriesTypes,
} from 'editor/constants';
import { type SeriesType, type SeriesTypeOption } from 'editor/types';
import { isMultiValueSeriesType, isCartesianSingleValueSeriesType } from './narrowing';
import { cartesianChartModule } from './cartesian';
import { fitsCartesian, fitsHeatmap, fitsMultivariate, fitsPartToWhole } from './fitness';
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
 * Resolve a panel-level `'Auto'` (or unset) series type to a concrete one by
 * inspecting the frames, mirroring the per-family Visualization Suggestions via
 * the shared fitness predicates (see `./fitness`).
 *
 * Precedence follows the suggestion scores (heatmap Best > cartesian > pie >
 * radar) and is applied as a fixed order rather than an arg-max, so a frame that
 * fits several families resolves deterministically (e.g. a numeric multi-field
 * frame picks pie over radar). Falls back to `'line'` when nothing fits: this
 * runs before the panel's empty-data guard, so it must never throw.
 */
export function resolveAutoSeriesType(summary: PanelDataSummary): SeriesType {
  if (fitsHeatmap(summary)) {
    return 'heatmap';
  }
  if (fitsCartesian(summary)) {
    return 'line';
  }
  if (fitsPartToWhole(summary)) {
    return 'pie';
  }
  if (fitsMultivariate(summary)) {
    return 'radar';
  }
  return 'line';
}

/**
 * Normalize a series-type selection to a concrete `SeriesType`. Concrete values
 * pass through unchanged; the `'Auto'` sentinel — and a missing value, as on a
 * freshly added panel that never went through a suggestion — is resolved from
 * the frame data via `resolveAutoSeriesType`.
 */
export function resolveSeriesType(seriesType: SeriesTypeOption | undefined, frames: DataFrame[]): SeriesType {
  if (seriesType == null || seriesType === 'Auto') {
    return resolveAutoSeriesType(getPanelDataSummary(frames));
  }
  return seriesType;
}

/**
 * Resolve the chart module for the active series type.
 *
 * Each nested panel fixes its own family via `seriesType`, so routing keys off
 * that identity alone: only the heatmap panel (`seriesType === 'heatmap'`) uses
 * the composite heatmap module. Heatmap-tagged frames no longer force any panel
 * into heatmap rendering — that data-driven detection now lives in each panel's
 * Visualization Suggestions supplier, keeping cross-family mixing (heatmap +
 * line) contained to the composite heatmap panel that owns both layers.
 *
 * A `'Auto'` or unset series type is first resolved from the frames (see
 * `resolveSeriesType`), so a freshly added panel routes to a sensible module
 * instead of throwing.
 */
export function resolveChartModule(seriesType: SeriesTypeOption | undefined, frames: DataFrame[]): ChartModule {
  return routeConcrete(resolveSeriesType(seriesType, frames));
}

/** Route a concrete series type to its chart module. */
function routeConcrete(seriesType: SeriesType): ChartModule {
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
