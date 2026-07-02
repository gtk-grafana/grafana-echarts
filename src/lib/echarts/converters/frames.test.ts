import { type DataFrame, FieldType } from '@grafana/data';
import {
  collectTimeSeriesFields,
  findCategoricalFrame,
  framesHaveTimeField,
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

  const timeFrame: DataFrame = {
    length: 1,
    fields: [
      { name: 'time', type: FieldType.time, config: {}, values: [1000] },
      { name: 'value', type: FieldType.number, config: {}, values: [42] },
    ],
  };

  it('framesHaveTimeField is true when any frame has a time field', () => {
    expect(framesHaveTimeField([timeFrame])).toBe(true);
    expect(framesHaveTimeField([categoricalFrame, timeFrame])).toBe(true);
  });

  it('framesHaveTimeField is false for Numeric (category) frames and ignores the numeric fallback', () => {
    expect(framesHaveTimeField([categoricalFrame])).toBe(false);
    expect(framesHaveTimeField([])).toBe(false);
  });

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
    expect(collectTimeSeriesFields([timeFrame]).map((f) => f.name)).toEqual(['value']);
  });
});
