import {
  cartesianTimeSeriesTypes,
  categoricalAxisSeriesTypes,
  categoricalOnlySeriesType,
  heatmapSeriesTypes,
  multiValueSeriesTypes,
  supportsTimeAxisSeriesTypes,
} from 'editor/constants';
import {
  type CartesianSingleValueSeriesType,
  type CategoricalAxisSeriesType,
  type CategoricalOnlySeriesType,
  type HeatmapSeriesType,
  type MultiValueSeriesType,
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
