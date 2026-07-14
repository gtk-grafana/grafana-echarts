import { type DataFrame, type Field, FieldType, toDataFrame } from '@grafana/data';
import {
  getDefaultShortValueFieldConfig,
  isFieldHiddenFromViz,
  stripHiddenValueFields,
} from 'lib/grafana/fields/fieldConfig';

const numericField = (values: Array<number | null>, config: Field['config'] = {}): Field => {
  const frame = toDataFrame({
    fields: [{ name: 'v', type: FieldType.number, values, config }],
  });
  return frame.fields[0];
};

const hiddenConfig = { custom: { hideFrom: { viz: true, legend: false, tooltip: false } } };

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

describe('isFieldHiddenFromViz', () => {
  it('is true only when custom.hideFrom.viz is set', () => {
    expect(isFieldHiddenFromViz(numericField([1], hiddenConfig))).toBe(true);
    expect(isFieldHiddenFromViz(numericField([1]))).toBe(false);
    expect(isFieldHiddenFromViz(numericField([1], { custom: { hideFrom: { viz: false } } }))).toBe(false);
  });
});

describe('stripHiddenValueFields', () => {
  const frame = (): DataFrame =>
    toDataFrame({
      fields: [
        { name: 'time', type: FieldType.time, values: [1, 2] },
        { name: 'cpu', type: FieldType.number, values: [10, 20] },
        { name: 'mem', type: FieldType.number, values: [30, 40], config: hiddenConfig },
      ],
    });

  it('removes hidden numeric fields but keeps visible and non-numeric fields', () => {
    const [stripped] = stripHiddenValueFields([frame()]);

    expect(stripped.fields.map((f) => f.name)).toEqual(['time', 'cpu']);
    expect(stripped.length).toBe(2);
  });

  it('does not mutate the input frames', () => {
    const input = [frame()];
    stripHiddenValueFields(input);
    expect(input[0].fields.map((f) => f.name)).toEqual(['time', 'cpu', 'mem']);
  });
});
