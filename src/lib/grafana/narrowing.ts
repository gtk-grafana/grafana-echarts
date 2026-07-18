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

export function isStringField(field: Field): field is Field<string> {
  return field.type === FieldType.string;
}

/**
 * Whether a numeric literal parses from a single field value. Empty strings and
 * nullish values are treated as gaps (not a parse failure), matching how Grafana
 * renders missing points; `NaN`/`Infinity` are rejected. `Number('')` is `0`, so
 * empty strings are excluded explicitly before parsing.
 */
function parsesAsFiniteNumber(value: unknown): boolean {
  if (value == null || value === '') {
    return false;
  }
  return Number.isFinite(typeof value === 'number' ? value : Number(value));
}

/**
 * A `string`-typed field whose values are all numeric (e.g. a value column that
 * arrived as text because the datasource emitted strings). At least one value
 * must parse, and every non-empty value must parse as a finite number, so genuine
 * label fields (including year-like `"2021"` mixed with words) are not misread.
 *
 * Used by the pie's wide/long resolver to coerce numeric-text value fields
 * without a `convertFieldType` transform; kept out of the shared numeric guards
 * so cartesian/radar continue to treat string fields as categories.
 */
export function isNumericStringField(field: Field): field is Field<string> {
  if (!isStringField(field)) {
    return false;
  }
  let sawValue = false;
  for (const value of field.values) {
    if (value == null || value === '') {
      continue;
    }
    if (!parsesAsFiniteNumber(value)) {
      return false;
    }
    sawValue = true;
  }
  return sawValue;
}

/** A field usable as a numeric series: a real number field or a numeric-string field. */
export function isNumericLikeField(field: Field): boolean {
  return isNumberField(field) || isNumericStringField(field);
}

/**
 * Coerce a field's values to `Array<number | null>`, parsing numeric strings and
 * mapping unparseable/empty/nullish entries (and non-finite numbers) to `null`
 * so downstream reducers (`reduceField`) treat them as gaps. Non-numeric-like
 * fields yield an all-`null` array.
 */
export function getNumericValues(field: Field): Array<number | null> {
  return field.values.map((value) => {
    if (!parsesAsFiniteNumber(value)) {
      return null;
    }
    return typeof value === 'number' ? value : Number(value);
  });
}
