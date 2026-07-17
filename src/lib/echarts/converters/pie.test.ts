import {
  createTheme,
  type DataFrame,
  type FieldConfigSource,
  FieldType,
  type SystemConfigOverrideRule,
  toDataFrame,
} from '@grafana/data';
import { pieToEChartsOption } from 'lib/echarts/converters/pie';

const theme = createTheme();

const fieldConfig: FieldConfigSource = { defaults: {}, overrides: [] };

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
    const result = pieToEChartsOption([tableFrame()], theme, fieldConfig);

    expect(result).toMatchObject([
      { name: 'Sales', value: 43 },
      { name: 'Admin', value: 10 },
      { name: 'IT', value: 30 },
    ]);
  });

  it('colors slices by category from the classic palette', () => {
    const result = pieToEChartsOption([tableFrame()], theme, fieldConfig);

    expect(result![0].itemStyle!.color).toEqual('#73BF69');
    // Adjacent slices get distinct palette colors.
    expect(result![1].itemStyle!.color).toBe('#F2CC0C');
  });

  it('ignores additional numeric fields beyond the first', () => {
    const result = pieToEChartsOption([tableFrame()], theme, fieldConfig);

    // 'Actual' values (50, 14, 28) must not appear; only 'Budget' is used.
    expect(result!.map((slice) => slice.value)).toEqual([43, 10, 30]);
  });

  it('falls back to row indices when there is no string field', () => {
    const frame = toDataFrame({
      fields: [{ name: 'v', type: FieldType.number, values: [5, 6], config: { displayName: 'v' } }],
    });

    expect(pieToEChartsOption([frame], theme, fieldConfig)).toMatchObject([
      { name: '0', value: 5 },
      { name: '1', value: 6 },
    ]);
  });

  it('coerces null/undefined to null but preserves zero', () => {
    const frame = toDataFrame({
      fields: [
        { name: 'category', type: FieldType.string, values: ['a', 'b', 'c'] },
        {
          name: 'v',
          type: FieldType.number,
          values: [0, null, undefined as unknown as number],
          config: { displayName: 'v' },
        },
      ],
    });

    expect(pieToEChartsOption([frame], theme, fieldConfig)).toMatchObject([
      { name: 'a', value: 0 },
      { name: 'b', value: undefined },
      { name: 'c', value: undefined },
    ]);
  });

  it('returns null when there is no usable data', () => {
    expect(pieToEChartsOption([], theme, fieldConfig)).toBeNull();

    const noNumeric = toDataFrame({
      fields: [{ name: 'category', type: FieldType.string, values: ['a', 'b'] }],
    });
    expect(pieToEChartsOption([noNumeric], theme, fieldConfig)).toBeNull();
  });

  it('drops slices hidden via a hideSeriesFrom override, keeping palette colors stable', () => {
    // Isolate: hide all except the kept names (drops 'Admin').
    const hideOverride: SystemConfigOverrideRule = {
      __systemRef: 'hideSeriesFrom',
      matcher: {
        id: 'byNames',
        options: { mode: 'exclude', names: ['Sales', 'IT'], prefix: 'All except:', readOnly: true },
      },
      properties: [{ id: 'custom.hideFrom', value: { viz: true, legend: false, tooltip: true } }],
    };
    const hidden: FieldConfigSource = { defaults: {}, overrides: [hideOverride] };

    const all = pieToEChartsOption([tableFrame()], theme, fieldConfig);
    const result = pieToEChartsOption([tableFrame()], theme, hidden);

    expect(result!.map((slice) => slice.name)).toEqual(['Sales', 'IT']);
    // 'IT' keeps its original row palette color despite 'Admin' being hidden.
    const itColor = all!.find((slice) => slice.name === 'IT')!.itemStyle!.color;
    expect(result!.find((slice) => slice.name === 'IT')!.itemStyle!.color).toBe(itColor);
  });

  it('applies a fixed color override to the matching slice', () => {
    const colored: FieldConfigSource = {
      defaults: {},
      overrides: [
        {
          matcher: { id: 'byName', options: 'Sales' },
          properties: [{ id: 'color', value: { mode: 'fixed', fixedColor: '#123456' } }],
        },
      ],
    };

    const result = pieToEChartsOption([tableFrame()], theme, colored);

    expect(result!.find((slice) => slice.name === 'Sales')!.itemStyle!.color).toBe('#123456');
  });
});
