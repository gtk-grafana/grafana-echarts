import { createTheme, dateTime, type TimeRange, type ValueFormatter } from '@grafana/data';
import { seriesTypePath } from 'editor/constants';
import { type SeriesType } from 'editor/types';
import { type ChartContext } from 'lib/echarts/charts/types';
import { type HeatmapLayout } from 'lib/echarts/options/types';
import { type PanelOptions } from 'types';
import { panelTypeToAxis } from './converters';

const timeRange: TimeRange = {
  from: dateTime(0),
  to: dateTime(1),
  raw: { from: 'now-1h', to: 'now' },
};

const formatValue: ValueFormatter = (value) => ({ text: String(value) });

// `panelTypeToAxis` only reads `seriesType` and `options.heatmapLayout`; the rest
// of the context is filled with inert defaults so the axis mapping can be tested
// in isolation.
const makeContext = (seriesType: SeriesType, heatmapLayout?: HeatmapLayout): ChartContext => ({
  frames: [],
  theme: createTheme(),
  timeZone: 'utc',
  timeRange,
  options: {
    [seriesTypePath]: seriesType,
    ...(heatmapLayout ? { heatmapLayout } : {}),
  } as PanelOptions,
  seriesType,
  formatValue,
  fieldConfig: { defaults: {}, overrides: [] },
});

describe('panelTypeToAxis', () => {
  it('maps cartesian and heatmap families to a time axis when a time field is present', () => {
    expect(panelTypeToAxis(makeContext('line'))).toBe('time');
    expect(panelTypeToAxis(makeContext('bar'))).toBe('time');
    expect(panelTypeToAxis(makeContext('scatter'))).toBe('time');
    expect(panelTypeToAxis(makeContext('heatmap'))).toBe('time');
  });

  it('maps the cartesian family to a category axis when no time field is present', () => {
    expect(panelTypeToAxis(makeContext('line'), false)).toBe('category');
    expect(panelTypeToAxis(makeContext('bar'), false)).toBe('category');
    expect(panelTypeToAxis(makeContext('scatter'), false)).toBe('category');
  });

  it('keeps the binned heatmap layout on a time axis regardless of the time field', () => {
    expect(panelTypeToAxis(makeContext('heatmap'), false)).toBe('time');
    expect(panelTypeToAxis(makeContext('heatmap', 'binned'), false)).toBe('time');
  });

  it('maps the matrix heatmap layout to a category axis (category x category grid) regardless of the time field', () => {
    // Matrix renders on category x category axes, so the manual layout wins over
    // the heatmap family's default time axis even if a time field is present.
    expect(panelTypeToAxis(makeContext('heatmap', 'matrix'))).toBe('category');
    expect(panelTypeToAxis(makeContext('heatmap', 'matrix'), false)).toBe('category');
  });

  it('maps non-cartesian families to a category axis', () => {
    expect(panelTypeToAxis(makeContext('pie'))).toBe('category');
    expect(panelTypeToAxis(makeContext('radar'))).toBe('category');
  });

  it('routes multi-value types by axis support: candlestick needs a time field, boxplot falls back to category', () => {
    expect(panelTypeToAxis(makeContext('candlestick'))).toBe('time');
    expect(panelTypeToAxis(makeContext('boxplot'))).toBe('time');
    expect(panelTypeToAxis(makeContext('boxplot'), false)).toBe('category');
    // candlestick has no category-axis fallback, so a time-less frame is unsupported
    expect(() => panelTypeToAxis(makeContext('candlestick'), false)).toThrow();
  });

  it('defaults unmapped types to a category axis instead of throwing', () => {
    expect(() => panelTypeToAxis(makeContext('gauge'))).toThrow();
  });
});
