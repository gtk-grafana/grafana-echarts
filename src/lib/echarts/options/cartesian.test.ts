import {
  createTheme,
  type DataFrame,
  FieldType,
  getDefaultTimeRange,
  ThresholdsMode,
  toDataFrame,
  type ValueFormatter,
} from '@grafana/data';
import { GraphThresholdsStyleMode } from '@grafana/schema';
import { seriesTypePath } from 'editor/constants';
import { type CartesianSingleValueSeriesType } from 'editor/types';
import { cartesianChartModule } from 'lib/echarts/charts/cartesian';
import { type ChartContext } from 'lib/echarts/charts/types';
import {
  ADVANCED_CARTESIAN_DEFAULTS,
  applyCartesianEditorModeDefaults,
  buildCartesianSeries,
  type CartesianSeriesInput,
  getBarRadius,
  getBarWidth,
  getCartesianAreaStyle,
  getCartesianAxisStyle,
  getCartesianItemStyle,
  getCartesianLineStyle,
  getCartesianSymbol,
  getCartesianValueLabel,
  getXTickRotate,
} from 'lib/echarts/options/cartesian';
import { type PanelOptions } from 'types';

describe('getCartesianAxisStyle', () => {
  it('uses the dark grid color and theme text/font on a dark theme', () => {
    const theme = createTheme({ colors: { mode: 'dark' } });
    const style = getCartesianAxisStyle(theme);

    expect(style.splitLine.lineStyle.color).toBe('rgba(240, 250, 255, 0.09)');
    expect(style.axisTick.lineStyle.color).toBe('rgba(240, 250, 255, 0.09)');
    expect(style.axisLabel.color).toBe(theme.colors.text.primary);
    expect(style.axisLabel.fontFamily).toBe(theme.typography.fontFamily);
    expect(style.axisLabel.fontSize).toBe(12);
  });

  it('uses the light grid color on a light theme', () => {
    const theme = createTheme({ colors: { mode: 'light' } });
    const style = getCartesianAxisStyle(theme);

    expect(style.splitLine.lineStyle.color).toBe('rgba(0, 10, 23, 0.09)');
  });

  it('hides the axis baseline and shows grid + ticks, matching uPlot defaults', () => {
    const style = getCartesianAxisStyle(createTheme());

    expect(style.axisLine.show).toBe(false);
    expect(style.splitLine.show).toBe(true);
    expect(style.axisTick.show).toBe(true);
    expect(style.axisTick.length).toBe(4);
  });
});

describe('cartesianChartModule threshold overlays', () => {
  const theme = createTheme();
  const formatValue: ValueFormatter = (value) => ({ text: value == null ? '' : String(value) });

  const makeContext = (frames: DataFrame[]): ChartContext<CartesianSingleValueSeriesType> => ({
    frames,
    theme,
    timeZone: 'utc',
    timeRange: getDefaultTimeRange(),
    options: { [seriesTypePath]: 'line' } as PanelOptions,
    seriesType: 'line',
    formatValue,
    replaceVariables: (value: string) => value,
    fieldConfig: { defaults: {}, overrides: [] },
  });

  const seriesArray = (result: unknown): Array<Record<string, unknown>> => {
    const series = (result as { series: unknown }).series;
    return (Array.isArray(series) ? series : [series]) as Array<Record<string, unknown>>;
  };

  // Two numeric fields; only the first requests thresholds. Overlays render once
  // on the shared value axis, so they attach to the first series only.
  const frame = (mode?: GraphThresholdsStyleMode): DataFrame =>
    toDataFrame({
      fields: [
        { name: 'time', type: FieldType.time, values: [1, 2, 3] },
        {
          name: 'cpu',
          type: FieldType.number,
          values: [10, 50, 90],
          config: {
            displayName: 'cpu',
            custom: mode ? { thresholdsStyle: { mode } } : {},
            thresholds: {
              mode: ThresholdsMode.Absolute,
              steps: [
                { value: -Infinity, color: 'green' },
                { value: 70, color: 'red' },
              ],
            },
          },
        },
        { name: 'mem', type: FieldType.number, values: [20, 30, 40], config: { displayName: 'mem' } },
      ],
    });

  it('attaches threshold marks to the first series only', () => {
    const result = cartesianChartModule.buildOption(makeContext([frame(GraphThresholdsStyleMode.LineAndArea)]), {
      isGrafanaLegend: true,
    });

    const series = seriesArray(result);
    expect(series[0].markLine).toBeDefined();
    expect(series[0].markArea).toBeDefined();
    expect(series[1].markLine).toBeUndefined();
    expect(series[1].markArea).toBeUndefined();
  });

  it('omits threshold marks when the display mode is Off', () => {
    const result = cartesianChartModule.buildOption(makeContext([frame()]), { isGrafanaLegend: true });

    const series = seriesArray(result);
    expect(series[0].markLine).toBeUndefined();
    expect(series[0].markArea).toBeUndefined();
  });
});

describe('cartesianChartModule axis Min/Max', () => {
  const theme = createTheme();
  const formatValue: ValueFormatter = (value) => ({ text: value == null ? '' : String(value) });

  const makeContext = (
    frames: DataFrame[],
    seriesType: CartesianSingleValueSeriesType | 'candlestick' = 'line'
  ): ChartContext =>
    ({
      frames,
      theme,
      timeZone: 'utc',
      timeRange: getDefaultTimeRange(),
      options: { [seriesTypePath]: seriesType } as PanelOptions,
      seriesType,
      formatValue,
      replaceVariables: (value: string) => value,
      fieldConfig: { defaults: {}, overrides: [] },
    }) as ChartContext;

  const firstYAxis = (result: unknown): Record<string, unknown> => {
    const yAxis = (result as { yAxis: unknown }).yAxis;
    return (Array.isArray(yAxis) ? yAxis[0] : yAxis) as Record<string, unknown>;
  };

  it('pins the time-axis value axis to the configured Min/Max', () => {
    const frame = toDataFrame({
      fields: [
        { name: 'time', type: FieldType.time, values: [1, 2, 3] },
        { name: 'cpu', type: FieldType.number, values: [10, 50, 90], config: { min: 0, max: 100 } },
      ],
    });

    const yAxis = firstYAxis(cartesianChartModule.buildOption(makeContext([frame]), { isGrafanaLegend: true }));
    expect(yAxis.min).toBe(0);
    expect(yAxis.max).toBe(100);
  });

  it('pins the category-axis value axis to the configured Min/Max', () => {
    const frame = toDataFrame({
      fields: [
        { name: 'category', type: FieldType.string, values: ['a', 'b', 'c'] },
        { name: 'v', type: FieldType.number, values: [10, 50, 90], config: { min: -10, max: 200 } },
      ],
    });

    const yAxis = firstYAxis(cartesianChartModule.buildOption(makeContext([frame], 'bar'), { isGrafanaLegend: true }));
    expect(yAxis.min).toBe(-10);
    expect(yAxis.max).toBe(200);
  });

  it('pins the multi-value (candlestick) value axis to the configured Min/Max', () => {
    const frame = toDataFrame({
      name: 'BTC',
      fields: [
        { name: 'time', type: FieldType.time, values: [1, 2, 3] },
        { name: 'open', type: FieldType.number, values: [10, 18, 22], config: { min: 0, max: 40 } },
        { name: 'high', type: FieldType.number, values: [20, 25, 28] },
        { name: 'low', type: FieldType.number, values: [5, 12, 18] },
        { name: 'close', type: FieldType.number, values: [18, 22, 15] },
      ],
    });

    const yAxis = firstYAxis(
      cartesianChartModule.buildOption(makeContext([frame], 'candlestick'), { isGrafanaLegend: true })
    );
    expect(yAxis.min).toBe(0);
    expect(yAxis.max).toBe(40);
  });

  it('leaves Min/Max unset when not configured', () => {
    const frame = toDataFrame({
      fields: [
        { name: 'time', type: FieldType.time, values: [1, 2, 3] },
        { name: 'cpu', type: FieldType.number, values: [10, 50, 90] },
      ],
    });

    const yAxis = firstYAxis(cartesianChartModule.buildOption(makeContext([frame]), { isGrafanaLegend: true }));
    expect(yAxis.min).toBeUndefined();
    expect(yAxis.max).toBeUndefined();
  });
});

// --- Advanced cartesian option builders (categorical multi-axis parity uplift) ---

describe('getCartesianValueLabel', () => {
  const theme = createTheme();

  it('returns undefined unless showValues is "always"', () => {
    expect(getCartesianValueLabel(undefined, undefined, theme)).toBeUndefined();
    expect(getCartesianValueLabel('auto', undefined, theme)).toBeUndefined();
    expect(getCartesianValueLabel('never', undefined, theme)).toBeUndefined();
  });

  it('shows a themed label at the default top position when always', () => {
    expect(getCartesianValueLabel('always', undefined, theme)).toMatchObject({
      show: true,
      position: 'top',
      color: theme.colors.text.primary,
    });
  });

  it('threads the configured position through', () => {
    expect(getCartesianValueLabel('always', 'inside', theme)).toMatchObject({ show: true, position: 'inside' });
  });
});

describe('getBarWidth', () => {
  it('formats a positive width as a percentage', () => {
    expect(getBarWidth(60)).toBe('60%');
  });

  it('omits 0/unset (ECharts auto width)', () => {
    expect(getBarWidth(0)).toBeUndefined();
    expect(getBarWidth(undefined)).toBeUndefined();
  });
});

describe('getBarRadius', () => {
  it('returns a positive radius and omits 0/unset', () => {
    expect(getBarRadius(8)).toBe(8);
    expect(getBarRadius(0)).toBeUndefined();
    expect(getBarRadius(undefined)).toBeUndefined();
  });
});

describe('getCartesianItemStyle', () => {
  it('keeps the color and omits borderRadius at the default', () => {
    expect(getCartesianItemStyle('#111111', 0)).toEqual({ color: '#111111' });
    expect(getCartesianItemStyle('#111111', undefined)).toEqual({ color: '#111111' });
  });

  it('merges a non-zero borderRadius without clobbering the color', () => {
    expect(getCartesianItemStyle('#111111', 12)).toEqual({ color: '#111111', borderRadius: 12 });
  });
});

describe('getCartesianLineStyle', () => {
  it('keeps the color and omits width at unset/≤0', () => {
    expect(getCartesianLineStyle('#111111', undefined)).toEqual({ color: '#111111' });
    expect(getCartesianLineStyle('#111111', 0)).toEqual({ color: '#111111' });
  });

  it('merges a positive width', () => {
    expect(getCartesianLineStyle('#111111', 3)).toEqual({ color: '#111111', width: 3 });
  });
});

describe('getCartesianAreaStyle', () => {
  it('maps a non-zero fill opacity 0–100 to an areaStyle opacity 0–1', () => {
    expect(getCartesianAreaStyle(50)).toEqual({ opacity: 0.5 });
    expect(getCartesianAreaStyle(100)).toEqual({ opacity: 1 });
  });

  it('clamps values above 100', () => {
    expect(getCartesianAreaStyle(150)).toEqual({ opacity: 1 });
  });

  it('returns undefined for 0/unset (a plain line)', () => {
    expect(getCartesianAreaStyle(0)).toBeUndefined();
    expect(getCartesianAreaStyle(undefined)).toBeUndefined();
  });
});

describe('getCartesianSymbol', () => {
  it('returns {} for unset (ECharts default symbol)', () => {
    expect(getCartesianSymbol(undefined)).toEqual({});
  });

  it('hides the points at 0', () => {
    expect(getCartesianSymbol(0)).toEqual({ showSymbol: false });
  });

  it('sets the symbol size for a positive value', () => {
    expect(getCartesianSymbol(8)).toEqual({ symbolSize: 8 });
  });
});

describe('getXTickRotate', () => {
  it('returns {} at 0/unset (horizontal labels)', () => {
    expect(getXTickRotate(0)).toEqual({});
    expect(getXTickRotate(undefined)).toEqual({});
  });

  it('returns the rotate extra for a non-zero angle', () => {
    expect(getXTickRotate(45)).toEqual({ rotate: 45 });
    expect(getXTickRotate(-30)).toEqual({ rotate: -30 });
  });
});

describe('buildCartesianSeries', () => {
  const theme = createTheme();
  const input: CartesianSeriesInput = { name: 'A', data: [1, 2, 3], color: '#111111', zlevel: 3 };

  it('applies bar-only geometry (width/radius), not line/symbol keys', () => {
    const series = buildCartesianSeries(
      input,
      'bar',
      { barWidth: 60, barRadius: 8, lineWidth: 4, fillOpacity: 50, pointSize: 10 } as PanelOptions,
      theme
    );
    expect(series.type).toBe('bar');
    expect(series.itemStyle).toEqual({ color: '#111111', borderRadius: 8 });
    expect(series).toMatchObject({ barWidth: '60%' });
    expect(series).not.toHaveProperty('areaStyle');
    expect(series).not.toHaveProperty('symbolSize');
  });

  it('applies line-only style (width/area/symbol), not bar width/radius', () => {
    const series = buildCartesianSeries(
      input,
      'line',
      { barWidth: 60, barRadius: 8, lineWidth: 4, fillOpacity: 50, pointSize: 10 } as PanelOptions,
      theme
    );
    expect(series.type).toBe('line');
    expect(series).toMatchObject({
      lineStyle: { color: '#111111', width: 4 },
      areaStyle: { opacity: 0.5 },
      symbolSize: 10,
      itemStyle: { color: '#111111' },
    });
    expect(series).not.toHaveProperty('barWidth');
  });

  it('adds a value label only when showValues is always', () => {
    const off = buildCartesianSeries(input, 'bar', { showValues: 'auto' } as PanelOptions, theme);
    expect(off).not.toHaveProperty('label');
    const on = buildCartesianSeries(input, 'bar', { showValues: 'always' } as PanelOptions, theme);
    expect(on.label).toMatchObject({ show: true });
  });

  it('sets showEffectOn for effectScatter', () => {
    const series = buildCartesianSeries(input, 'effectScatter', {} as PanelOptions, theme);
    expect(series).toMatchObject({ type: 'effectScatter', showEffectOn: 'emphasis' });
  });

  it('is color-only for an untouched panel (unchanged render)', () => {
    const series = buildCartesianSeries(input, 'line', {} as PanelOptions, theme);
    expect(series).toEqual({
      name: 'A',
      data: [1, 2, 3],
      zlevel: 3,
      type: 'line',
      itemStyle: { color: '#111111' },
      lineStyle: { color: '#111111' },
    });
  });
});

describe('applyCartesianEditorModeDefaults', () => {
  const withMode = (editorMode: PanelOptions['editorMode'], extra: Partial<PanelOptions> = {}): PanelOptions =>
    ({ editorMode, ...extra }) as PanelOptions;

  it('forces advanced options back to their defaults in Default mode', () => {
    const resolved = applyCartesianEditorModeDefaults(
      withMode('default', { barWidth: 60, valueLabelPosition: 'inside' })
    );
    expect(resolved.barWidth).toBe(ADVANCED_CARTESIAN_DEFAULTS.barWidth);
    expect(resolved.valueLabelPosition).toBe(ADVANCED_CARTESIAN_DEFAULTS.valueLabelPosition);
  });

  it('resets the shared animation option in Default mode', () => {
    const resolved = applyCartesianEditorModeDefaults(withMode('default', { animation: { enabled: false } }));
    expect(resolved.animation).toEqual({ enabled: true });
  });

  it('keeps the Default-tier showValues (never reset)', () => {
    const resolved = applyCartesianEditorModeDefaults(withMode('default', { showValues: 'always' }));
    expect(resolved.showValues).toBe('always');
  });

  it('passes stored advanced values through untouched in Advanced mode', () => {
    const options = withMode('advanced', { barWidth: 60, fillOpacity: 40 });
    expect(applyCartesianEditorModeDefaults(options)).toBe(options);
  });
});
