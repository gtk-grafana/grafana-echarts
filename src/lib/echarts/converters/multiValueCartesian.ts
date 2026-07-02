import { type DataFrame, type Field, FieldType, type GrafanaTheme2 } from '@grafana/data';
import { findCategoricalFrame, resolveCategories } from 'lib/echarts/converters/frames';
import { getSeriesColor } from 'lib/echarts/style';
import { type SeriesType } from 'editor/types';

/**
 * Multi-value cartesian render types (Group 3): each x position carries several
 * aligned numeric dimensions rather than the single `y` of line/bar.
 */
export type MultiValueChartType = Extract<SeriesType, 'candlestick' | 'boxplot'>;

/**
 * One ECharts multi-value cartesian series drawn against a shared x-axis.
 *
 * Unlike the time-series shape (`[time, value]` tuples) or the single-value
 * category shape (plain y-values), each `data` item is a fixed-length array of
 * dimensions aligned to `categories[i]` by index (`null` renders a gap):
 * - candlestick: `[open, close, low, high]`
 *   (see https://echarts.apache.org/en/option.html#series-candlestick.data)
 * - boxplot: `[min, Q1, median, Q3, max]`
 *   (see https://echarts.apache.org/en/option.html#series-boxplot.data)
 */
export interface MultiValueCartesianSeries {
  name: string;
  type: MultiValueChartType;
  data: Array<Array<number | null>>;
  itemStyle: { color: string };
}

/**
 * The two data-dependent pieces a multi-value cartesian chart needs: the shared
 * `categories` (x-axis labels) and the multi-dimension `series`. The caller
 * merges these into a base cartesian option with `xAxis.type: 'category'`.
 */
export interface MultiValueCartesianData {
  categories: string[];
  series: MultiValueCartesianSeries[];
}

/** ECharts candlestick data order: `[open, close, low, high]`. */
const CANDLESTICK_FIELDS = ['open', 'high', 'low', 'close'] as const;
/** ECharts boxplot data order (also the plugin's positional convention). */
const BOXPLOT_FIELDS = ['min', 'q1', 'median', 'q3', 'max'] as const;

/** First numeric field whose name matches `name` (case-insensitive). */
function findNumericFieldByName(frame: DataFrame, name: string): Field | undefined {
  return frame.fields.find((field) => field.type === FieldType.number && field.name.toLowerCase() === name);
}

/** Positional dimension array for one row: `field.values[row] ?? null` per field. */
function rowValues(fields: Field[], row: number): Array<number | null> {
  return fields.map((field) => field.values[row] ?? null);
}

/**
 * X-axis labels for a multi-value frame.
 *
 * A candlestick frame is structurally a wide time series, so a time field (when
 * present) labels each item by its timestamp. Timezone-aware formatting is a
 * render-step concern; a stable ISO label keeps the category axis deterministic.
 * Otherwise this falls back to the shared string/row-index categories.
 */
function resolveMultiValueCategories(frame: DataFrame): string[] {
  const timeField = frame.fields.find((field) => field.type === FieldType.time);
  if (!timeField) {
    return resolveCategories(frame);
  }

  return Array.from({ length: frame.length }, (_, row) => {
    const value = timeField.values[row];
    return typeof value === 'number' ? new Date(value).toISOString() : String(value ?? row);
  });
}

/** Frame display name for the single multi-value series, or a type fallback. */
function seriesName(frame: DataFrame, fallback: string): string {
  return frame.name?.trim() ? frame.name : fallback;
}

/**
 * Candlestick series from OHLC fields resolved by name convention
 * (`open`/`high`/`low`/`close`, case-insensitive). Extra fields (volume, moving
 * averages) are ignored here. Returns `null` when any OHLC field is missing.
 *
 * See https://grafana.com/docs/grafana/latest/panels-visualizations/visualizations/candlestick/
 */
function buildCandlestick(frame: DataFrame, theme: GrafanaTheme2): MultiValueCartesianSeries | null {
  const [open, high, low, close] = CANDLESTICK_FIELDS.map((name) => findNumericFieldByName(frame, name));
  if (!open || !high || !low || !close) {
    return null;
  }

  return {
    name: seriesName(frame, 'OHLC'),
    type: 'candlestick',
    data: Array.from({ length: frame.length }, (_, row) => rowValues([open, close, low, high], row)),
    // Bullish/bearish (`color`/`color0`) styling is a render-step concern; this
    // single color is a fallback derived from the close field.
    itemStyle: { color: getSeriesColor(close, theme) },
  };
}

/**
 * Boxplot series from five aligned numeric fields. Boxplot has no Grafana-native
 * field convention, so fields are resolved by this plugin's name convention
 * (`min`/`q1`/`median`/`q3`/`max`, case-insensitive) and otherwise fall back to
 * the first five numeric fields in order. Returns `null` with fewer than five.
 */
function buildBoxplot(frame: DataFrame, theme: GrafanaTheme2): MultiValueCartesianSeries | null {
  const numericFields = frame.fields.filter((field) => field.type === FieldType.number);
  const namedFields = BOXPLOT_FIELDS.map((name) => findNumericFieldByName(frame, name));
  const fields = namedFields.every((field): field is Field => field !== undefined)
    ? namedFields
    : numericFields.slice(0, BOXPLOT_FIELDS.length);

  if (fields.length < BOXPLOT_FIELDS.length) {
    return null;
  }

  return {
    name: seriesName(frame, 'Boxplot'),
    type: 'boxplot',
    data: Array.from({ length: frame.length }, (_, row) => rowValues(fields, row)),
    // Colored from the median field for a representative series color.
    itemStyle: { color: getSeriesColor(fields[2], theme) },
  };
}

/**
 * Convert Grafana frames into an ECharts multi-value cartesian chart (Group 3:
 * candlestick / boxplot).
 *
 * Each x position carries multiple aligned numeric dimensions instead of the
 * single value of line/bar. Only the first frame with a numeric field is used
 * (single-frame limitation shared with the categorical model), and the render
 * type (`chartType`) selects both the field mapping and the ECharts series type.
 *
 * Returns `null` when no usable multi-value data can be derived, so callers can
 * fall back to a no-data view.
 */
export function multiValueCartesianToEChartsOption(
  series: DataFrame[],
  chartType: MultiValueChartType,
  theme: GrafanaTheme2
): MultiValueCartesianData | null {
  const frame = findCategoricalFrame(series);
  if (!frame) {
    return null;
  }

  const built = chartType === 'candlestick' ? buildCandlestick(frame, theme) : buildBoxplot(frame, theme);
  if (!built) {
    return null;
  }

  return { categories: resolveMultiValueCategories(frame), series: [built] };
}
