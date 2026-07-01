import { type SeriesType } from 'editor/types';

export const seriesTypePath = 'seriesType';
export const seriesTypeName = 'Type';
export const seriesTypeDefault: SeriesType = 'line';
/**
 * Cartesian time series types that render on a time/value grid and consume the
 * converter's `[time, value]` output unchanged (one numeric value per point).
 *
 * Other types (e.g. candlestick, boxplot, heatmap) need multi-value data, and
 * non-cartesian types (e.g. pie, gauge, radar) need different data shaping.
 */
export const cartesianTimeSeriesTypes: SeriesType[] = ['line', 'bar', 'scatter', 'effectScatter'];
