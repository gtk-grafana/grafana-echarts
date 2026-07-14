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
