import { createTheme, type DataFrame, FieldType, toDataFrame } from '@grafana/data';
import { categoryCartesianToEChartsOption } from 'lib/echarts/converters/categoryCartesian';

const theme = createTheme();

const tableFrame = (): DataFrame =>
  toDataFrame({
    fields: [
      { name: 'category', type: FieldType.string, values: ['Sales', 'Admin', 'IT'] },
      { name: 'Budget', type: FieldType.number, values: [43, 10, 30], config: { displayName: 'Budget' } },
      { name: 'Actual', type: FieldType.number, values: [50, 14, 28], config: { displayName: 'Actual' } },
    ],
  });

describe('categoryCartesianToEChartsOption', () => {
  it('projects each numeric field onto the shared category axis', () => {
    const result = categoryCartesianToEChartsOption([tableFrame()], 'bar', theme);

    expect(result).not.toBeNull();
    expect(result!.categories).toEqual(['Sales', 'Admin', 'IT']);
    expect(result!.series).toMatchObject([
      { name: 'Budget', type: 'bar', data: [43, 10, 30] },
      { name: 'Actual', type: 'bar', data: [50, 14, 28] },
    ]);
  });

  it('applies the panel-level series type to every series', () => {
    const result = categoryCartesianToEChartsOption([tableFrame()], 'line', theme);

    expect(result!.series.every((s) => s.type === 'line')).toBe(true);
  });

  it('resolves a color for each series (item and line style)', () => {
    const result = categoryCartesianToEChartsOption([tableFrame()], 'bar', theme);

    for (const s of result!.series) {
      expect(s.itemStyle.color).toEqual(expect.any(String));
      expect(s.lineStyle.color).toBe(s.itemStyle.color);
    }
  });

  it('preserves zero but maps null/undefined to gaps', () => {
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

    const result = categoryCartesianToEChartsOption([frame], 'bar', theme);

    expect(result!.series[0].data).toEqual([0, null, 30, null]);
  });

  it('falls back to row indices when there is no string field', () => {
    const frame = toDataFrame({
      fields: [{ name: 'v', type: FieldType.number, values: [1, 2], config: { displayName: 'v' } }],
    });

    const result = categoryCartesianToEChartsOption([frame], 'bar', theme);

    expect(result!.categories).toEqual(['0', '1']);
  });

  describe('stacking', () => {
    it('adds a shared stack group to bar series when stacking is on', () => {
      const result = categoryCartesianToEChartsOption([tableFrame()], 'bar', theme, true);

      expect(result!.series.every((s) => s.stack === 'total')).toBe(true);
    });

    it('does not stack bar series when stacking is off', () => {
      const result = categoryCartesianToEChartsOption([tableFrame()], 'bar', theme, false);

      expect(result!.series.every((s) => s.stack === undefined)).toBe(true);
    });

    it('never stacks non-bar series even when stacking is on', () => {
      const result = categoryCartesianToEChartsOption([tableFrame()], 'line', theme, true);

      expect(result!.series.every((s) => s.stack === undefined)).toBe(true);
    });
  });

  describe('bar rendering options', () => {
    it('applies panel-level bar props to every bar series', () => {
      const result = categoryCartesianToEChartsOption([tableFrame()], 'bar', theme, false, {
        width: 12,
        borderRadius: 4,
      });

      expect(result!.series.every((s) => s.barWidth === 12)).toBe(true);
      expect(result!.series.every((s) => s.itemStyle.borderRadius === 4)).toBe(true);
    });

    it('honors a per-field bar override on the category path', () => {
      const frame = toDataFrame({
        fields: [
          { name: 'category', type: FieldType.string, values: ['a', 'b'] },
          { name: 'Budget', type: FieldType.number, values: [1, 2], config: { custom: { bar: { width: 30 } } } },
          { name: 'Actual', type: FieldType.number, values: [3, 4] },
        ],
      });

      const result = categoryCartesianToEChartsOption([frame], 'bar', theme, false, { width: 12 });

      expect(result!.series[0]).toMatchObject({ name: 'Budget', barWidth: 30 });
      expect(result!.series[1]).toMatchObject({ name: 'Actual', barWidth: 12 });
    });

    it('does not apply bar props when the panel type is not bar', () => {
      const result = categoryCartesianToEChartsOption([tableFrame()], 'line', theme, false, { width: 12 });

      expect(result!.series.every((s) => s.barWidth === undefined)).toBe(true);
    });
  });

  it('returns null when no frame has a numeric field', () => {
    const frame = toDataFrame({
      fields: [{ name: 'category', type: FieldType.string, values: ['a', 'b'] }],
    });

    expect(categoryCartesianToEChartsOption([frame], 'bar', theme)).toBeNull();
  });
});
