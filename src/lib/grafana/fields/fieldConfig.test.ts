import { type Field, FieldType, toDataFrame } from '@grafana/data';
import { getDefaultShortValueFieldConfig } from 'lib/grafana/fields/fieldConfig';

const numericField = (values: Array<number | null>, config: Field['config'] = {}): Field => {
  const frame = toDataFrame({
    fields: [{ name: 'v', type: FieldType.number, values, config }],
  });
  return frame.fields[0];
};

describe('getDefaultShortValueFieldConfig', () => {
  it('defaults the unit to short', () => {
    const field = numericField([1, 2, 3]);
    expect(getDefaultShortValueFieldConfig(field).config.unit).toBe('short');
  });

  it('derives decimals from the value with the most decimal places', () => {
    const field = numericField([1, 2.5, 3]);
    expect(getDefaultShortValueFieldConfig(field).config.decimals).toBe(1);
  });

  it('uses zero decimals for integer values', () => {
    const field = numericField([1, 2, 3]);
    expect(getDefaultShortValueFieldConfig(field).config.decimals).toBe(0);
  });

  it('caps derived decimals at 2', () => {
    const field = numericField([1.23456, 2.5, 3]);
    expect(getDefaultShortValueFieldConfig(field).config.decimals).toBe(2);
  });

  it('does not let a null value inflate the decimal count', () => {
    const field = numericField([null, 1.5, null]);
    expect(getDefaultShortValueFieldConfig(field).config.decimals).toBe(1);
  });

  it('preserves an existing field config over the defaults', () => {
    const field = numericField([1.23456], { unit: 'percent', decimals: 4 });
    const { config } = getDefaultShortValueFieldConfig(field);

    expect(config.unit).toBe('percent');
    expect(config.decimals).toBe(4);
  });
});
