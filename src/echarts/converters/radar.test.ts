import { DataFrame, FieldType, toDataFrame } from '@grafana/data';
import { radarToEChartsOption } from 'echarts/converters/radar';

const tableFrame = (): DataFrame =>
  toDataFrame({
    fields: [
      { name: 'category', type: FieldType.string, values: ['Sales', 'Admin', 'IT'] },
      { name: 'Budget', type: FieldType.number, values: [43, 10, 30], config: { displayName: 'Budget' } },
      { name: 'Actual', type: FieldType.number, values: [50, 14, 28], config: { displayName: 'Actual' } },
    ],
  });

describe('radarToEChartsOption', () => {
  describe('rows = indicators, numeric fields = polygons', () => {
    it('maps string field rows to indicators and each numeric field to a polygon', () => {
      const result = radarToEChartsOption([tableFrame()]);

      expect(result).not.toBeNull();
      expect(result!.indicator.map((i) => i.name)).toEqual(['Sales', 'Admin', 'IT']);

      expect(result!.data).toEqual([
        { name: 'Budget', value: [43, 10, 30] },
        { name: 'Actual', value: [50, 14, 28] },
      ]);
    });

    it('computes per-indicator max as the largest polygon value on each axis', () => {
      const result = radarToEChartsOption([tableFrame()]);

      // Sales: max(43, 50) = 50; Admin: max(10, 14) = 14; IT: max(30, 28) = 30
      expect(result!.indicator).toEqual([
        { name: 'Sales', max: 50 },
        { name: 'Admin', max: 14 },
        { name: 'IT', max: 30 },
      ]);
    });
  });

  describe('fallbacks', () => {
    it('uses row indices as indicator names when no string field exists', () => {
      const frame = toDataFrame({
        fields: [{ name: 'Budget', type: FieldType.number, values: [1, 2], config: { displayName: 'Budget' } }],
      });

      const result = radarToEChartsOption([frame]);

      expect(result!.indicator.map((i) => i.name)).toEqual(['0', '1']);
      expect(result!.data).toEqual([{ name: 'Budget', value: [1, 2] }]);
    });

    it('uses the first frame that has a numeric field', () => {
      const noNumeric = toDataFrame({
        fields: [{ name: 'category', type: FieldType.string, values: ['a', 'b'] }],
      });

      const result = radarToEChartsOption([noNumeric, tableFrame()]);

      expect(result!.indicator.map((i) => i.name)).toEqual(['Sales', 'Admin', 'IT']);
    });
  });

  describe('value coercion', () => {
    it('coerces null/undefined values to null but preserves zero, and omits max when an axis has no data', () => {
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

      const result = radarToEChartsOption([frame]);

      expect(result!.data).toEqual([{ name: 'v', value: [0, null, 30, null] }]);
      expect(result!.indicator).toEqual([
        { name: 'a', max: 0 },
        { name: 'b' },
        { name: 'c', max: 30 },
        { name: 'd' },
      ]);
    });
  });

  describe('no usable data', () => {
    it('returns null for an empty frame list', () => {
      expect(radarToEChartsOption([])).toBeNull();
    });

    it('returns null when no frame has a numeric field', () => {
      const frame = toDataFrame({
        fields: [{ name: 'category', type: FieldType.string, values: ['a', 'b'] }],
      });

      expect(radarToEChartsOption([frame])).toBeNull();
    });
  });
});
