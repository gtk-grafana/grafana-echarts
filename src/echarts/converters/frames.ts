import {
  DataFrame,
  Field,
  FieldType,
  getFieldDisplayName,
  GrafanaTheme2,
} from '@grafana/data';
import { getSeriesColor } from 'echarts/style';

/**
 * First frame with at least one numeric field — the categorical chart source frame.
 */
export function findCategoricalFrame(series: DataFrame[]): DataFrame | undefined {
  return series.find((frame) => frame.fields.some((field) => field.type === FieldType.number));
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
  field: Field;
  name: string;
  color: string;
}

/**
 * Map every numeric field in a frame to display metadata shared by converters and legends.
 */
export function mapNumericFields(
  frame: DataFrame,
  series: DataFrame[],
  theme: GrafanaTheme2
): MappedNumericField[] {
  return frame.fields
    .filter((field) => field.type === FieldType.number)
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
  timeField: Field;
}

/**
 * Resolve the time (or fallback X) field for a frame, matching timeSeries converter logic.
 */
export function resolveTimeField(frame: DataFrame): Field | undefined {
  let timeField = frame.fields.find((field) => field.type === FieldType.time);
  if (!timeField) {
    timeField = frame.fields.find((field) => field.type === FieldType.number);
  }
  return timeField;
}

/**
 * Iterate numeric value fields across all frames that have a usable time/X field.
 * Skips frames with no time or numeric fallback field.
 */
export function forEachTimeSeriesField(
  series: DataFrame[],
  callback: (ref: TimeSeriesFieldRef) => void
): void {
  series.forEach((frame, frameIndex) => {
    const timeField = resolveTimeField(frame);
    if (!timeField) {
      return;
    }

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
