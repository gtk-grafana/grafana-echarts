import { createTheme, type DataFrame, FieldType, toDataFrame } from '@grafana/data';

import { GRAPH_EDGES_WIDE } from 'lib/echarts/converters/graphWide';
import { legacyToWide } from 'lib/echarts/converters/legacyToWide';
import {
  frameToRelationsGraph,
  getRelationsLinkValueField,
  getRelationsValueField,
} from 'lib/echarts/converters/relationsGraph';

const theme = createTheme();

const longEdges = (): DataFrame =>
  toDataFrame({
    name: 'edges',
    fields: [
      { name: 'id', type: FieldType.string, values: ['e1', 'e2'] },
      { name: 'source', type: FieldType.string, values: ['a', 'b'] },
      { name: 'target', type: FieldType.string, values: ['b', 'c'] },
      { name: 'mainstat', type: FieldType.number, values: [10, 20], config: { unit: 'ms' } },
    ],
  });

const longNodes = (): DataFrame =>
  toDataFrame({
    name: 'nodes',
    fields: [
      { name: 'id', type: FieldType.string, values: ['a', 'b', 'c'] },
      { name: 'title', type: FieldType.string, values: ['Gateway', 'API', 'DB'] },
      { name: 'mainstat', type: FieldType.number, values: [1, 2, 3] },
    ],
  });

describe('frameToRelationsGraph', () => {
  it('reads legacy frames with the long reader', () => {
    const data = frameToRelationsGraph([longEdges(), longNodes()], theme);

    expect(data?.nodes.map((node) => node.name)).toEqual(['Gateway', 'API', 'DB']);
    expect(data?.links.map((link) => link.id)).toEqual(['e1', 'e2']);
    // The long reader addresses rows, so no field is carried.
    expect(data?.links[0].field).toBeUndefined();
  });

  it('reads wide frames with the wide reader', () => {
    const data = frameToRelationsGraph(legacyToWide([longEdges(), longNodes()]), theme);

    expect(data?.links.map((link) => link.id)).toEqual(['e1', 'e2']);
    // The wide reader addresses fields, which is what makes a mark an override target.
    expect(data?.links[0].field?.name).toBe('e1');
  });

  it('produces the same graph either side of the conversion', () => {
    const fromLong = frameToRelationsGraph([longEdges(), longNodes()], theme);
    const fromWide = frameToRelationsGraph(legacyToWide([longEdges(), longNodes()]), theme);

    const shape = (data: typeof fromLong) => ({
      nodes: data?.nodes.map((node) => ({ id: node.id, name: node.name, value: node.value })),
      links: data?.links.map((link) => ({
        id: link.id,
        source: link.source,
        target: link.target,
        value: link.value,
      })),
    });

    expect(shape(fromWide)).toEqual(shape(fromLong));
  });

  it('returns null for frames that are neither', () => {
    const series = toDataFrame({
      fields: [
        { name: 'time', type: FieldType.time, values: [1] },
        { name: 'value', type: FieldType.number, values: [2] },
      ],
    });

    expect(frameToRelationsGraph([series], theme)).toBeNull();
  });
});

describe('value field resolution', () => {
  it('finds the long form stat columns', () => {
    const frames = [longEdges(), longNodes()];

    expect(getRelationsValueField(frames)?.name).toBe('mainstat');
    expect(getRelationsLinkValueField(frames)?.name).toBe('mainstat');
  });

  it('finds a representative mark field on the wide form', () => {
    const frames = legacyToWide([longEdges(), longNodes()]);

    // The nodes frame's first mark, carrying the stat column's copied formatting.
    expect(getRelationsValueField(frames)?.name).toBe('a');
    expect(getRelationsLinkValueField(frames)?.name).toBe('e1');
    expect(getRelationsLinkValueField(frames)?.config.unit).toBe('ms');
  });

  it('resolves against an edges-only wide response', () => {
    const frames = [
      toDataFrame({
        meta: { type: GRAPH_EDGES_WIDE },
        fields: [{ name: 'e1', type: FieldType.number, labels: { source: 'a', target: 'b' }, values: [1] }],
      }),
    ];

    expect(getRelationsValueField(frames)?.name).toBe('e1');
  });
});
