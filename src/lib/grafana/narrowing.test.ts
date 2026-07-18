import { type Field, FieldType, toDataFrame } from '@grafana/data';
import {
  getNumericValues,
  isNumberField,
  isNumericLikeField,
  isNumericStringField,
  isStringField,
  isTimeField,
} from 'lib/grafana/narrowing';

const stringField = (values: Array<string | null>): Field =>
  toDataFrame({ fields: [{ name: 'v', type: FieldType.string, values }] }).fields[0];

const numberField = (values: Array<number | null>): Field =>
  toDataFrame({ fields: [{ name: 'v', type: FieldType.number, values }] }).fields[0];

const timeField = (): Field => toDataFrame({ fields: [{ name: 't', type: FieldType.time, values: [1, 2] }] }).fields[0];

describe('base field guards', () => {
  it('narrows number, string, and time fields by type', () => {
    expect(isNumberField(numberField([1]))).toBe(true);
    expect(isNumberField(stringField(['1']))).toBe(false);
    expect(isStringField(stringField(['a']))).toBe(true);
    expect(isTimeField(timeField())).toBe(true);
    expect(isTimeField(numberField([1]))).toBe(false);
  });
});

describe('isNumericStringField', () => {
  it('accepts a string field whose values are all numeric', () => {
    expect(isNumericStringField(stringField(['1', '2', '3']))).toBe(true);
    // Decimals, negatives, and exponent notation all parse.
    expect(isNumericStringField(stringField(['1.5', '-2', '3e2']))).toBe(true);
  });

  it('treats a year-like all-numeric column as numeric (guard level)', () => {
    // The guard is purely value-based; the long resolver still keeps the first
    // string field as the category, so year labels are not consumed as values.
    expect(isNumericStringField(stringField(['2021', '2022', '2023']))).toBe(true);
  });

  it('skips empty/null gaps but requires at least one parseable value', () => {
    expect(isNumericStringField(stringField(['1', '', null]))).toBe(true);
    expect(isNumericStringField(stringField(['', '', null]))).toBe(false);
    expect(isNumericStringField(stringField([]))).toBe(false);
  });

  it('rejects genuine labels and mixed text/number columns', () => {
    expect(isNumericStringField(stringField(['a', 'b']))).toBe(false);
    expect(isNumericStringField(stringField(['2021', 'Q1']))).toBe(false);
    // Thousands separators do not parse as a plain number.
    expect(isNumericStringField(stringField(['1,234', '5,678']))).toBe(false);
  });

  it('is false for non-string fields', () => {
    expect(isNumericStringField(numberField([1, 2]))).toBe(false);
    expect(isNumericStringField(timeField())).toBe(false);
  });
});

describe('isNumericLikeField', () => {
  it('accepts real number fields and numeric-string fields', () => {
    expect(isNumericLikeField(numberField([1, 2]))).toBe(true);
    expect(isNumericLikeField(stringField(['1', '2']))).toBe(true);
  });

  it('rejects label string fields and time fields', () => {
    expect(isNumericLikeField(stringField(['a', 'b']))).toBe(false);
    expect(isNumericLikeField(timeField())).toBe(false);
  });
});

describe('getNumericValues', () => {
  it('parses numeric strings and maps gaps/unparseable entries to null', () => {
    expect(getNumericValues(stringField(['1', '2.5', 'x', '', null]))).toEqual([1, 2.5, null, null, null]);
  });

  it('passes numbers through and nulls out non-finite values', () => {
    expect(getNumericValues(numberField([1, null, 3]))).toEqual([1, null, 3]);
    // NaN cannot be expressed via toDataFrame reliably, so build the field inline.
    const withNaN: Field = { name: 'v', type: FieldType.number, values: [1, NaN, 3], config: {} };
    expect(getNumericValues(withNaN)).toEqual([1, null, 3]);
  });
});
