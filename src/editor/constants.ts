import { DataFrameType, type SelectableValue } from '@grafana/data';
import {
  type CartesianSingleValueSeriesType,
  type CategoricalAxisSeriesType,
  type CategoricalOnlySeriesType,
  type HeatmapSeriesType,
  type MultiValueSeriesType,
  type SeriesType,
  type TimeAxisSupportsSeriesType,
} from 'editor/types';

export const seriesTypePath = 'seriesType';
export const seriesTypeName = 'Type';
export const seriesTypeDefault: SeriesType = 'line';
/**
 * Stack series option: panel option path and per-field custom config key share
 * the same name. Only meaningful for `bar` series.
 */
export const stackSeriesPath = 'stackSeries';
export const stackSeriesName = 'Stack series';
/**
 * Shared ECharts `stack` group id. Series that share the same `stack` string are
 * stacked together, so all stacked bar series use this single group.
 * https://echarts.apache.org/en/option.html#series-bar.stack
 */
export const STACK_GROUP_ID = 'total';

export const categoricalOnlySeriesType: CategoricalOnlySeriesType[] = ['pie', 'radar'];

/**
 * Series types that support a categorical axis
 */
export const categoricalAxisSeriesTypes: CategoricalAxisSeriesType[] = [
  'line',
  'bar',
  'scatter',
  'effectScatter',
  'boxplot',
];

/**
 * Series types that support a time axis
 */
export const supportsTimeAxisSeriesTypes: TimeAxisSupportsSeriesType[] = [
  'line',
  'bar',
  'scatter',
  'effectScatter',
  'candlestick',
  'heatmap',
  'boxplot',
];
/**
 * Cartesian time series types that render on a time/value grid and consume the
 * converter's `[time, value]` output unchanged (one numeric value per point).
 *
 * Other types (e.g. candlestick, boxplot, heatmap) need multi-value data, and
 * non-cartesian types (e.g. pie, gauge, radar) need different data shaping.
 */
export const cartesianTimeSeriesTypes: CartesianSingleValueSeriesType[] = ['line', 'bar', 'scatter', 'effectScatter'];
/**
 * Multi-value cartesian types (Group 3): each x position carries several aligned
 * numeric dimensions (candlestick OHLC, boxplot five-number summary) rather than
 * the single value of line/bar. They render on a category axis via the
 * multi-value converter (see echarts/converters/multiValueCartesian.ts) and,
 * unlike the time series types, are not offered as per-field overrides.
 */
export const multiValueSeriesTypes: MultiValueSeriesType[] = ['candlestick', 'boxplot'];
/**
 * Series editor options
 */
export const seriesCategoryName = 'Series';
/**
 * Editor category grouping the heatmap color scale (ECharts `visualMap`)
 * options. Kept distinct from the Grafana DOM "Legend" category, which only
 * governs the cartesian overlay series.
 */
export const heatmapLegendCategoryName = 'Heatmap legend';
/**
 * Radar types, which use a radar coordinate system (indicators + polygons)
 * rather than the cartesian time/value grid. See echarts/converters/radar.ts.
 */
export const radarSeriesTypes: SeriesType[] = ['radar'];
/**
 * Pie (and pie-like) types built from the categorical model: each category is a
 * slice valued by the first numeric field. See echarts/converters/pie.ts.
 */
export const pieSeriesTypes: SeriesType[] = ['pie'];
/**
 * Heatmap types. Selecting this panel-level type forces every numeric frame to
 * render as a heatmap (each numeric field becomes a bucket row), even when the
 * frame isn't tagged as a heatmap. Frames already tagged via `meta.type` render
 * as a heatmap regardless of the selected type. See echarts/converters/heatmap.ts.
 */
export const heatmapSeriesTypes: HeatmapSeriesType[] = ['heatmap'];
/**
 * Cartesian render types offered by the cartesian family panel. These are the
 * in-family render variants selected per panel: the single-value time/category
 * types (line/bar/scatter/...) plus the multi-value types (candlestick/boxplot).
 * The cross-family "flat" picker that mixed unrelated families is retired in
 * favor of per-panel Visualization Suggestions (see each module's suggestions.ts).
 */
export const cartesianSeriesTypeOptions: Array<SelectableValue<SeriesType>> = [
  ...cartesianTimeSeriesTypes,
  ...multiValueSeriesTypes,
].map((type) => ({
  value: type,
  label: type,
}));
/**
 * Series types offered as a per-field override (custom field config). Only the
 * single-value cartesian types are listed: they compose on the shared
 * time/value grid, so a field can be drawn as a `bar` while others stay `line`.
 * Multi-value types (candlestick/boxplot) consume several fields at once and
 * cannot be overlaid per field; non-cartesian types (pie/radar) use other
 * coordinate systems; and heatmap is detected from the frame type.
 */
export const cartesianOverrideOptions: Array<SelectableValue<SeriesType>> = cartesianTimeSeriesTypes.map((type) => ({
  value: type,
  label: type,
}));
/**
 * Grafana dataplane frame types that carry a heatmap. A frame tagged with one
 * of these (`frame.meta.type`) is rendered as the custom-series heatmap cell
 * layer rather than as cartesian series. See echarts/converters/heatmap.ts.
 */
export const heatmapFrameTypes: string[] = [DataFrameType.HeatmapRows, DataFrameType.HeatmapCells];
