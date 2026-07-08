import {
  cartesianTimeSeriesTypes,
  categoricalAxisSeriesTypes,
  heatmapSeriesTypes,
  multiValueCartesianSeriesTypes,
} from 'editor/constants';
import {
  type CartesianMultiValueSeriesType,
  type CartesianSingleValueSeriesType,
  type CategoricalAxisSeriesType,
  type HeatmapSeriesType,
  type SeriesType,
} from 'editor/types';

export function isCategoricalAxisSeriesType(type: SeriesType): type is CategoricalAxisSeriesType {
  return (categoricalAxisSeriesTypes as SeriesType[]).includes(type);
}

export function isCartesianSingleValueSeriesType(type: SeriesType): type is CartesianSingleValueSeriesType {
  return (cartesianTimeSeriesTypes as SeriesType[]).includes(type);
}

export function isCartesianMultiValueSeriesType(type: SeriesType): type is CartesianMultiValueSeriesType {
  return (multiValueCartesianSeriesTypes as SeriesType[]).includes(type);
}

export function isHeatmapSeriesType(type: SeriesType): type is HeatmapSeriesType {
  return (heatmapSeriesTypes as SeriesType[]).includes(type);
}
