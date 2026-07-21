import { type Field, FieldType, toDataFrame, type ValueFormatter } from '@grafana/data';
import { SortOrder } from '@grafana/schema';
import { type CallbackDataParams, type TopLevelFormatterParams } from 'echarts/types/dist/shared';
import {
  applyTooltipRowOptions,
  buildTooltipModel,
  formatTooltipValue,
  indexedFormatterResolver,
  type TooltipFieldResolver,
  type TooltipModel,
  toEmittingFormatter,
} from 'lib/echarts/tooltip/model';

// Mirrors getValueFormatter: empty values (null/undefined/NaN) render No value text.
const formatValue: ValueFormatter = (value) => ({ text: value == null || Number.isNaN(value) ? 'null' : `${value}` });
const resolveValue = () => formatValue;
const asParams = (params: unknown) => params as TopLevelFormatterParams;

describe('formatTooltipValue', () => {
  it('formats scalar numbers through the Grafana formatter', () => {
    expect(formatTooltipValue(10, formatValue)).toBe('10');
  });

  it('renders empty values as the field No value text', () => {
    expect(formatTooltipValue(null, formatValue)).toBe('null');
  });

  it('unwraps the trailing numeric from array data items', () => {
    // Cartesian [time, value] tuple and heatmap [xStart, yStart, xEnd, yEnd, value].
    expect(formatTooltipValue([1000, 42], formatValue)).toBe('42');
    expect(formatTooltipValue([1000, 10, 2000, 20, 7], formatValue)).toBe('7');
  });

  it('passes through a genuine non-numeric value (e.g. a category label)', () => {
    expect(formatTooltipValue('text', formatValue)).toBe('text');
  });
});

describe('indexedFormatterResolver', () => {
  it('selects the per-index formatter and falls back when out of range', () => {
    const fmtA: ValueFormatter = () => ({ text: 'A' });
    const fmtB: ValueFormatter = () => ({ text: 'B' });
    const fallback: ValueFormatter = () => ({ text: 'F' });
    const resolve = indexedFormatterResolver([fmtA, fmtB], fallback, 'seriesIndex');

    expect(resolve({ seriesIndex: 0 })(0).text).toBe('A');
    expect(resolve({ seriesIndex: 1 })(0).text).toBe('B');
    expect(resolve({ seriesIndex: 5 })(0).text).toBe('F');
    expect(resolve({})(0).text).toBe('F');
  });
});

describe('applyTooltipRowOptions', () => {
  const rows = [
    { name: 'A', v: 10 },
    { name: 'Z', v: 0 },
    { name: 'B', v: 30 },
    { name: 'N', v: undefined },
  ];
  const getValue = (row: { v: number | undefined }) => row.v;

  it('hides zero-value rows but keeps nulls', () => {
    const result = applyTooltipRowOptions(rows, getValue, { hideZeros: true });
    expect(result.map((row) => row.name)).toEqual(['A', 'B', 'N']);
  });

  it('sorts descending with missing numerics sinking to the end', () => {
    const result = applyTooltipRowOptions(rows, getValue, { sort: SortOrder.Descending });
    expect(result.map((row) => row.name)).toEqual(['B', 'A', 'Z', 'N']);
  });

  it('preserves input order when sort is None', () => {
    const result = applyTooltipRowOptions(rows, getValue, { sort: SortOrder.None });
    expect(result.map((row) => row.name)).toEqual(['A', 'Z', 'B', 'N']);
  });
});

describe('buildTooltipModel', () => {
  it('builds a single-item model with the item name as header', () => {
    const model = buildTooltipModel(asParams({ seriesName: 'A', name: 'x', value: 5 }), resolveValue);
    expect(model.header).toBe('x');
    expect(model.rows).toEqual([{ color: undefined, label: 'A', value: '5' }]);
  });

  it('builds an axis (All) model with the axis label as header and one row per series', () => {
    const model = buildTooltipModel(
      asParams([
        { seriesName: 'A', value: [1, 10], color: '#f00', axisValueLabel: 'x' },
        { seriesName: 'B', value: [1, 30], color: '#0f0' },
      ]),
      resolveValue
    );
    expect(model.header).toBe('x');
    expect(model.rows.map((row) => `${row.label}:${row.value}`)).toEqual(['A:10', 'B:30']);
  });

  it('applies sort and hideZeros to the rows', () => {
    const model = buildTooltipModel(
      asParams([
        { seriesName: 'A', value: [1, 10], axisValueLabel: 'x' },
        { seriesName: 'Z', value: [1, 0] },
        { seriesName: 'B', value: [1, 30] },
      ]),
      resolveValue,
      { sort: SortOrder.Descending, hideZeros: true }
    );
    expect(model.rows.map((row) => row.label)).toEqual(['B', 'A']);
  });

  it('appends the percent share for slice items', () => {
    const model = buildTooltipModel(asParams({ name: 'p', value: 5, percent: 25 }), resolveValue);
    expect(model.rows[0].value).toBe('5 (25%)');
  });

  it('resolves a footer source for a single hovered item, but not for a multi-row (All) tooltip', () => {
    const field: Field = toDataFrame({ fields: [{ name: 'v', type: FieldType.number, values: [1, 2] }] }).fields[0];
    const resolveField: TooltipFieldResolver = (item) => ({ field, rowIndex: item.dataIndex ?? 0 });

    const single = buildTooltipModel(
      asParams({ name: 'x', value: 5, dataIndex: 1 }),
      resolveValue,
      undefined,
      resolveField
    );
    expect(single.source).toEqual({ field, rowIndex: 1 });

    const all = buildTooltipModel(
      asParams([
        { seriesName: 'A', value: [1, 10], axisValueLabel: 'x' },
        { seriesName: 'B', value: [1, 30] },
      ]),
      resolveValue,
      undefined,
      resolveField
    );
    expect(all.source).toBeUndefined();
  });
});

describe('toEmittingFormatter', () => {
  it('pushes the produced model to the sink and returns an empty string', () => {
    const emitted: TooltipModel[] = [];
    const model: TooltipModel = { header: 'h', rows: [{ label: 'a', value: '1' }] };
    const formatter = toEmittingFormatter(
      () => model,
      (produced) => emitted.push(produced)
    );

    const rendered = formatter(asParams({} as CallbackDataParams));

    expect(rendered).toBe('');
    expect(emitted).toEqual([model]);
  });
});
