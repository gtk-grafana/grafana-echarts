import { createTheme, type ValueFormatter } from '@grafana/data';
import { buildTooltipContent, formatTooltipValue } from 'lib/echarts/tooltip/template';
import { type TopLevelFormatterParams } from 'echarts/types/dist/shared';

const theme = createTheme();
const formatValue: ValueFormatter = (value) => ({ text: value == null ? 'null' : `${value}` });

// ECharts formatter params carry more fields at runtime than the base type; the
// tests only set the ones the template reads.
const asParams = (params: unknown) => params as TopLevelFormatterParams;

describe('formatTooltipValue', () => {
  it('formats scalar numbers through the Grafana formatter', () => {
    expect(formatTooltipValue(10, formatValue)).toBe('10');
    expect(formatTooltipValue(null, formatValue)).toBe('N/A');
    expect(formatTooltipValue('text', formatValue)).toBe('text');
  });

  it('unwraps the trailing numeric from array data items', () => {
    // Cartesian [time, value] tuple and heatmap [..., value] tuple.
    expect(formatTooltipValue([1000, 42], formatValue)).toBe('42');
    expect(formatTooltipValue([1000, 10, 2000, 20, 7], formatValue)).toBe('7');
  });
});

describe('buildTooltipContent', () => {
  it('renders an axis (multi) tooltip: shared header and one row per series', () => {
    const el = buildTooltipContent(
      asParams([
        { seriesName: 'A', value: [1000, 10], color: '#ff0000', axisValueLabel: '2020-01-01 00:00:00' },
        { seriesName: 'B', value: [1000, 20], color: '#00ff00' },
      ]),
      formatValue,
      theme
    );

    expect(el.textContent).toContain('2020-01-01 00:00:00');
    expect(el.textContent).toContain('A');
    expect(el.textContent).toContain('10');
    expect(el.textContent).toContain('B');
    expect(el.textContent).toContain('20');
    // One color swatch per series.
    expect(el.querySelectorAll('span').length).toBe(2);
  });

  it('renders an item (single) tooltip: item name header, series label, and value', () => {
    const el = buildTooltipContent(
      asParams({ seriesName: 'Series', name: 'CategoryX', value: 42, color: '#0000ff' }),
      formatValue,
      theme
    );

    expect(el.textContent).toContain('CategoryX');
    expect(el.textContent).toContain('Series');
    expect(el.textContent).toContain('42');
  });

  it('appends the slice percentage for pie items', () => {
    const el = buildTooltipContent(
      asParams({ seriesName: 'Slice', name: 'Slice', value: 30, color: '#0000ff', percent: 25 }),
      formatValue,
      theme
    );

    expect(el.textContent).toContain('30 (25%)');
  });
});
