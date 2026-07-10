import { type Field, FieldType } from '@grafana/data';

/**
 * Type guard narrowing a field to a numeric time field.
 *
 * Grafana's data plane specifies time values as epoch milliseconds (numbers),
 * so a `time`-typed field is safely a `Field<number>`.
 * See https://grafana.com/developers/dataplane/timeseries/
 */
export function isTimeField(field: Field): field is Field<number> {
  return field.type === FieldType.time;
}

export function isNumberField(field: Field): field is Field<number> {
  return field.type === FieldType.number;
}
