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
import { getCartesianAxisStyle } from 'lib/echarts/options/cartesian';
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
