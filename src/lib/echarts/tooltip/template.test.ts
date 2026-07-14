import { createTheme, type ValueFormatter } from '@grafana/data';
import {
  buildTooltipContent,
  formatTooltipValue,
  indexedFormatterResolver,
  type TooltipValueFormatterResolver,
} from 'lib/echarts/tooltip/template';
import { type TopLevelFormatterParams } from 'echarts/types/dist/shared';

const theme = createTheme();
const formatValue: ValueFormatter = (value) => ({ text: value == null ? 'null' : `${value}` });
// Most tests use a single shared formatter regardless of the hovered item.
const resolveValue: TooltipValueFormatterResolver = () => formatValue;

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

describe('indexedFormatterResolver', () => {
  const a: ValueFormatter = (value) => ({ text: `a:${value}` });
  const b: ValueFormatter = (value) => ({ text: `b:${value}` });
  const fallback: ValueFormatter = (value) => ({ text: `fb:${value}` });

  it('selects the formatter at the item index for the given key', () => {
    const resolve = indexedFormatterResolver([a, b], fallback, 'seriesIndex');
    expect(resolve({ seriesIndex: 0 })(1).text).toBe('a:1');
    expect(resolve({ seriesIndex: 1 })(1).text).toBe('b:1');
  });

  it('falls back when the index is missing or out of range', () => {
    const resolve = indexedFormatterResolver([a], fallback, 'dataIndex');
    expect(resolve({})(1).text).toBe('fb:1');
    expect(resolve({ dataIndex: 5 })(1).text).toBe('fb:1');
    // Uses the wrong key: seriesIndex is ignored when keyed on dataIndex.
    expect(resolve({ seriesIndex: 0 })(1).text).toBe('fb:1');
  });
});

describe('buildTooltipContent', () => {
  it('renders an axis (multi) tooltip: shared header and one row per series', () => {
    const el = buildTooltipContent(
      asParams([
        { seriesName: 'A', value: [1000, 10], color: '#ff0000', axisValueLabel: '2020-01-01 00:00:00' },
        { seriesName: 'B', value: [1000, 20], color: '#00ff00' },
      ]),
      resolveValue,
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
      resolveValue,
      theme
    );

    expect(el.textContent).toContain('CategoryX');
    expect(el.textContent).toContain('Series');
    expect(el.textContent).toContain('42');
  });

  it('appends the slice percentage for pie items', () => {
    const el = buildTooltipContent(
      asParams({ seriesName: 'Slice', name: 'Slice', value: 30, color: '#0000ff', percent: 25 }),
      resolveValue,
      theme
    );

    expect(el.textContent).toContain('30 (25%)');
  });

  it('formats each row with its own series formatter (per-field units)', () => {
    // Two series with different units, resolved by seriesIndex.
    const bytes: ValueFormatter = (value) => ({ text: `${value}`, suffix: ' B' });
    const percent: ValueFormatter = (value) => ({ text: `${value}`, suffix: '%' });
    const resolvePerSeries: TooltipValueFormatterResolver = ({ seriesIndex }) => (seriesIndex === 1 ? percent : bytes);

    const el = buildTooltipContent(
      asParams([
        { seriesName: 'A', seriesIndex: 0, value: [1000, 10], color: '#ff0000', axisValueLabel: 'x' },
        { seriesName: 'B', seriesIndex: 1, value: [1000, 20], color: '#00ff00' },
      ]),
      resolvePerSeries,
      theme
    );

    expect(el.textContent).toContain('10 B');
    expect(el.textContent).toContain('20%');
  });
});
