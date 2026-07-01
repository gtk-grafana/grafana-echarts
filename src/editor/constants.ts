import { DataFrameType, type SelectableValue } from '@grafana/data';
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
/**
 * Series editor options
 */
export const seriesCategoryName = 'Series';
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
export const heatmapSeriesTypes: SeriesType[] = ['heatmap'];
/**
 * Cartesian render types offered by the cartesian family panel. These are the
 * in-family render variants (line/bar/scatter/...) selected per panel; the
 * cross-family "flat" picker that mixed unrelated families is retired in favor
 * of per-panel Visualization Suggestions (see each module's suggestions.ts).
 */
export const cartesianSeriesTypeOptions: Array<SelectableValue<SeriesType>> = cartesianTimeSeriesTypes.map((type) => ({
  value: type,
  label: type,
}));
/**
 * Series types offered as a per-field override (custom field config). Only
 * cartesian types are listed: they compose on the shared time/value grid, so a
 * field can be drawn as a `bar` while others stay `line`. Non-cartesian types
 * (pie/radar) use other coordinate systems and cannot be overlaid, and heatmap
 * is detected from the frame type rather than chosen per field. Same set as the
 * panel-level render types, reused here for the field override.
 */
export const cartesianOverrideOptions: Array<SelectableValue<SeriesType>> = cartesianSeriesTypeOptions;
/**
 * Grafana dataplane frame types that carry a heatmap. A frame tagged with one
 * of these (`frame.meta.type`) is rendered as the custom-series heatmap cell
 * layer rather than as cartesian series. See echarts/converters/heatmap.ts.
 */
export const heatmapFrameTypes: string[] = [DataFrameType.HeatmapRows, DataFrameType.HeatmapCells];
