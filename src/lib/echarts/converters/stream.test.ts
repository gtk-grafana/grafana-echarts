import { createDataFrame, createTheme, type FieldConfigSource, FieldMatcherID, FieldType } from '@grafana/data';
import { frameToStream, visibleStreamLayers } from './stream';

const theme = createTheme();
const noFieldConfig: FieldConfigSource = { defaults: {}, overrides: [] };

/**
 * A per-series "Hide in area" override (`byName` `custom.hideFrom.viz`) — the
 * manual shape `getHiddenSeriesNames` reads alongside the legend toggle's
 * `hideSeriesFrom` system override.
 */
const hideByName = (...names: string[]): FieldConfigSource => ({
  defaults: {},
  overrides: names.map((name) => ({
    matcher: { id: FieldMatcherID.byName, options: name },
    properties: [{ id: 'custom.hideFrom', value: { viz: true, legend: false, tooltip: false } }],
  })),
});

/** Wide frame: one time field, several numeric fields (the `TimeSeriesWide` shape). */
const wideFrame = () =>
  createDataFrame({
    fields: [
      { name: 'time', type: FieldType.time, values: [1000, 2000, 3000] },
      { name: 'debug', type: FieldType.number, values: [1, 2, 3] },
      { name: 'error', type: FieldType.number, values: [4, 5, 6] },
    ],
  });

/** One frame per series (the Prometheus/Loki `TimeSeriesMulti` shape). */
const multiFrame = (name: string, values: number[]) =>
  createDataFrame({
    name,
    fields: [
      { name: 'time', type: FieldType.time, values: [1000, 2000] },
      { name: 'Value', type: FieldType.number, values, config: { displayName: name } },
    ],
  });

/** Long frame: time + one numeric + a label column (SQL / SQL-expression shape). */
const longFrame = () =>
  createDataFrame({
    fields: [
      { name: 'time', type: FieldType.time, values: [1000, 1000, 2000, 2000] },
      { name: 'level', type: FieldType.string, values: ['error', 'warn', 'error', 'warn'] },
      { name: 'count', type: FieldType.number, values: [1, 2, 3, 4] },
    ],
  });

describe('frameToStream', () => {
  describe('fields path (wide / multi)', () => {
    it('maps each numeric field to a layer of [time, value] points', () => {
      const data = frameToStream([wideFrame()], theme, noFieldConfig);

      expect(data?.layers.map((layer) => layer.name)).toEqual(['debug', 'error']);
      expect(data?.layers[0].points).toEqual([
        [1000, 1],
        [2000, 2],
        [3000, 3],
      ]);
      // The source field rides along for the tooltip's unit/decimals + data links.
      expect(data?.layers[0].field?.name).toBe('debug');
    });

    it('merges every frame of a one-frame-per-series response, in frame order', () => {
      const data = frameToStream([multiFrame('a', [1, 2]), multiFrame('b', [3, 4])], theme, noFieldConfig);

      expect(data?.layers.map((layer) => layer.name)).toEqual(['a', 'b']);
      expect(data?.layers[1].points).toEqual([
        [1000, 3],
        [2000, 4],
      ]);
    });

    it('renders missing values as 0 rather than a gap', () => {
      const frame = createDataFrame({
        fields: [
          { name: 'time', type: FieldType.time, values: [1000, 2000, 3000] },
          { name: 'value', type: FieldType.number, values: [1, null, 3] },
        ],
      });

      // A stacked ribbon cannot break, so a null is zero-height, not a hole.
      expect(frameToStream([frame], theme, noFieldConfig)?.layers[0].points).toEqual([
        [1000, 1],
        [2000, 0],
        [3000, 3],
      ]);
    });

    it("takes each layer's color from its field's Color scheme", () => {
      const frame = createDataFrame({
        fields: [
          { name: 'time', type: FieldType.time, values: [1000, 2000] },
          {
            name: 'debug',
            type: FieldType.number,
            values: [1, 2],
            config: { color: { mode: 'fixed', fixedColor: 'red' } },
          },
          {
            name: 'error',
            type: FieldType.number,
            values: [3, 4],
            config: { color: { mode: 'fixed', fixedColor: 'blue' } },
          },
        ],
      });

      // Layer order is the emission order the series palette keys off, so the
      // colors must line up with it. Named colors resolve through the theme.
      expect(frameToStream([frame], theme, noFieldConfig)?.layers.map((layer) => layer.color)).toEqual([
        theme.visualization.getColorByName('red'),
        theme.visualization.getColorByName('blue'),
      ]);
    });
  });

  describe('labels path (long)', () => {
    it('pivots on the first string field, one layer per distinct value', () => {
      const data = frameToStream([longFrame()], theme, noFieldConfig);

      // Layer order is first appearance, which is what the series palette keys off.
      expect(data?.layers.map((layer) => layer.name)).toEqual(['error', 'warn']);
      expect(data?.layers[0].points).toEqual([
        [1000, 1],
        [2000, 3],
      ]);
      expect(data?.layers[1].points).toEqual([
        [1000, 2],
        [2000, 4],
      ]);
      // Layers are rows, not columns, so there is no single source field.
      expect(data?.layers[0].field).toBeUndefined();
    });

    it('sums duplicate (layer, time) rows', () => {
      const frame = createDataFrame({
        fields: [
          { name: 'time', type: FieldType.time, values: [1000, 1000, 2000] },
          { name: 'service', type: FieldType.string, values: ['api', 'api', 'api'] },
          { name: 'value', type: FieldType.number, values: [1, 2, 5] },
        ],
      });

      // Two segments at one timestamp have no defined baseline in a stacked
      // ribbon, so they are summed (see the converter's note on Group by).
      expect(frameToStream([frame], theme, noFieldConfig)?.layers[0].points).toEqual([
        [1000, 3],
        [2000, 5],
      ]);
    });

    it('keeps the fields path for an ambiguous frame (two numeric fields) under Auto', () => {
      const frame = createDataFrame({
        fields: [
          { name: 'time', type: FieldType.time, values: [1000, 2000] },
          { name: 'level', type: FieldType.string, values: ['error', 'warn'] },
          { name: 'count', type: FieldType.number, values: [1, 2] },
          { name: 'errors', type: FieldType.number, values: [3, 4] },
        ],
      });

      expect(frameToStream([frame], theme, noFieldConfig)?.layers.map((layer) => layer.name)).toEqual([
        'count',
        'errors',
      ]);
    });

    it('pivots that same ambiguous frame when the source is set to labels', () => {
      const frame = createDataFrame({
        fields: [
          { name: 'time', type: FieldType.time, values: [1000, 2000] },
          { name: 'level', type: FieldType.string, values: ['error', 'warn'] },
          { name: 'count', type: FieldType.number, values: [1, 2] },
          { name: 'errors', type: FieldType.number, values: [3, 4] },
        ],
      });

      // Explicit `labels` uses the first numeric field as the value.
      const data = frameToStream([frame], theme, noFieldConfig, 'labels');
      expect(data?.layers.map((layer) => layer.name)).toEqual(['error', 'warn']);
      expect(data?.layers[0].points).toEqual([[1000, 1]]);
    });

    it('reads a long frame as fields when the source is set to fields', () => {
      const data = frameToStream([longFrame()], theme, noFieldConfig, 'fields');

      expect(data?.layers.map((layer) => layer.name)).toEqual(['count']);
    });

    it('mixes both shapes in one response', () => {
      const data = frameToStream([wideFrame(), longFrame()], theme, noFieldConfig);

      // Fields-path layers first (frame then field order), then label-path layers.
      // Note the colliding 'error': the model keeps both, but ECharts derives its
      // ribbons from the name dimension and merges them into one — a documented
      // divergence (see data-plane/stream.md).
      expect(data?.layers.map((layer) => layer.name)).toEqual(['debug', 'error', 'error', 'warn']);
    });
  });

  describe('no usable data', () => {
    it('returns null without a time field', () => {
      const frame = createDataFrame({
        fields: [
          { name: 'category', type: FieldType.string, values: ['a', 'b'] },
          { name: 'value', type: FieldType.number, values: [1, 2] },
        ],
      });

      // A river is time-ordered by contract; a Numeric frame has nothing to stack along.
      expect(frameToStream([frame], theme, noFieldConfig)).toBeNull();
    });

    it('returns null without a numeric field', () => {
      const frame = createDataFrame({
        fields: [
          { name: 'time', type: FieldType.time, values: [1000, 2000] },
          { name: 'label', type: FieldType.string, values: ['a', 'b'] },
        ],
      });

      expect(frameToStream([frame], theme, noFieldConfig)).toBeNull();
    });

    it('returns null for an empty response', () => {
      expect(frameToStream([], theme, noFieldConfig)).toBeNull();
    });
  });

  describe('field config', () => {
    it('flags a layer hidden by the legend toggle but keeps it in the model', () => {
      const data = frameToStream([longFrame()], theme, hideByName('warn'));

      // Kept so the legend can grey it and toggle it back; only the series drops it.
      expect(data?.layers.map((layer) => [layer.name, layer.hidden])).toEqual([
        ['error', false],
        ['warn', true],
      ]);
      expect(visibleStreamLayers(data!).map((layer) => layer.name)).toEqual(['error']);
    });

    it('applies a byName fixed-color override to a label-path layer', () => {
      const fieldConfig: FieldConfigSource = {
        defaults: {},
        overrides: [
          {
            matcher: { id: 'byName', options: 'warn' },
            properties: [{ id: 'color', value: { mode: 'fixed', fixedColor: 'purple' } }],
          },
        ],
      };

      // Label-path layers are not fields, so Grafana's override engine cannot
      // color them — the converter reads the override by layer name instead.
      const data = frameToStream([longFrame()], theme, fieldConfig);
      expect(data?.layers[1].color).toBe('purple');
    });
  });
});
