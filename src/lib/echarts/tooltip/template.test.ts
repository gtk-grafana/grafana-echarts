import { createTheme, type ValueFormatter } from '@grafana/data';
import { SortOrder } from '@grafana/schema';
import { type TopLevelFormatterParams } from 'echarts/types/dist/shared';
import {
  applyTooltipRowOptions,
  buildTooltipContent,
  formatTooltipValue,
  indexedFormatterResolver,
  type TooltipValueFormatterResolver,
} from 'lib/echarts/tooltip/template';

const theme = createTheme();
// Mirrors getValueFormatter: empty values (null/undefined/NaN) render No value text.
const formatValue: ValueFormatter = (value) => ({ text: value == null || Number.isNaN(value) ? 'null' : `${value}` });
// Most tests use a single shared formatter regardless of the hovered item.
const resolveValue: TooltipValueFormatterResolver = () => formatValue;

// ECharts formatter params carry more fields at runtime than the base type; the
// tests only set the ones the template reads.
const asParams = (params: unknown) => params as TopLevelFormatterParams;

describe('formatTooltipValue', () => {
  it('formats scalar numbers through the Grafana formatter', () => {
    expect(formatTooltipValue(10, formatValue)).toBe('10');
    // Genuine string categories pass through as-is.
    expect(formatTooltipValue('text', formatValue)).toBe('text');
  });

  it('routes empty values through the formatter for its No value text', () => {
    // The field formatter emits the standard "No value" text for null/undefined
    // (see getValueFormatter); here the stub returns 'null'.
    expect(formatTooltipValue(null, formatValue)).toBe('null');
    expect(formatTooltipValue(undefined, formatValue)).toBe('null');
    // A configured No value text flows through the same path.
    const dashFormatter: ValueFormatter = (value) => ({
      text: value == null || Number.isNaN(value) ? '-' : `${value}`,
    });
    expect(formatTooltipValue(null, dashFormatter)).toBe('-');
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

describe('applyTooltipRowOptions', () => {
  const rows = [
    { name: 'a', v: 3 },
    { name: 'b', v: 0 },
    { name: 'c', v: 1 },
    { name: 'd', v: undefined },
  ];
  const getValue = (row: { v?: number }) => row.v;

  it('returns the rows unchanged with no options', () => {
    expect(applyTooltipRowOptions(rows, getValue)).toEqual(rows);
  });

  it('hides only rows whose value is exactly zero, keeping nulls', () => {
    const result = applyTooltipRowOptions(rows, getValue, { hideZeros: true });
    expect(result.map((r) => r.name)).toEqual(['a', 'c', 'd']);
  });

  it('sorts ascending by value with nulls last', () => {
    const result = applyTooltipRowOptions(rows, getValue, { sort: SortOrder.Ascending });
    expect(result.map((r) => r.name)).toEqual(['b', 'c', 'a', 'd']);
  });

  it('sorts descending by value with nulls last', () => {
    const result = applyTooltipRowOptions(rows, getValue, { sort: SortOrder.Descending });
    expect(result.map((r) => r.name)).toEqual(['a', 'c', 'b', 'd']);
  });

  it('keeps original order for equal values (stable) and leaves None unsorted', () => {
    const ties = [
      { name: 'a', v: 5 },
      { name: 'b', v: 5 },
      { name: 'c', v: 5 },
    ];
    expect(applyTooltipRowOptions(ties, getValue, { sort: SortOrder.Ascending }).map((r) => r.name)).toEqual([
      'a',
      'b',
      'c',
    ]);
    expect(applyTooltipRowOptions(ties, getValue, { sort: SortOrder.None }).map((r) => r.name)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('combines hideZeros and sort', () => {
    const result = applyTooltipRowOptions(rows, getValue, { hideZeros: true, sort: SortOrder.Descending });
    expect(result.map((r) => r.name)).toEqual(['a', 'c', 'd']);
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

  it('sorts rows by value and hides zeros when row options are given (axis mode)', () => {
    const el = buildTooltipContent(
      asParams([
        { seriesName: 'A', value: [1000, 10], color: '#ff0000', axisValueLabel: 'x' },
        { seriesName: 'Z', value: [1000, 0], color: '#0000ff' },
        { seriesName: 'B', value: [1000, 30], color: '#00ff00' },
      ]),
      resolveValue,
      theme,
      { sort: SortOrder.Descending, hideZeros: true }
    );

    // Zero-value series Z is dropped; the rest are ordered B (30) then A (10).
    const labels = Array.from(el.querySelectorAll('div'))
      .map((div) => div.textContent ?? '')
      .filter((text) => text === 'A' || text === 'B' || text === 'Z');
    expect(labels).toEqual(['B', 'A']);
  });
});
