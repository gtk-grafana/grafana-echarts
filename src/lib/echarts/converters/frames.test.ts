import { DataFrame, FieldType } from '@grafana/data';
import {
  collectTimeSeriesFields,
  findCategoricalFrame,
  resolveCategories,
} from 'lib/echarts/converters/frames';

describe('frames utilities', () => {
  const categoricalFrame: DataFrame = {
    length: 2,
    fields: [
      { name: 'label', type: FieldType.string, config: {}, values: ['a', 'b'] },
      { name: 'value', type: FieldType.number, config: {}, values: [1, 2] },
    ],
  };

  it('findCategoricalFrame picks the first frame with a numeric field', () => {
    expect(findCategoricalFrame([categoricalFrame])).toBe(categoricalFrame);
  });

  it('resolveCategories uses string field values', () => {
    expect(resolveCategories(categoricalFrame)).toEqual(['a', 'b']);
  });

  it('collectTimeSeriesFields skips frames without a time field', () => {
    expect(collectTimeSeriesFields([categoricalFrame])).toEqual([]);
  });

  it('collectTimeSeriesFields collects numeric fields from time-series frames', () => {
    const timeFrame: DataFrame = {
      length: 1,
      fields: [
        { name: 'time', type: FieldType.time, config: {}, values: [1000] },
        { name: 'value', type: FieldType.number, config: {}, values: [42] },
      ],
    };
    expect(collectTimeSeriesFields([timeFrame]).map((f) => f.name)).toEqual(['value']);
  });
});
