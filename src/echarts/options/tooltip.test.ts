import { SortOrder, TooltipDisplayMode } from '@grafana/schema';
import { ColorIndicator, ColorPlacement } from 'grafana/VizTooltip';
import {
  buildTooltipModel,
  computeTooltipPosition,
  EChartsTooltipParam,
  getTooltipOption,
  TooltipBuildContext,
  tooltipTriggerForMode,
} from 'echarts/options/tooltip';

const valueFormatter = (value: number | null) => (value == null ? 'null' : `${value}`);

const ctx = (overrides: Partial<TooltipBuildContext> = {}): TooltipBuildContext => ({
  kind: 'timeseries',
  valueFormatter,
  timeZone: 'utc',
  radarIndicators: [],
  sort: SortOrder.None,
  hideZeros: false,
  xIsTime: true,
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

  it('disables the tooltip entirely in "Hidden" mode', () => {
    expect(getTooltipOption('axis', TooltipDisplayMode.None)).toEqual({ show: false });
    expect(getTooltipOption('item', TooltipDisplayMode.None)).toEqual({ show: false });
  });

  it('still shows for non-hidden modes', () => {
    expect(getTooltipOption('axis', TooltipDisplayMode.Multi).show).toBe(true);
    expect(getTooltipOption('item', TooltipDisplayMode.Single).show).toBe(true);
  });
});

describe('tooltipTriggerForMode', () => {
  it('uses axis for multi and item for single on time series', () => {
    expect(tooltipTriggerForMode('timeseries', TooltipDisplayMode.Multi)).toBe('axis');
    expect(tooltipTriggerForMode('timeseries', TooltipDisplayMode.Single)).toBe('item');
  });

  it('always uses item for pie and radar', () => {
    expect(tooltipTriggerForMode('pie', TooltipDisplayMode.Multi)).toBe('item');
    expect(tooltipTriggerForMode('radar', TooltipDisplayMode.Single)).toBe('item');
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
      { label: 'A', value: '10', color: '#ff0000', colorIndicator: ColorIndicator.series, colorPlacement: ColorPlacement.first, numeric: 10 },
      { label: 'B', value: '20', color: '#00ff00', colorIndicator: ColorIndicator.series, colorPlacement: ColorPlacement.first, numeric: 20 },
    ]);
  });

  it('carries the originating series/row refs for link resolution', () => {
    const model = buildTooltipModel(params, ctx())!;
    expect(model.refs).toEqual([
      { seriesIndex: 0, dataIndex: 0 },
      { seriesIndex: 1, dataIndex: 0 },
    ]);
  });

  it('sorts rows by numeric value when a sort order is set', () => {
    const ascending = buildTooltipModel(params, ctx({ sort: SortOrder.Ascending }))!;
    expect(ascending.items.map((item) => item.value)).toEqual(['10', '20']);

    const descending = buildTooltipModel(params, ctx({ sort: SortOrder.Descending }))!;
    expect(descending.items.map((item) => item.value)).toEqual(['20', '10']);
    // Refs follow the rows so links still resolve to the right field.
    expect(descending.refs).toEqual([
      { seriesIndex: 1, dataIndex: 0 },
      { seriesIndex: 0, dataIndex: 0 },
    ]);
  });

  it('drops rows whose value is exactly zero when hideZeros is set', () => {
    const withZero: EChartsTooltipParam[] = [
      { seriesName: 'A', name: 'A', value: [1000, 0], dataIndex: 0, seriesIndex: 0 },
      { seriesName: 'B', name: 'B', value: [1000, 20], dataIndex: 0, seriesIndex: 1 },
    ];
    const model = buildTooltipModel(withZero, ctx({ hideZeros: true }))!;
    expect(model.items.map((item) => item.label)).toEqual(['B']);
    expect(model.refs).toEqual([{ seriesIndex: 1, dataIndex: 0 }]);
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

describe('buildTooltipModel - heatmap (item trigger)', () => {
  // Cell tuple: [xStart, yStart, xEnd, yEnd, value].
  const cell: EChartsTooltipParam = {
    name: 'Heatmap',
    color: '#cccccc',
    value: [1000, 10, 2000, 20, 7],
    dataIndex: 3,
    seriesIndex: 0,
  };

  it('shows the cell time as the header for a time X axis', () => {
    const model = buildTooltipModel(cell, ctx({ kind: 'heatmap', xIsTime: true }))!;
    expect(model.header.value).toContain('1970-01-01');
    expect(model.items[0]).toMatchObject({ label: '10 - 20', value: '7', colorIndicator: ColorIndicator.value });
  });

  it('shows the numeric X bucket range as the header for a non-time X axis', () => {
    const model = buildTooltipModel(cell, ctx({ kind: 'heatmap', xIsTime: false }))!;
    expect(model.header.value).toBe('1000 - 2000');
    expect(model.items[0].value).toBe('7');
  });
});

describe('computeTooltipPosition', () => {
  const viewport = { width: 1000, height: 800 };
  const size = { width: 200, height: 100 };

  it('places the box to the bottom-left of the cursor by default', () => {
    const { left, top } = computeTooltipPosition({ x: 500, y: 400 }, size, viewport);
    // left of the cursor (x - width - offset) and below it (y + offset).
    expect(left).toBe(500 - 200 - 12);
    expect(top).toBe(400 + 12);
  });

  it('flips to the right of the cursor near the left edge', () => {
    const { left } = computeTooltipPosition({ x: 20, y: 400 }, size, viewport);
    expect(left).toBe(20 + 12);
  });

  it('flips above the cursor near the bottom edge', () => {
    const { top } = computeTooltipPosition({ x: 500, y: 770 }, size, viewport);
    expect(top).toBe(770 - 100 - 12);
  });

  it('clamps the box within the viewport', () => {
    const { left, top } = computeTooltipPosition({ x: 995, y: 5 }, size, viewport);
    expect(left).toBeGreaterThanOrEqual(8);
    expect(left).toBeLessThanOrEqual(viewport.width - size.width - 8);
    expect(top).toBeGreaterThanOrEqual(8);
    expect(top).toBeLessThanOrEqual(viewport.height - size.height - 8);
  });
});
