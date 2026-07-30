import { createTheme, type Field, FieldType, type ValueFormatter } from '@grafana/data';
import { type CallbackDataParams } from 'echarts/types/dist/shared';
import { type StreamLayer } from 'lib/echarts/converters/stream';
import { buildStreamTooltipModel } from './stream';

const theme = createTheme();
const formatValue: ValueFormatter = (value) => ({ text: `${value} panel` });

const ctx = { theme, timeZone: 'utc', formatValue };

/** A numeric field carrying its own unit, so per-layer formatting is observable. */
const bytesField = (): Field<number> => ({
  name: 'error',
  type: FieldType.number,
  values: [3, 4],
  config: { unit: 'bytes' },
});

const layers: StreamLayer[] = [
  {
    name: 'debug',
    color: 'red',
    hidden: false,
    points: [
      [1000, 1],
      [2000, 2],
    ],
  },
  {
    name: 'error',
    color: 'blue',
    hidden: false,
    field: bytesField(),
    points: [
      [1000, 3],
      [2000, 4],
    ],
  },
];

/**
 * An item-trigger param for the flattened triple at `dataIndex`. Only the keys the
 * formatter reads are set, so the cast goes through `unknown` (a real
 * `CallbackDataParams` also carries the component identity ECharts fills in).
 */
const param = (dataIndex: number, value: [number, number, string], name: string): CallbackDataParams =>
  ({ dataIndex, value, name, seriesIndex: 0, color: 'blue' }) as unknown as CallbackDataParams;

describe('buildStreamTooltipModel', () => {
  it('reads the value dimension, not the last dimension', () => {
    const model = buildStreamTooltipModel(layers, ctx)(param(0, [1000, 1, 'debug'], 'debug'));

    // The generic tooltip model would print 'debug' here (the triple's last slot).
    expect(model.rows).toHaveLength(1);
    expect(model.rows[0]).toMatchObject({ label: 'debug', value: '1 panel', color: 'blue' });
  });

  it('puts the formatted time in the header', () => {
    const model = buildStreamTooltipModel(layers, ctx)(param(0, [1000, 1, 'debug'], 'debug'));

    expect(model.header.label).toBe('');
    expect(model.header.value).toContain('1970-01-01');
  });

  it("formats with the hovered layer's own field unit", () => {
    // dataIndex 2 is the first point of the second layer (2 points per layer).
    const model = buildStreamTooltipModel(layers, ctx)(param(2, [1000, 3, 'error'], 'error'));

    // The field's `bytes` unit, not the panel formatter's passthrough.
    expect(model.rows[0].value).toBe('3 B');
  });

  it("resolves the hovered layer's source field and row for the footer", () => {
    const model = buildStreamTooltipModel(layers, ctx)(param(3, [2000, 4, 'error'], 'error'));

    expect(model.source).toEqual({ field: expect.objectContaining({ name: 'error' }), rowIndex: 1 });
  });

  it('renders no footer for a layer with no source field (the labels path)', () => {
    const model = buildStreamTooltipModel(layers, ctx)(param(1, [2000, 2, 'debug'], 'debug'));

    expect(model.source).toBeUndefined();
  });

  it("falls back to the item's layer name for a zero-filled point", () => {
    // `ThemeRiverSeriesModel.fixData` appends synthetic `[time, 0, name]` triples
    // past the emitted data, so their dataIndex resolves to no layer.
    const model = buildStreamTooltipModel(layers, ctx)(param(99, [3000, 0, 'error'], 'error'));

    expect(model.rows[0].label).toBe('error');
    expect(model.source).toBeUndefined();
  });

  it('reads the first param of an array (axis-trigger shape)', () => {
    const model = buildStreamTooltipModel(layers, ctx)([param(0, [1000, 1, 'debug'], 'debug')]);

    expect(model.rows[0].label).toBe('debug');
  });
});
