import { createTheme, dateTime, type TimeRange, type ValueFormatter } from '@grafana/data';
import { type StreamData, type StreamLayer } from 'lib/echarts/converters/stream';
import { type StreamChartContext } from 'lib/echarts/charts/types';
import { type PanelOptions } from 'types';
import { getStreamSingleAxis, getThemeRiverSeries, toThemeRiverData } from './stream';

const theme = createTheme();

const timeRange: TimeRange = {
  from: dateTime(1000),
  to: dateTime(5000),
  raw: { from: 'now-1h', to: 'now' },
};

const formatValue: ValueFormatter = (value) => ({ text: String(value) });

const layer = (name: string, color: string, points: Array<[number, number]>, hidden = false): StreamLayer => ({
  name,
  color,
  hidden,
  points,
});

const streamData = (layers: StreamLayer[]): StreamData => ({ layers });

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

describe('toThemeRiverData', () => {
  it('flattens layers to [time, value, name] triples, layer by layer', () => {
    const data = streamData([
      layer('a', 'red', [
        [1000, 1],
        [2000, 2],
      ]),
      layer('b', 'blue', [[1000, 3]]),
    ]);

    // Plain arrays only: `ThemeRiverSeriesModel.getInitialData` filters items with
    // `dataItem[2] !== undefined`, so an object item would be dropped outright.
    expect(toThemeRiverData(data.layers)).toEqual([
      [1000, 1, 'a'],
      [2000, 2, 'a'],
      [1000, 3, 'b'],
    ]);
  });
});

describe('getStreamSingleAxis', () => {
  it('is a time axis pinned to the dashboard time range', () => {
    const axis = getStreamSingleAxis(timeRange, theme);

    expect(axis.type).toBe('time');
    expect(axis.min).toBe(1000);
    expect(axis.max).toBe(5000);
  });

  it('reserves room under the axis for its tick labels', () => {
    // The single axis defaults to `position: 'bottom'` and has no `containLabel`,
    // so the labels would be clipped without explicit bottom padding.
    expect(getStreamSingleAxis(timeRange, theme).bottom).toBeGreaterThan(0);
  });

  // Only reached when the panel renders ECharts' own legend instead of the Grafana
  // DOM one, which `VizLayout` lays out outside the canvas (see the module's
  // `isGrafanaLegend` branch).
  it('reserves extra room for a native legend on the side it sits', () => {
    const bottomLegend = getStreamSingleAxis(timeRange, theme, { placement: 'bottom' } as never);
    const rightLegend = getStreamSingleAxis(timeRange, theme, { placement: 'right' } as never);
    const noLegend = getStreamSingleAxis(timeRange, theme);

    expect(Number(bottomLegend.bottom)).toBeGreaterThan(Number(noLegend.bottom));
    expect(Number(rightLegend.right)).toBeGreaterThan(Number(noLegend.right));
  });

  it('draws no split lines (they would rule the plot area over the ribbons)', () => {
    expect(getStreamSingleAxis(timeRange, theme).splitLine).toEqual({ show: false });
  });
});

describe('getThemeRiverSeries', () => {
  const data = streamData([layer('a', 'red', [[1000, 1]]), layer('b', 'blue', [[1000, 2]])]);

  it('passes the layer colors as the series palette, in layer order', () => {
    // themeRiver colors by data item through `getColorFromPalette(name, ...)`,
    // which caches by name — so palette position N paints the Nth layer name.
    expect(getThemeRiverSeries(data, makeContext()).color).toEqual(['red', 'blue']);
  });

  it('hides the layer labels by default', () => {
    // ECharts shows them at 11px black on the left edge of every ribbon.
    expect(getThemeRiverSeries(data, makeContext()).label).toEqual({ show: false });
  });

  it('places the series on the panel series canvas layer', () => {
    expect(getThemeRiverSeries(data, makeContext({ zLevel: { series: 3 } })).zlevel).toBe(3);
  });

  it('drops hidden layers from both the data and the palette', () => {
    const withHidden = streamData([layer('a', 'red', [[1000, 1]]), layer('b', 'blue', [[1000, 2]], true)]);
    const series = getThemeRiverSeries(withHidden, makeContext());

    // The palette is positional, so a hidden layer has to leave both lists or every
    // ribbon after it would take the wrong color.
    expect(series.color).toEqual(['red']);
    expect(series.data).toEqual([[1000, 1, 'a']]);
  });

  it('attaches its own tooltip formatter', () => {
    // The generic model reads an item's *last* value as the magnitude, which for a
    // `[time, value, name]` triple is the layer name.
    expect(getThemeRiverSeries(data, makeContext()).tooltip?.formatter).toBeInstanceOf(Function);
  });
});
