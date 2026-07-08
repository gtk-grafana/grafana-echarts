import {
  cartesianTimeSeriesTypes,
  categoricalAxisSeriesTypes,
  categoricalOnlySeriesType,
  heatmapSeriesTypes,
  multiValueCartesianSeriesTypes,
} from 'editor/constants';
import {
  type CartesianMultiValueSeriesType,
  type CartesianSingleValueSeriesType,
  type CategoricalAxisSeriesType,
  type CategoricalOnlySeriesType,
  type HeatmapSeriesType,
  type SeriesType,
} from 'editor/types';

// Categorical charts like pie and radar cannot render a cartesian axis
export function isCategoricalOnlySeriesType(type: SeriesType): type is CategoricalOnlySeriesType {
  return (categoricalOnlySeriesType as SeriesType[]).includes(type);
}

// Cartesian charts can still render categorical data
export function isCategoricalAxisSeriesType(type: SeriesType): type is CategoricalAxisSeriesType {
  return (categoricalAxisSeriesTypes as SeriesType[]).includes(type);
}

// Single value cartesian like line, bar, scatter
export function isCartesianSingleValueSeriesType(type: SeriesType): type is CartesianSingleValueSeriesType {
  return (cartesianTimeSeriesTypes as SeriesType[]).includes(type);
}

// Multi-value cartesian like box-plot, candlestick
export function isCartesianMultiValueSeriesType(type: SeriesType): type is CartesianMultiValueSeriesType {
  return (multiValueCartesianSeriesTypes as SeriesType[]).includes(type);
}

// Heatmap is its own beast
export function isHeatmapSeriesType(type: SeriesType): type is HeatmapSeriesType {
  return (heatmapSeriesTypes as SeriesType[]).includes(type);
}
