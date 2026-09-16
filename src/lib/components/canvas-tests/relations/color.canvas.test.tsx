import {
  type FieldConfigSource,
  FieldColorModeId,
  FieldType,
  ThresholdsMode,
  toDataFrame,
  type ThresholdsConfig,
} from '@grafana/data';
import { normalizeCanvasEvents } from 'test/canvas';
import { height, width } from 'test/panel';
import { renderRelations, type RelationsVariant } from 'test/relationsCanvas';

/** Use one threshold band for each fixture mark. */
const thresholds: ThresholdsConfig = {
  mode: ThresholdsMode.Absolute,
  steps: [
    { value: -Infinity, color: 'green' },
    { value: 40, color: 'orange' },
    { value: 70, color: 'red' },
  ],
};

const colorNodes = toDataFrame({
  name: 'nodes',
  fields: [
    { name: 'id', type: FieldType.string, values: ['a', 'b', 'c'] },
    { name: 'mainstat', type: FieldType.number, values: [10, 50, 90], config: { thresholds } },
  ],
});

const colorEdges = toDataFrame({
  name: 'edges',
  fields: [
    { name: 'id', type: FieldType.string, values: ['e1', 'e2'] },
    { name: 'source', type: FieldType.string, values: ['a', 'b'] },
    { name: 'target', type: FieldType.string, values: ['b', 'c'] },
    { name: 'mainstat', type: FieldType.number, values: [20, 80], config: { thresholds } },
  ],
});

/** The scheme, addressed to every numeric field. nodes and edges alike. */
const withScheme = (color: FieldConfigSource['defaults']['color']): FieldConfigSource => ({
  defaults: {},
  overrides: [
    {
      matcher: { id: 'byType', options: 'number' },
      properties: [{ id: 'color', value: color }],
    },
  ],
});

const schemes = [
  { name: 'single color (every mark the same red)', color: { mode: FieldColorModeId.Fixed, fixedColor: 'red' } },
  {
    name: 'shades of a color (one hue, a step per mark)',
    color: { mode: FieldColorModeId.Shades, fixedColor: 'blue' },
  },
  { name: 'by value, banded (each mark in its threshold band)', color: { mode: FieldColorModeId.Thresholds } },
  {
    name: 'by value, graded (a continuous ramp over the same stats)',
    color: { mode: FieldColorModeId.ContinuousGrYlRd },
  },
  {
    name: 'color blind safe palette (a slot per mark, gradient edges)',
    color: { mode: FieldColorModeId.PaletteColorblind },
  },
];

const literalSchemes = schemes.slice(0, -1);
const paletteSchemes = schemes.slice(-1);
const variants: RelationsVariant[] = ['graph', 'sankey'];

const renderColor = (variant: RelationsVariant, color: FieldConfigSource['defaults']['color']) =>
  renderRelations({
    frames: [colorNodes, colorEdges],
    variant,
    fieldConfig: withScheme(color),
  });

describe.each(variants)('relations color (%s)', (variant) => {
  it.each(schemes)('$name', async ({ color }) => {
    const { defaultEvents, seriesEvents } = await renderColor(variant, color);

    expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
  });
});

describe('relations color (chord)', () => {
  it.each(paletteSchemes)('$name', async ({ color }) => {
    const { defaultEvents, seriesEvents } = await renderColor('chord', color);

    expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
  });

  // Integration tests assert literal chord fills without changing these old baselines.
  it.skip.each(literalSchemes)('$name', async ({ color }) => {
    const { defaultEvents, seriesEvents } = await renderColor('chord', color);

    expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
  });
});
