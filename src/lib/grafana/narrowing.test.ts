import { type Field, FieldType, toDataFrame } from '@grafana/data';
import { isNumberField, isStringField, isTimeField } from 'lib/grafana/narrowing';

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
