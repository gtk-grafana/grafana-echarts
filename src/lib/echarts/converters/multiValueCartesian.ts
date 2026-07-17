import { type DataFrame, type Field, type GrafanaTheme2, type TimeRange } from '@grafana/data';
import { type BoxplotSeriesOption, type CandlestickSeriesOption } from 'echarts';
import { type EChartsFieldConfig, type MultiValueSeriesType } from 'editor/types';
import { type ChartContext, type MultiValueCartesianOption } from 'lib/echarts/charts/types';
import { findCategoricalFrame, resolveCategoriesFromFrame } from 'lib/echarts/converters/frames';
import { type CategoryCartesianData } from 'lib/echarts/converters/types';
import { getSeriesColor } from 'lib/echarts/style';
import { filterUnsupportedFields } from 'lib/grafana/filtering';
import { isNumberField, isTimeField } from 'lib/grafana/narrowing';
import { type FieldTypedDataFrame } from 'lib/grafana/types';

// Multi-value cartesian series carry several aligned dimensions per x position
// instead of the single value of line/bar (`null` renders a gap):
// - candlestick: `[open, close, low, high]`
//   (see https://echarts.apache.org/en/option.html#series-candlestick.data)
// - boxplot: `[min, Q1, median, Q3, max]`
//   (see https://echarts.apache.org/en/option.html#series-boxplot.data)

/** ECharts candlestick data order: `[open, close, low, high]`. */
export const CANDLESTICK_FIELDS = ['open', 'high', 'low', 'close'];
/** ECharts boxplot data order (also the plugin's positional convention). */
export const BOXPLOT_FIELDS = ['min', 'q1', 'median', 'q3', 'max'];

/** First numeric field whose name matches `name` (case-insensitive).
 * @todo is this safe?
 */
function findNumericFieldByName(frame: DataFrame, name: string): Field<number> | undefined {
  return frame.fields.find((field) => isNumberField(field) && field.name.toLowerCase() === name);
}

/** Whether `frame` has a numeric field for every `name` (case-insensitive). */
function frameHasNumericFieldsNamed(frame: DataFrame, names: string[]): boolean {
  return names.every((name) => findNumericFieldByName(frame, name) !== undefined);
}

/**
 * The multi-value series type a frame's fields describe, by name convention:
 * OHLC (`open`/`high`/`low`/`close`) → candlestick; five-number summary
 * (`min`/`q1`/`median`/`q3`/`max`) → boxplot. `undefined` when neither is fully
 * present.
 *
 * Detection is intentionally name-based, not "N numeric fields": a plain
 * multi-series frame (e.g. four metric columns) must never be mistaken for a
 * candlestick/boxplot. The names mirror what `buildCandlestick`/`buildBoxplot`
 * map, so detection and rendering stay in agreement. Only the first frame with a
 * numeric field is inspected, matching the converter's single-frame model.
 */
export function resolveMultiValueSeriesType(frames: DataFrame[]): MultiValueSeriesType | undefined {
  const frame = findCategoricalFrame(frames);
  if (!frame) {
    return undefined;
  }
  if (frameHasNumericFieldsNamed(frame, CANDLESTICK_FIELDS)) {
    return 'candlestick';
  }
  if (frameHasNumericFieldsNamed(frame, BOXPLOT_FIELDS)) {
    return 'boxplot';
  }
  return undefined;
}

/** Whether the data is shaped for a multi-value cartesian type (candlestick/boxplot). */
export function framesLookMultiValue(frames: DataFrame[]): boolean {
  return resolveMultiValueSeriesType(frames) !== undefined;
}

/** Positional dimension array for one row: `field.values[row] ?? null` per field. */
function rowValues(fields: Array<Field<number>>, row: number) {
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
function resolveRowIndices(
  frame: FieldTypedDataFrame<number | unknown, EChartsFieldConfig>,
  timeRange?: TimeRange
): number[] {
  const allRows = Array.from({ length: frame.length }, (_, row) => row);
  const timeField = frame.fields.find(isTimeField);
  if (!timeField || !timeRange) {
    return allRows;
  }

  const from = timeRange.from.valueOf();
  const to = timeRange.to.valueOf();
  return allRows.filter((row) => {
    const value = timeField.values[row];
    return value >= from && value <= to;
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
function resolveMultiValueCategories(
  frame: FieldTypedDataFrame<number | string, EChartsFieldConfig>,
  rows: number[]
): string[] {
  const timeField = frame.fields.find(isTimeField);
  if (!timeField) {
    const categories = resolveCategoriesFromFrame(frame);
    return rows.map((row) => categories[row]);
  }

  return rows.map((row) => {
    const value = timeField.values[row];
    return new Date(value).toISOString();
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
function buildCandlestick(
  frame: DataFrame,
  theme: GrafanaTheme2,
  rows: number[],
  zlevel: number | undefined
): CandlestickSeriesOption | null {
  const [open, high, low, close] = CANDLESTICK_FIELDS.map((name) => findNumericFieldByName(frame, name));
  if (!open || !high || !low || !close) {
    return null;
  }

  return {
    name: seriesName(frame, 'OHLC'),
    type: 'candlestick',
    zlevel,
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
function buildBoxplot(
  frame: DataFrame,
  theme: GrafanaTheme2,
  rows: number[],
  zlevel: number | undefined
): BoxplotSeriesOption | null {
  const numericFields = frame.fields.filter(isNumberField);
  const namedFields = BOXPLOT_FIELDS.map((name) => findNumericFieldByName(frame, name));
  const fields = namedFields.every((field) => field !== undefined)
    ? namedFields
    : numericFields.slice(0, BOXPLOT_FIELDS.length);

  if (fields.length < BOXPLOT_FIELDS.length) {
    return null;
  }

  return {
    name: seriesName(frame, 'Boxplot'),
    type: 'boxplot',
    zlevel,
    // ECharts types boxplot values as `number | '-'`, but the plugin uses `null` for gaps
    // we might get runtime values of null for missing values within echarts, but the types are on the input from grafana
    data: rows.map((row) => rowValues(fields, row)),
    // Colored from the median field for a representative series color.
    itemStyle: { color: getSeriesColor(fields[2], theme) },
  };
}

/**
 * Convert Grafana frames into an ECharts multi-value cartesian chart: candlestick / boxplot.
 *
 * Each x position carries multiple aligned numeric dimensions instead of the
 * single value of line/bar. Only the first frame with a numeric field is used
 * (single-frame limitation shared with the categorical model), and the context's
 * `seriesType` selects both the field mapping and the ECharts series type.
 *
 * The frame's `zLevel.series` (from `options`) is applied to the built series so
 * it paints on its own zrender layer, matching the single-value cartesian paths.
 * When the frame has a time field, rows outside the context's `timeRange` are
 * dropped so the panel tracks the dashboard time window.
 *
 * Returns `null` when no usable multi-value data can be derived, so callers can
 * fall back to a no-data view.
 */
export function multiValueCartesianToEChartsOption(
  ctx: ChartContext<MultiValueSeriesType>
): CategoryCartesianData<MultiValueCartesianOption['series']> | null {
  const { frames: unfilteredFrames, theme, seriesType, timeRange, options } = ctx;
  const frames = filterUnsupportedFields(unfilteredFrames);

  const frame = findCategoricalFrame(frames);
  if (!frame) {
    return null;
  }

  // Time-based frames are constrained to the dashboard range; categorical frames
  // keep every row (see resolveRowIndices).
  const rows = resolveRowIndices(frame, timeRange);
  const zlevel = options.zLevel?.series;

  const built =
    seriesType === 'candlestick'
      ? buildCandlestick(frame, theme, rows, zlevel)
      : buildBoxplot(frame, theme, rows, zlevel);
  if (!built) {
    return null;
  }

  return { categories: resolveMultiValueCategories(frame, rows), series: [built] };
}
