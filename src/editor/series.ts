import { DataFrame, DataFrameType, FieldType, SelectableValue } from '@grafana/data';
import { EChartsFieldConfig, SeriesType } from 'editor/types';

/**
 * Series editor options
 */
export const seriesCategoryName = 'Series';

/**
 * Series Type - tells echarts how to render each series
 * https://echarts.apache.org/en/option.html#series
 */
export const seriesTypeOptions: Array<SelectableValue<SeriesType>> = [
  { value: 'line', label: 'line',  },
  { value: 'bar', label: 'bar' },
  { value: 'pie', label: 'pie' },
  { value: 'scatter', label: 'scatter' },
  { value: 'effectScatter', label: 'effectScatter' },
  { value: 'radar', label: 'radar' },
  { value: 'tree', label: 'tree' },
  { value: 'treemap', label: 'treemap' },
  { value: 'sunburst', label: 'sunburst' },
  { value: 'boxplot', label: 'boxplot' },
  { value: 'candlestick', label: 'candlestick' },
  { value: 'heatmap', label: 'heatmap' },
  { value: 'map', label: 'map' },
  { value: 'parallel', label: 'parallel' },
  { value: 'lines', label: 'lines' },
  { value: 'graph', label: 'graph' },
  { value: 'sankey', label: 'sankey' },
  { value: 'funnel', label: 'funnel' },
  { value: 'gauge', label: 'gauge' },
  { value: 'pictorialBar', label: 'pictorialBar' },
  { value: 'themeRiver', label: 'themeRiver' },
  { value: 'chord', label: 'chord' },
  { value: 'custom', label: 'custom' },
];

export const seriesTypeDefault: SeriesType = 'line';
export const seriesTypeName = 'Type'
export const seriesTypePath = 'seriesType';

/**
 * Cartesian time series types that render on a time/value grid and consume the
 * converter's `[time, value]` output unchanged (one numeric value per point).
 *
 * Other types (e.g. candlestick, boxplot, heatmap) need multi-value data, and
 * non-cartesian types (e.g. pie, gauge, radar) need different data shaping.
 */
export const cartesianTimeSeriesTypes: SeriesType[] = ['line', 'bar', 'scatter', 'effectScatter'];

/**
 * Whether a frame has at least one numeric value field whose custom field
 * config overrides the series type to a cartesian type (line/bar/scatter).
 *
 * When the panel is forced to `heatmap`, such a frame is drawn as a cartesian
 * overlay on top of the heatmap (e.g. a metric line over the cells) instead of
 * being folded into the heatmap layer. A frame is treated as an overlay if
 * *any* of its value fields is overridden, since a `byFrameRefID` override
 * applies the same series type to every field in the frame.
 */
export function frameHasCartesianOverride(frame: DataFrame): boolean {
  return frame.fields.some((field) => {
    if (field.type !== FieldType.number) {
      return false;
    }
    const override = (field.config.custom as EChartsFieldConfig | undefined)?.seriesType;
    return override != null && cartesianTimeSeriesTypes.includes(override);
  });
}

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
 * Series types offered as a per-field override (custom field config). Only
 * cartesian types are listed: they compose on the shared time/value grid, so a
 * field can be drawn as a `bar` while others stay `line`. Non-cartesian types
 * (pie/radar) use other coordinate systems and cannot be overlaid, and heatmap
 * is detected from the frame type rather than chosen per field.
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
