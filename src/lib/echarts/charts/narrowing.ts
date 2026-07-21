import { cartesianTimeSeriesTypes, multiValueSeriesTypes } from 'editor/cartesian';
import {
  categoricalAxisSeriesTypes,
  categoricalOnlySeriesType,
  heatmapSeriesTypes,
  hierarchySeriesTypes,
  supportsTimeAxisSeriesTypes,
} from 'editor/constants';
import { multivariateSeriesTypes } from 'editor/radar';
import {
  type CartesianSingleValueSeriesType,
  type CategoricalAxisSeriesType,
  type CategoricalOnlySeriesType,
  type HeatmapSeriesType,
  type HierarchySeriesType,
  type MultiValueSeriesType,
  type MultivariateSeriesType,
  type SeriesType,
  type SeriesTypeOption,
  type TimeAxisSupportsSeriesType,
} from 'editor/types';

// Categorical charts like pie and radar cannot render a cartesian axis
export function isCategoricalOnlySeriesType(type: SeriesType): type is CategoricalOnlySeriesType {
  return categoricalOnlySeriesType.some((t) => t === type);
}

// Cartesian charts can still render categorical data
export function isCategoricalAxisSeriesType(type: SeriesType): type is CategoricalAxisSeriesType {
  return categoricalAxisSeriesTypes.some((t) => t === type);
}

export function isTimeAxisSupportedForSeriesType(type: SeriesType): type is TimeAxisSupportsSeriesType {
  return supportsTimeAxisSeriesTypes.some((t) => t === type);
}

// Single value cartesian like line, bar, scatter. Accepts the wider
// `SeriesTypeOption` so callers holding a per-field override (which may be the
// `'Auto'` sentinel) can narrow directly; `'Auto'` simply never matches.
export function isCartesianSingleValueSeriesType(type: SeriesTypeOption): type is CartesianSingleValueSeriesType {
  return cartesianTimeSeriesTypes.some((t) => t === type);
}

// Multi-value cartesian like box-plot, candlestick
export function isMultiValueSeriesType(type: SeriesType): type is MultiValueSeriesType {
  return multiValueSeriesTypes.some((t) => t === type);
}

// Heatmap is its own beast
export function isHeatmapSeriesType(type: SeriesType): type is HeatmapSeriesType {
  return heatmapSeriesTypes.some((t) => t === type);
}

// Hierarchy charts like treemap and sunburst render a value-weighted tree
export function isHierarchySeriesType(type: SeriesType): type is HierarchySeriesType {
  return hierarchySeriesTypes.some((t) => t === type);
}

// Multivariate charts (radar today; parallel coordinates on the roadmap) share
// the multivariate family panel and chart module.
export function isMultivariateSeriesType(type: SeriesType): type is MultivariateSeriesType {
  return multivariateSeriesTypes.some((t) => t === type);
}
