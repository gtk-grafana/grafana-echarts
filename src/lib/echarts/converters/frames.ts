import { type DataFrame, type Field, FieldType, getFieldDisplayName, type GrafanaTheme2 } from '@grafana/data';
import { type EChartsFieldConfig } from 'editor/types';
import { getSeriesColor } from 'lib/echarts/style';
import { isNumberField, isTimeField } from 'lib/grafana/narrowing';
import { type FieldTypedDataFrame } from 'lib/grafana/types';

/**
 * First frame with at least one numeric field — the categorical chart source frame.
 */
export function findCategoricalFrame(
  series: Array<FieldTypedDataFrame<unknown, EChartsFieldConfig>>
): FieldTypedDataFrame<unknown, EChartsFieldConfig> | undefined {
  return series.find((frame) => frame.fields.some(isNumberField));
}
/**
 * True when any frame carries a genuine time field.
 *
 * This is the data-driven signal that separates the two cartesian modes: time
 * frames render on a `time` x-axis, while Numeric frames without a
 * time field render on a `category` x-axis. It intentionally ignores
 * the numeric-field fallback used by `resolveTimeField`, which treats a numeric
 * column as an X axis for time series and would otherwise mask category data.
 *
 * See https://grafana.com/developers/dataplane/
 */
export function framesHaveTimeField(series: DataFrame[]): boolean {
  return series.some((frame) => frame.fields.some(isTimeField));
}

/**
 * Category labels for a frame: string field row values, or row indices as strings.
 */
export function resolveCategories(frame: DataFrame): string[] {
  const categoryField = frame.fields.find((field) => field.type === FieldType.string);
  return Array.from({ length: frame.length }, (_, row) =>
    categoryField ? String(categoryField.values[row] ?? row) : String(row)
  );
}

/** One numeric field mapped to name, positional values, and color. */
export interface MappedNumericField {
  field: Field<number>;
  name: string;
  color: string;
}

/**
 * Map every numeric field in a frame to display metadata shared by converters and legends.
 */
export function mapNumericFields(
  frame: FieldTypedDataFrame<unknown, EChartsFieldConfig>,
  series: DataFrame[],
  theme: GrafanaTheme2
): MappedNumericField[] {
  return frame.fields
    .filter(isNumberField) // numeric fields only
    .map((field) => ({
      field,
      name: getFieldDisplayName(field, frame, series),
      color: getSeriesColor(field, theme),
    }));
}

export interface TimeSeriesFieldRef {
  frame: DataFrame;
  frameIndex: number;
  field: Field;
  fieldIndex: number;
  timeField: Field<number>;
}

/**
 * Resolve the time (or fallback X) field for a frame, matching timeSeries converter logic.
 */
export function resolveTimeField(frame: DataFrame): Field | undefined {
  let timeField = frame.fields.find(isTimeField);
  if (!timeField) {
    timeField = frame.fields.find(isNumberField);
  }
  return timeField;
}

/**
 * Iterate numeric value fields across all frames that have a usable time/X field.
 * Skips frames with no time or numeric fallback field.
 */
export function forEachTimeSeriesField(series: DataFrame[], callback: (ref: TimeSeriesFieldRef) => void): void {
  // @todo convert to for loop
  series.forEach((frame, frameIndex) => {
    const timeField = resolveTimeField(frame);
    if (!timeField) {
      return;
    }

    // @todo convert to for loop
    frame.fields.forEach((field, fieldIndex) => {
      if (field.type !== FieldType.number || field.name === timeField.name) {
        return;
      }
      callback({ frame, frameIndex, field, fieldIndex, timeField });
    });
  });
}

/**
 * Flatten frames to numeric fields in the same order as `timeSeriesToEChartsOption` emits series.
 */
export function collectTimeSeriesFields(series: DataFrame[]): Field[] {
  const fields: Field[] = [];
  forEachTimeSeriesField(series, ({ field }) => {
    fields.push(field);
  });
  return fields;
}
