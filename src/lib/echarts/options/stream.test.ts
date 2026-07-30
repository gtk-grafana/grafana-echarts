import { createTheme, dateTime, type TimeRange, type ValueFormatter } from '@grafana/data';
import { type StreamData, type StreamLayer } from 'lib/echarts/converters/stream';
import { type StreamChartContext } from 'lib/echarts/charts/types';
import { type PanelOptions } from 'types';
import {
  applyStreamEditorModeDefaults,
  getStreamBoundaryGap,
  getStreamEmphasis,
  getStreamItemStyle,
  getStreamLabel,
  getStreamSingleAxis,
  getThemeRiverSeries,
  toThemeRiverData,
} from './stream';

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
    const axis = getStreamSingleAxis(timeRange, 'utc', theme);

    expect(axis.type).toBe('time');
    expect(axis.min).toBe(1000);
    expect(axis.max).toBe(5000);
  });

  it('reserves room under the axis for its tick labels', () => {
    // The single axis defaults to `position: 'bottom'` and has no `containLabel`,
    // so the labels would be clipped without explicit bottom padding.
    expect(getStreamSingleAxis(timeRange, 'utc', theme).bottom).toBeGreaterThan(0);
  });

  // Only reached when the panel renders ECharts' own legend instead of the Grafana
  // DOM one, which `VizLayout` lays out outside the canvas (see the module's
  // `isGrafanaLegend` branch).
  it('reserves extra room for a native legend on the side it sits', () => {
    const bottomLegend = getStreamSingleAxis(timeRange, 'utc', theme, { placement: 'bottom' } as never);
    const rightLegend = getStreamSingleAxis(timeRange, 'utc', theme, { placement: 'right' } as never);
    const noLegend = getStreamSingleAxis(timeRange, 'utc', theme);

    expect(Number(bottomLegend.bottom)).toBeGreaterThan(Number(noLegend.bottom));
    expect(Number(rightLegend.right)).toBeGreaterThan(Number(noLegend.right));
  });

  it('draws no split lines (they would rule the plot area over the ribbons)', () => {
    expect(getStreamSingleAxis(timeRange, 'utc', theme).splitLine).toEqual({ show: false });
  });

  it('formats its tick labels in the dashboard time zone', () => {
    // ECharts has only a global `useUTC` and no IANA timezone support, so without
    // an explicit formatter the ticks render in *browser* local time whatever the
    // dashboard is set to — which is what the cartesian x-axis and the heatmap
    // already work around.
    const dayRange: TimeRange = {
      from: dateTime(1783137094497),
      to: dateTime(1783147894497),
      raw: { from: 'now-3h', to: 'now' },
    };
    const formatterFor = (timeZone: string) =>
      getStreamSingleAxis(dayRange, timeZone, theme).axisLabel?.formatter as (value: number) => string;

    const utc = formatterFor('utc')(1783137600000);

    expect(utc).toBe('04:00');
    // A fixed offset zone must disagree with UTC, or the timeZone never reached
    // the formatter.
    expect(formatterFor('America/Chicago')(1783137600000)).not.toBe(utc);
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

  it('writes no styling keys at the defaults', () => {
    // An untouched panel must render on ECharts' own geometry and hover behavior,
    // so every builder omits its key. `label` is the deliberate exception: ECharts
    // shows layer labels by default and the plugin does not, so an explicit
    // `show: false` is the default state (asserted above).
    //
    // `not.toHaveProperty`, not `toBeUndefined`: an explicit `undefined` blocks
    // `defaultOption` from merging (zrender's `merge` skips any key already in the
    // target), and `themeRiverLayout` then throws indexing `boundaryGap[0]`. The
    // key has to be genuinely absent.
    const series = getThemeRiverSeries(data, makeContext());

    expect(series).not.toHaveProperty('boundaryGap');
    expect(series).not.toHaveProperty('itemStyle');
    expect(series).not.toHaveProperty('emphasis');
  });

  it('threads every configured option onto the series', () => {
    const series = getThemeRiverSeries(
      data,
      makeContext({
        streamBoundaryGap: 4,
        streamShowLabels: true,
        streamLabelMargin: -12,
        streamLabelFontSize: 14,
        streamFillOpacity: 60,
        streamBorderWidth: 2,
        streamBorderColor: '#112233',
        streamEmphasisFocus: 'self',
      })
    );

    expect(series.boundaryGap).toEqual(['4%', '4%']);
    expect(series.label).toMatchObject({ show: true, margin: -12, fontSize: 14 });
    expect(series.itemStyle).toEqual({ opacity: 0.6, borderWidth: 2, borderColor: '#112233' });
    expect(series.emphasis).toEqual({ focus: 'self' });
  });
});

describe('getStreamBoundaryGap', () => {
  it('is omitted at unset and at ECharts’ own 10% default', () => {
    expect(getStreamBoundaryGap(undefined)).toBeUndefined();
    expect(getStreamBoundaryGap(10)).toBeUndefined();
  });

  it('applies the percentage to both sides', () => {
    expect(getStreamBoundaryGap(0)).toEqual(['0%', '0%']);
    expect(getStreamBoundaryGap(25)).toEqual(['25%', '25%']);
  });
});

describe('getStreamLabel', () => {
  it('is an explicit show:false when off', () => {
    // The one key that is always written: ECharts' `defaultOption` shows these
    // labels, so "off" has to say so.
    expect(getStreamLabel(theme, undefined)).toEqual({ show: false });
    expect(getStreamLabel(theme, false)).toEqual({ show: false });
  });

  it('themes the label when on', () => {
    const label = getStreamLabel(theme, true);

    // ECharts' own label is 11px in a hardcoded `#000`; the shared themed style
    // replaces both and clears the default text shadow/stroke.
    expect(label).toMatchObject({ show: true, color: theme.colors.text.primary });
    expect(label).toHaveProperty('textShadowBlur', 0);
  });

  it('omits the offset at ECharts’ own default and the font size when unset', () => {
    const label = getStreamLabel(theme, true, 4, undefined);

    expect(label).not.toHaveProperty('margin');
    expect(label).not.toHaveProperty('fontSize');
  });

  it('writes the offset and font size when set', () => {
    // `margin` rather than `position`: `ThemeRiverView` nulls the text position out
    // and places the label from `margin` alone, so `position` would be inert.
    expect(getStreamLabel(theme, true, -20, 16)).toMatchObject({ margin: -20, fontSize: 16 });
    expect(getStreamLabel(theme, true, -20)).not.toHaveProperty('position');
  });
});

describe('getStreamItemStyle', () => {
  it('is omitted when nothing is configured', () => {
    expect(getStreamItemStyle(undefined, undefined, undefined)).toBeUndefined();
    // A zero border width is "no border", so it writes nothing — as does a color
    // with no width to draw.
    expect(getStreamItemStyle(undefined, 0, '#ff0000')).toBeUndefined();
  });

  it('scales the 0–100 opacity to ECharts’ 0–1', () => {
    expect(getStreamItemStyle(50, undefined, undefined)).toEqual({ opacity: 0.5 });
    expect(getStreamItemStyle(0, undefined, undefined)).toEqual({ opacity: 0 });
  });

  it('pairs a border color with a border width', () => {
    expect(getStreamItemStyle(undefined, 2, '#00ff00')).toEqual({ borderWidth: 2, borderColor: '#00ff00' });
    expect(getStreamItemStyle(undefined, 2, undefined)).toEqual({ borderWidth: 2 });
  });

  it('never sets a color, which would clear the per-layer palette', () => {
    // themeRiver resolves each ribbon's color through `colorFromPalette`; an
    // `itemStyle.color` would override every one of them with a single fill.
    expect(getStreamItemStyle(50, 2, '#00ff00')).not.toHaveProperty('color');
  });
});

describe('getStreamEmphasis', () => {
  it('is omitted at unset and at the none default', () => {
    expect(getStreamEmphasis(undefined)).toBeUndefined();
    expect(getStreamEmphasis('none')).toBeUndefined();
  });

  it('writes the focus mode when set', () => {
    expect(getStreamEmphasis('self')).toEqual({ focus: 'self' });
    expect(getStreamEmphasis('series')).toEqual({ focus: 'series' });
  });
});

describe('applyStreamEditorModeDefaults', () => {
  // Advanced values a user configured and then hid (by switching back to Default)
  // would otherwise keep applying, because `showIf` only hides a control.
  const configured: PanelOptions = {
    streamLabelMargin: -20,
    streamLabelFontSize: 20,
    streamBoundaryGap: 30,
    streamFillOpacity: 40,
    streamBorderWidth: 3,
    streamBorderColor: '#abcdef',
    streamEmphasisFocus: 'self',
    animation: { enabled: true },
  } as PanelOptions;

  it('resets every advanced option in Default mode', () => {
    const normalized = applyStreamEditorModeDefaults(configured);

    expect(normalized).toMatchObject({
      streamLabelMargin: 4,
      streamLabelFontSize: undefined,
      streamBoundaryGap: 10,
      streamFillOpacity: undefined,
      streamBorderWidth: 0,
      streamBorderColor: undefined,
      streamEmphasisFocus: 'none',
      animation: { enabled: false },
    });
  });

  it('renders a Default-mode panel exactly like an untouched one', () => {
    // The point of the reset: the series built from normalized options carries no
    // styling keys at all.
    const series = getThemeRiverSeries(streamData([layer('a', 'red', [[1000, 1]])]), {
      ...makeContext(),
      options: applyStreamEditorModeDefaults(configured),
    });

    expect(series).not.toHaveProperty('boundaryGap');
    expect(series).not.toHaveProperty('itemStyle');
    expect(series).not.toHaveProperty('emphasis');
  });

  it('keeps the Default-tier options, which are never hidden', () => {
    const normalized = applyStreamEditorModeDefaults({
      ...configured,
      streamLayerSource: 'labels',
      streamShowLabels: true,
    });

    expect(normalized.streamLayerSource).toBe('labels');
    expect(normalized.streamShowLabels).toBe(true);
  });

  it('passes the stored options through in Advanced mode', () => {
    const advanced: PanelOptions = { ...configured, editorMode: 'advanced' };

    expect(applyStreamEditorModeDefaults(advanced)).toBe(advanced);
  });
});
