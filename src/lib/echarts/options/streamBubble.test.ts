import { createTheme, dateTime, type TimeRange, type ValueFormatter } from '@grafana/data';
import { type StreamChartContext } from 'lib/echarts/charts/types';
import { type StreamLayer } from 'lib/echarts/converters/stream';
import { type PanelOptions } from 'types';
import {
  getStreamBubbleAxes,
  getStreamBubbleMaxValue,
  getStreamBubbleSeries,
  resolveBubbleSymbolSize,
} from './streamBubble';

const theme = createTheme();

const timeRange: TimeRange = {
  from: dateTime(1000),
  to: dateTime(5000),
  raw: { from: 'now-1h', to: 'now' },
};

const formatValue: ValueFormatter = (value) => ({ text: String(value) });

const layer = (name: string, color: string, points: Array<[number, number]>): StreamLayer => ({
  name,
  color,
  hidden: false,
  points,
});

const makeContext = (options: Partial<PanelOptions> = {}): StreamChartContext => ({
  frames: [],
  theme,
  timeZone: 'utc',
  timeRange,
  options: options as PanelOptions,
  seriesType: 'themeRiver',
  formatValue,
  fieldConfig: { defaults: {}, overrides: [] },
  replaceVariables: (value: string) => value,
});

const layers = [
  layer('deploy', 'red', [
    [1000, 4],
    [2000, 1],
  ]),
  layer('rollback', 'blue', [[1000, 16]]),
];

describe('getStreamBubbleAxes', () => {
  const percent = (value: unknown) => Number(String(value).replace('%', ''));

  it('emits one axis per layer, stacked top to bottom without overlapping', () => {
    const axes = getStreamBubbleAxes(layers, timeRange, 'utc', theme);

    expect(axes).toHaveLength(2);
    // Each row's line sits below the previous row's, with the slot's worth of space
    // between them.
    expect(percent(axes[1].top)).toBeGreaterThan(percent(axes[0].top) + percent(axes[0].height));
  });

  it('keeps each row’s rect far flatter than its slot, so the row is its own baseline', () => {
    // A rect as tall as its slot would centre the bubbles half a rect above the axis
    // line the row name is anchored to.
    const axes = getStreamBubbleAxes(layers, timeRange, 'utc', theme);
    const slot = percent(axes[1].top) - percent(axes[0].top);

    expect(percent(axes[0].height)).toBeLessThan(slot / 2);
  });

  it('leaves room below the last row for the shared tick labels', () => {
    const axes = getStreamBubbleAxes(layers, timeRange, 'utc', theme);
    const last = axes[axes.length - 1];

    expect(percent(last.top) + percent(last.height)).toBeLessThan(100);
  });

  it('names each row after its layer, at the axis start', () => {
    const axes = getStreamBubbleAxes(layers, timeRange, 'utc', theme);

    expect(axes.map((axis) => axis.name)).toEqual(['deploy', 'rollback']);
    expect(axes[0].nameLocation).toBe('start');
  });

  it('draws tick labels on the last row only', () => {
    // N identical sets of times would be noise; the rows share one x extent, so one
    // set reads for all of them.
    const axes = getStreamBubbleAxes(layers, timeRange, 'utc', theme);

    expect(axes.map((axis) => axis.axisLabel?.show)).toEqual([false, true]);
  });

  it('pins every row to the same dashboard time window', () => {
    const axes = getStreamBubbleAxes(layers, timeRange, 'utc', theme);

    // Rows are only comparable if they share an x extent.
    expect(axes.map((axis) => [axis.min, axis.max])).toEqual([
      [1000, 5000],
      [1000, 5000],
    ]);
  });

  it('returns nothing for no layers rather than dividing by zero', () => {
    expect(getStreamBubbleAxes([], timeRange, 'utc', theme)).toEqual([]);
  });
});

describe('getStreamBubbleMaxValue', () => {
  it('is the largest value across every layer, not per layer', () => {
    // A punch card is read by comparing ink between rows, which a per-row scale
    // would make meaningless.
    expect(getStreamBubbleMaxValue(layers)).toBe(16);
  });

  it('is zero when nothing is positive', () => {
    expect(getStreamBubbleMaxValue([])).toBe(0);
    expect(getStreamBubbleMaxValue([layer('a', 'red', [[1000, 0]])])).toBe(0);
  });
});

describe('resolveBubbleSymbolSize', () => {
  const size = resolveBubbleSymbolSize(100, 40);

  it('scales the diameter by the square root, so the area is proportional', () => {
    // A quarter of the max value covers a quarter of the ink, which means half the
    // diameter — a linear diameter scale would exaggerate large values.
    expect(size([1000, 100])).toBe(40);
    expect(size([1000, 25])).toBe(20);
  });

  it('draws nothing for a non-positive value', () => {
    // Nulls already became 0 in the converter, and on a punch card absence of ink is
    // the honest reading of "nothing happened".
    expect(size([1000, 0])).toBe(0);
    expect(size([1000, -5])).toBe(0);
  });

  it('floors a tiny nonzero value so it stays visible', () => {
    // Without a floor an area scale collapses small-but-real observations to
    // sub-pixel dots, which would read as missing data.
    expect(size([1000, 0.0001])).toBeGreaterThan(0);
  });

  it('draws nothing at all when there is no positive maximum to scale against', () => {
    expect(resolveBubbleSymbolSize(0, 40)([1000, 5])).toBe(0);
  });

  it('reads a bare magnitude as well as a [time, value] pair', () => {
    expect(size(100)).toBe(40);
    expect(size('nope')).toBe(0);
  });
});

describe('getStreamBubbleSeries', () => {
  it('emits one scatter per layer, each bound to its own row', () => {
    const series = getStreamBubbleSeries(layers, makeContext());

    expect(series).toHaveLength(2);
    expect(series.map((entry) => [entry.type, entry.coordinateSystem, entry.singleAxisIndex])).toEqual([
      ['scatter', 'singleAxis', 0],
      ['scatter', 'singleAxis', 1],
    ]);
  });

  it('keeps the data as [time, value] pairs', () => {
    // A single-axis coordinate system has one dimension: `Single.dataToPoint` reads
    // element 0 for the position, leaving element 1 as the magnitude.
    expect(getStreamBubbleSeries(layers, makeContext())[0].data).toEqual([
      [1000, 4],
      [2000, 1],
    ]);
  });

  it('colors each row from its layer, not from a palette', () => {
    // scatter defaults to `colorBy: 'series'`, so one series is one color and the
    // layer's Grafana color can be set directly.
    expect(getStreamBubbleSeries(layers, makeContext()).map((entry) => entry.itemStyle?.color)).toEqual([
      'red',
      'blue',
    ]);
  });

  it('sizes every row from the shared scale', () => {
    const series = getStreamBubbleSeries(layers, makeContext({ streamBubbleMaxSize: 40 }));
    const sizeOf = (index: number, value: number) => {
      const symbolSize = series[index].symbolSize as (value: unknown) => number;
      return symbolSize([1000, value]);
    };

    // 16 is the set-wide max, so it draws at full size on either row — and 4 draws
    // at half the diameter (a quarter of the area) on either row too.
    expect(sizeOf(0, 16)).toBe(40);
    expect(sizeOf(1, 16)).toBe(40);
    expect(sizeOf(0, 4)).toBe(20);
  });

  it('omits emphasis at the default and writes it when set', () => {
    expect(getStreamBubbleSeries(layers, makeContext())[0]).not.toHaveProperty('emphasis');
    expect(getStreamBubbleSeries(layers, makeContext({ streamEmphasisFocus: 'self' }))[0].emphasis).toEqual({
      focus: 'self',
    });
  });

  it('places the series on the panel series canvas layer', () => {
    expect(getStreamBubbleSeries(layers, makeContext({ zLevel: { series: 3 } }))[0].zlevel).toBe(3);
  });

  it('attaches its own tooltip formatter', () => {
    // The bubble indexes layers by `seriesIndex`, unlike the river's flat
    // `dataIndex` walk, so it carries its own model.
    expect(getStreamBubbleSeries(layers, makeContext())[0].tooltip?.formatter).toBeInstanceOf(Function);
  });
});
