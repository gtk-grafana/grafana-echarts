import { DataFrame, FieldType, toDataFrame } from '@grafana/data';
import { frameToCategorical } from 'echarts/converters/categorical';

const tableFrame = (): DataFrame =>
  toDataFrame({
    fields: [
      { name: 'category', type: FieldType.string, values: ['Sales', 'Admin', 'IT'] },
      { name: 'Budget', type: FieldType.number, values: [43, 10, 30], config: { displayName: 'Budget' } },
      { name: 'Actual', type: FieldType.number, values: [50, 14, 28], config: { displayName: 'Actual' } },
    ],
  });

describe('frameToCategorical', () => {
  it('derives categories from the string field and one series per numeric field', () => {
    const result = frameToCategorical([tableFrame()]);

    expect(result).not.toBeNull();
    expect(result!.categories).toEqual(['Sales', 'Admin', 'IT']);
    expect(result!.series).toEqual([
      { name: 'Budget', values: [43, 10, 30] },
      { name: 'Actual', values: [50, 14, 28] },
    ]);
  });

  it('falls back to row indices when there is no string field', () => {
    const frame = toDataFrame({
      fields: [{ name: 'v', type: FieldType.number, values: [1, 2], config: { displayName: 'v' } }],
    });

    const result = frameToCategorical([frame]);

    expect(result!.categories).toEqual(['0', '1']);
    expect(result!.series).toEqual([{ name: 'v', values: [1, 2] }]);
  });

  it('uses the first frame that has a numeric field', () => {
    const noNumeric = toDataFrame({
      fields: [{ name: 'category', type: FieldType.string, values: ['a', 'b'] }],
    });

    const result = frameToCategorical([noNumeric, tableFrame()]);

    expect(result!.categories).toEqual(['Sales', 'Admin', 'IT']);
  });

  it('coerces null/undefined values to null but preserves zero', () => {
    const frame = toDataFrame({
      fields: [
        { name: 'category', type: FieldType.string, values: ['a', 'b', 'c', 'd'] },
        {
          name: 'v',
          type: FieldType.number,
          values: [0, null, 30, undefined as unknown as number],
          config: { displayName: 'v' },
        },
      ],
    });

    const result = frameToCategorical([frame]);

    expect(result!.series).toEqual([{ name: 'v', values: [0, null, 30, null] }]);
  });

  it('returns null for an empty frame list', () => {
    expect(frameToCategorical([])).toBeNull();
  });

  it('returns null when no frame has a numeric field', () => {
    const frame = toDataFrame({
      fields: [{ name: 'category', type: FieldType.string, values: ['a', 'b'] }],
    });

    expect(frameToCategorical([frame])).toBeNull();
  });
});
