import { DataFrame, FieldType, toDataFrame } from '@grafana/data';
import { pieToEChartsOption } from 'echarts/converters/pie';

const tableFrame = (): DataFrame =>
  toDataFrame({
    fields: [
      { name: 'category', type: FieldType.string, values: ['Sales', 'Admin', 'IT'] },
      { name: 'Budget', type: FieldType.number, values: [43, 10, 30], config: { displayName: 'Budget' } },
      { name: 'Actual', type: FieldType.number, values: [50, 14, 28], config: { displayName: 'Actual' } },
    ],
  });

describe('pieToEChartsOption', () => {
  it('builds one slice per category from the first numeric field', () => {
    const result = pieToEChartsOption([tableFrame()]);

    expect(result).toEqual([
      { name: 'Sales', value: 43 },
      { name: 'Admin', value: 10 },
      { name: 'IT', value: 30 },
    ]);
  });

  it('ignores additional numeric fields beyond the first', () => {
    const result = pieToEChartsOption([tableFrame()]);

    // 'Actual' values (50, 14, 28) must not appear; only 'Budget' is used.
    expect(result!.map((slice) => slice.value)).toEqual([43, 10, 30]);
  });

  it('falls back to row indices when there is no string field', () => {
    const frame = toDataFrame({
      fields: [{ name: 'v', type: FieldType.number, values: [5, 6], config: { displayName: 'v' } }],
    });

    expect(pieToEChartsOption([frame])).toEqual([
      { name: '0', value: 5 },
      { name: '1', value: 6 },
    ]);
  });

  it('coerces null/undefined to null but preserves zero', () => {
    const frame = toDataFrame({
      fields: [
        { name: 'category', type: FieldType.string, values: ['a', 'b', 'c'] },
        { name: 'v', type: FieldType.number, values: [0, null, undefined as unknown as number], config: { displayName: 'v' } },
      ],
    });

    expect(pieToEChartsOption([frame])).toEqual([
      { name: 'a', value: 0 },
      { name: 'b', value: null },
      { name: 'c', value: null },
    ]);
  });

  it('returns null when there is no usable data', () => {
    expect(pieToEChartsOption([])).toBeNull();

    const noNumeric = toDataFrame({
      fields: [{ name: 'category', type: FieldType.string, values: ['a', 'b'] }],
    });
    expect(pieToEChartsOption([noNumeric])).toBeNull();
  });
});
