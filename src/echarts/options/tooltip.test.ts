import { ColorIndicator, ColorPlacement } from 'grafana/VizTooltip';
import { buildTooltipModel, EChartsTooltipParam, getTooltipOption, TooltipBuildContext } from 'echarts/options/tooltip';

const valueFormatter = (value: number | null) => (value == null ? 'null' : `${value}`);

const ctx = (overrides: Partial<TooltipBuildContext> = {}): TooltipBuildContext => ({
  kind: 'timeseries',
  valueFormatter,
  timeZone: 'utc',
  radarIndicators: [],
  ...overrides,
});

describe('getTooltipOption', () => {
  it('produces a transparent, chrome-less box for the given trigger', () => {
    expect(getTooltipOption('axis')).toMatchObject({
      show: true,
      trigger: 'axis',
      backgroundColor: 'transparent',
      borderWidth: 0,
      padding: 0,
    });
    expect(getTooltipOption('item').trigger).toBe('item');
  });
});

describe('buildTooltipModel - time series (axis trigger)', () => {
  const params: EChartsTooltipParam[] = [
    { seriesName: 'A', name: 'A', color: '#ff0000', value: [1000, 10], dataIndex: 0, seriesIndex: 0 },
    { seriesName: 'B', name: 'B', color: '#00ff00', value: [1000, 20], dataIndex: 0, seriesIndex: 1 },
  ];

  it('maps each series to a row with its color, name, and formatted value', () => {
    const model = buildTooltipModel(params, ctx())!;

    expect(model.items).toEqual([
      { label: 'A', value: '10', color: '#ff0000', colorIndicator: ColorIndicator.series, colorPlacement: ColorPlacement.first },
      { label: 'B', value: '20', color: '#00ff00', colorIndicator: ColorIndicator.series, colorPlacement: ColorPlacement.first },
    ]);
  });

  it('uses the hovered timestamp (tuple x) as the header value', () => {
    const model = buildTooltipModel(params, ctx())!;
    expect(model.header.label).toBe('');
    // 1000ms past epoch, formatted in UTC.
    expect(model.header.value).toContain('1970-01-01');
  });

  it('falls back to axisValueLabel when the value is not a tuple', () => {
    const model = buildTooltipModel(
      [{ seriesName: 'A', name: 'A', value: 5, axisValueLabel: 'bucket-1', dataIndex: 0 }],
      ctx()
    )!;
    expect(model.header.value).toBe('bucket-1');
    expect(model.items[0].value).toBe('5');
  });

  it('returns null with no params', () => {
    expect(buildTooltipModel([], ctx())).toBeNull();
  });
});

describe('buildTooltipModel - pie (item trigger)', () => {
  it('uses the slice name as header and shows value with percent', () => {
    const param: EChartsTooltipParam = {
      seriesName: 'Series',
      name: 'Slice',
      color: '#abcdef',
      value: 42,
      percent: 30,
      dataIndex: 0,
    };

    const model = buildTooltipModel(param, ctx({ kind: 'pie' }))!;

    expect(model.header).toEqual({ label: '', value: 'Slice' });
    expect(model.items).toEqual([
      {
        label: 'Series',
        value: '42 (30%)',
        color: '#abcdef',
        colorIndicator: ColorIndicator.series,
        colorPlacement: ColorPlacement.first,
      },
    ]);
  });
});

describe('buildTooltipModel - radar (item trigger)', () => {
  it('labels each value row with its indicator name', () => {
    const param: EChartsTooltipParam = {
      name: 'Polygon',
      color: '#123456',
      value: [1, 2, 3],
      dataIndex: 0,
    };

    const model = buildTooltipModel(param, ctx({ kind: 'radar', radarIndicators: ['CPU', 'Mem', 'Disk'] }))!;

    expect(model.header).toEqual({ label: '', value: 'Polygon' });
    expect(model.items.map((item) => [item.label, item.value])).toEqual([
      ['CPU', '1'],
      ['Mem', '2'],
      ['Disk', '3'],
    ]);
    expect(model.items.every((item) => item.color === '#123456')).toBe(true);
  });

  it('falls back to a positional label when an indicator name is missing', () => {
    const param: EChartsTooltipParam = { name: 'Polygon', value: [9], dataIndex: 0 };
    const model = buildTooltipModel(param, ctx({ kind: 'radar', radarIndicators: [] }))!;
    expect(model.items[0].label).toBe('#0');
  });
});
