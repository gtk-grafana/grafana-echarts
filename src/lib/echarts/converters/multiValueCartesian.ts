import { type DataFrame, type Field, FieldType, type GrafanaTheme2, type TimeRange } from '@grafana/data';
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
 * Row indices to render, constrained to the dashboard time range.
 *
 * The multi-value chart draws on a category x-axis (one category per row), so it
 * cannot pin its extent to the time range the way a `time` axis does. Instead,
 * when the frame has a time field we drop rows outside `[from, to]` so the panel
 * responds to time-range changes and stays aligned with the dashboard window
 * (matching Grafana's native candlestick). Frames without a time field (e.g. a
 * categorical boxplot) keep every row.
 */
function resolveRowIndices(frame: DataFrame, timeRange?: TimeRange): number[] {
  const allRows = Array.from({ length: frame.length }, (_, row) => row);
  const timeField = frame.fields.find((field) => field.type === FieldType.time);
  if (!timeField || !timeRange) {
    return allRows;
  }

  const from = timeRange.from.valueOf();
  const to = timeRange.to.valueOf();
  return allRows.filter((row) => {
    const value = timeField.values[row];
    return typeof value === 'number' && value >= from && value <= to;
  });
}

/**
 * X-axis labels for a multi-value frame, one per rendered row.
 *
 * A candlestick frame is structurally a wide time series, so a time field (when
 * present) labels each item by its timestamp. Timezone-aware formatting is a
 * render-step concern; a stable ISO label keeps the category axis deterministic.
 * Otherwise this falls back to the shared string/row-index categories.
 */
function resolveMultiValueCategories(frame: DataFrame, rows: number[]): string[] {
  const timeField = frame.fields.find((field) => field.type === FieldType.time);
  if (!timeField) {
    const categories = resolveCategories(frame);
    return rows.map((row) => categories[row]);
  }

  return rows.map((row) => {
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
function buildCandlestick(frame: DataFrame, theme: GrafanaTheme2, rows: number[]): MultiValueCartesianSeries | null {
  const [open, high, low, close] = CANDLESTICK_FIELDS.map((name) => findNumericFieldByName(frame, name));
  if (!open || !high || !low || !close) {
    return null;
  }

  return {
    name: seriesName(frame, 'OHLC'),
    type: 'candlestick',
    data: rows.map((row) => rowValues([open, close, low, high], row)),
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
function buildBoxplot(frame: DataFrame, theme: GrafanaTheme2, rows: number[]): MultiValueCartesianSeries | null {
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
    data: rows.map((row) => rowValues(fields, row)),
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
 * When `timeRange` is supplied and the frame has a time field, rows outside the
 * range are dropped so the panel tracks the dashboard time window.
 *
 * Returns `null` when no usable multi-value data can be derived, so callers can
 * fall back to a no-data view.
 */
export function multiValueCartesianToEChartsOption(
  series: DataFrame[],
  chartType: MultiValueChartType,
  theme: GrafanaTheme2,
  timeRange?: TimeRange
): MultiValueCartesianData | null {
  const frame = findCategoricalFrame(series);
  if (!frame) {
    return null;
  }

  // Time-based frames are constrained to the dashboard range; categorical frames
  // keep every row (see resolveRowIndices).
  const rows = resolveRowIndices(frame, timeRange);

  const built =
    chartType === 'candlestick' ? buildCandlestick(frame, theme, rows) : buildBoxplot(frame, theme, rows);
  if (!built) {
    return null;
  }

  return { categories: resolveMultiValueCategories(frame, rows), series: [built] };
}
