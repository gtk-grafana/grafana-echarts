import { createTheme, type Field, FieldType, type ValueFormatter } from '@grafana/data';
import { type CallbackDataParams } from 'echarts/types/dist/shared';
import { type StreamLayer } from 'lib/echarts/converters/stream';
import { buildStreamBubbleTooltipModel } from './streamBubble';

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
 * A hovered bubble: one series per layer, so `seriesIndex` *is* the layer. Only the
 * fields the formatter reads are set, so the cast goes through `unknown` (a real
 * `CallbackDataParams` also carries the component identity ECharts fills in).
 */
const params = (seriesIndex: number, dataIndex: number, value: [number, number]): CallbackDataParams =>
  ({
    seriesIndex,
    dataIndex,
    value,
    color: 'red',
    seriesName: layers[seriesIndex]?.name,
  }) as unknown as CallbackDataParams;

describe('buildStreamBubbleTooltipModel', () => {
  const model = buildStreamBubbleTooltipModel(layers, ctx);

  it('puts the time in the header, formatted in the dashboard time zone', () => {
    // Matches the river and core Grafana's TimeSeriesTooltip: no label, the time as
    // the header value.
    expect(model(params(0, 0, [1000, 1])).header).toEqual({ label: '', value: '1970-01-01 00:00:01' });
  });

  it('labels the row with the layer the seriesIndex points at', () => {
    // No offset arithmetic, unlike the river: one series per layer means seriesIndex
    // resolves the layer directly.
    expect(model(params(1, 0, [1000, 3])).rows[0].label).toBe('error');
  });

  it('reads the magnitude from element 1 of the pair', () => {
    // Element 0 is the axis position; a generic model reading the *last* element
    // would work here by luck, but only because the pair is exactly two long.
    expect(model(params(0, 1, [2000, 2])).rows[0].value).toBe('2 panel');
  });

  it('formats with the layer field’s own unit where there is one', () => {
    expect(model(params(1, 0, [1000, 3])).rows[0].value).toBe('3 B');
  });

  it('falls back to the panel formatter for a labels-path layer', () => {
    // A layer grouped from rows has no single source field.
    expect(model(params(0, 0, [1000, 1])).rows[0].value).toBe('1 panel');
  });

  it('carries a data-link source only for a layer with a field', () => {
    expect(model(params(1, 1, [2000, 4])).source).toEqual({ field: layers[1].field, rowIndex: 1 });
    expect(model(params(0, 1, [2000, 2])).source).toBeUndefined();
  });

  it('survives a seriesIndex with no layer behind it', () => {
    const orphan = model(params(9, 0, [1000, 1]));

    expect(orphan.rows).toHaveLength(1);
    expect(orphan.source).toBeUndefined();
  });
});
