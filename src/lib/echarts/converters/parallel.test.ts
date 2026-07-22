import { createTheme, type DataFrame, FieldType, toDataFrame } from '@grafana/data';
import { parallelToEChartsOption } from 'lib/echarts/converters/parallel';

const theme = createTheme();

const tableFrame = (): DataFrame =>
  toDataFrame({
    fields: [
      { name: 'category', type: FieldType.string, values: ['Sales', 'Admin', 'IT'] },
      { name: 'Budget', type: FieldType.number, values: [43, 10, 30], config: { displayName: 'Budget' } },
      { name: 'Actual', type: FieldType.number, values: [50, 14, 28], config: { displayName: 'Actual' } },
    ],
  });

describe('parallelToEChartsOption', () => {
  describe('categories = axes, numeric fields = lines', () => {
    it('maps string field rows to axes and each numeric field to a polyline', () => {
      const result = parallelToEChartsOption([tableFrame()], theme);

      expect(result).not.toBeNull();
      expect(result!.axes.map((axis) => axis.name)).toEqual(['Sales', 'Admin', 'IT']);

      expect(result!.data).toMatchObject([
        { name: 'Budget', value: [43, 10, 30] },
        { name: 'Actual', value: [50, 14, 28] },
      ]);
    });

    it('colors each line from its field color', () => {
      const result = parallelToEChartsOption([tableFrame()], theme);

      expect(result!.data[0].lineStyle.color).toEqual(expect.any(String));
      expect(result!.data[1].lineStyle.color).toEqual(expect.any(String));
    });

    it('omits a per-axis max — each axis carries only a name (auto-scales, unlike radar)', () => {
      const result = parallelToEChartsOption([tableFrame()], theme);

      expect(result!.axes).toEqual([{ name: 'Sales' }, { name: 'Admin' }, { name: 'IT' }]);
    });
  });

  describe('fallbacks', () => {
    it('uses row indices as axis names when no string field exists', () => {
      const frame = toDataFrame({
        fields: [{ name: 'Budget', type: FieldType.number, values: [1, 2], config: { displayName: 'Budget' } }],
      });

      const result = parallelToEChartsOption([frame], theme);

      expect(result!.axes.map((axis) => axis.name)).toEqual(['0', '1']);
      expect(result!.data).toMatchObject([{ name: 'Budget', value: [1, 2] }]);
    });

    it('uses the first frame that has a numeric field', () => {
      const noNumeric = toDataFrame({
        fields: [{ name: 'category', type: FieldType.string, values: ['a', 'b'] }],
      });

      const result = parallelToEChartsOption([noNumeric, tableFrame()], theme);

      expect(result!.axes.map((axis) => axis.name)).toEqual(['Sales', 'Admin', 'IT']);
    });
  });

  describe('no usable data', () => {
    it('returns null for an empty frame list', () => {
      expect(parallelToEChartsOption([], theme)).toBeNull();
    });

    it('returns null when no frame has a numeric field', () => {
      const frame = toDataFrame({
        fields: [{ name: 'category', type: FieldType.string, values: ['a', 'b'] }],
      });

      expect(parallelToEChartsOption([frame], theme)).toBeNull();
    });
  });
});
