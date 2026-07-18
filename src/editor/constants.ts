import { DataFrameType, ReducerID, type SelectableValue } from '@grafana/data';
import {
  type CartesianSingleValueSeriesType,
  type CategoricalAxisSeriesType,
  type CategoricalOnlySeriesType,
  type HeatmapSeriesType,
  type HierarchySeriesType,
  type MultiValueSeriesType,
  type PieFormat,
  type SeriesType,
  type SeriesTypeOption,
  type TimeAxisSupportsSeriesType,
} from 'editor/types';

export const seriesTypePath = 'seriesType';
/**
 * Stack series option: panel option path and per-field custom config key share
 * the same name. Only meaningful for `bar` series.
 */
export const stackSeriesPath = 'stackSeries';
export const stackSeriesName = 'Stacking';
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
 * Multi-value cartesian types: each x position carries several aligned
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
 * Pie (and pie-like) types built from the categorical model. See
 * echarts/converters/pie.ts (`resolvePieSlices`) for wide vs long mapping.
 */
export const pieSeriesTypes: SeriesType[] = ['pie'];
/** Editor category grouping the pie (part-to-whole) format + calculation options. */
export const pieCategoryName = 'Pie';
/** Panel option path for the pie wide/long format radio. */
export const pieFormatPath = 'pieFormat';
/** Wide matches Grafana's core pie default (each numeric field is a slice). */
export const PIE_FORMAT_DEFAULT: PieFormat = 'wide';
export const pieFormatOptions: Array<SelectableValue<PieFormat>> = [
  { value: 'wide', label: 'Wide', description: 'Each numeric field is a slice (Grafana default)' },
  {
    value: 'long',
    label: 'Long',
    description: 'First string field is the category; rows sharing a category are aggregated',
  },
];
/**
 * Default slice reducer, passed to `addStandardDataReduceOptions` as the pie's
 * default `reduceOptions.calcs`. Sum suits a part-to-whole (each slice is a share
 * of the total), unlike Grafana stat/gauge which default to `lastNotNull`.
 */
export const PIE_CALC_DEFAULT: string = ReducerID.sum;
/**
 * Heatmap types. Selecting this panel-level type forces every numeric frame to
 * render as a heatmap (each numeric field becomes a bucket row), even when the
 * frame isn't tagged as a heatmap. Frames already tagged via `meta.type` render
 * as a heatmap regardless of the selected type. See echarts/converters/heatmap.ts.
 */
export const heatmapSeriesTypes: HeatmapSeriesType[] = ['heatmap'];
/**
 * Hierarchy types built from a value-weighted tree: treemap (nested rectangles)
 * and sunburst (radial rings). Both consume the same tree model, reconstructed
 * from a flame-graph nested-set frame or a flat categorical frame. Selecting the
 * hierarchy panel picks between these render variants. See
 * echarts/converters/hierarchy.ts.
 */
export const hierarchySeriesTypes: HierarchySeriesType[] = ['treemap', 'sunburst'];
/**
 * Hierarchy render types offered by the hierarchy family panel, selected per
 * panel via the panel-level `seriesType`.
 */
export const hierarchySeriesTypeOptions: Array<SelectableValue<HierarchySeriesType>> = [
  { value: 'treemap', label: 'Treemap' },
  { value: 'sunburst', label: 'Sunburst' },
];
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
export const cartesianOverrideOptions: Array<SelectableValue<SeriesType>> = [
  ...cartesianTimeSeriesTypes,
  ...multiValueSeriesTypes,
].map((type) => ({
  value: type,
  label: type,
}));
/**
 * Per-field override options for the cartesian family, prefixed with the
 * `'Auto'` default. `'Auto'` is not a real series type: it defers to the
 * panel-level series type (see `resolveFieldSeriesType`). Kept separate from
 * `cartesianOverrideOptions` because the heatmap panel reuses the plain list and
 * has no `'Auto'` default.
 */
export const cartesianOverrideOptionsWithAuto: Array<SelectableValue<SeriesTypeOption>> = [
  { value: 'Auto', label: 'Auto' },
  ...cartesianOverrideOptions,
];
/** Multi-value cartesian render types (candlestick/boxplot) as select options. */
export const multiValueSeriesTypeOptions: Array<SelectableValue<SeriesType>> = multiValueSeriesTypes.map((type) => ({
  value: type,
  label: type,
}));
/**
 * Panel-level series type options for the cartesian family: every render type
 * (single- and multi-value) plus the `'Auto'` default. Used as the static option
 * list for the panel-level picker; the picker narrows this to the applicable
 * subset from the data via `getOptions` (see the cartesian module).
 */
export const cartesianSeriesTypeOptionsWithAuto: Array<SelectableValue<SeriesTypeOption>> = [
  { value: 'Auto', label: 'Auto' },
  ...cartesianSeriesTypeOptions,
];
/** Multi-value cartesian options (candlestick/boxplot) with the `'Auto'` default. */
export const multiValueSeriesTypeOptionsWithAuto: Array<SelectableValue<SeriesTypeOption>> = [
  { value: 'Auto', label: 'Auto' },
  ...multiValueSeriesTypeOptions,
];
/**
 * Grafana dataplane frame types that carry a heatmap. A frame tagged with one
 * of these (`frame.meta.type`) is rendered as the custom-series heatmap cell
 * layer rather than as cartesian series. See echarts/converters/heatmap.ts.
 */
export const heatmapFrameTypes: string[] = [DataFrameType.HeatmapRows, DataFrameType.HeatmapCells];

/**
 * Threshold display control (custom field config `thresholdsStyle.mode`). Grafana
 * standard options already provide the threshold *steps* editor; this select
 * chooses how they are drawn (lines and/or filled regions), mirroring core
 * Grafana's time series "Show thresholds" option. The option list itself comes
 * from `@grafana/ui`'s `graphFieldOptions.thresholdsDisplayModes` (which already
 * omits the out-of-scope per-value `Series` mode); see the cartesian module.
 */
export const thresholdsCategoryName = 'Thresholds';
export const thresholdsStyleModePath = 'thresholdsStyle.mode';
export const thresholdsStyleModeName = 'Show thresholds';
