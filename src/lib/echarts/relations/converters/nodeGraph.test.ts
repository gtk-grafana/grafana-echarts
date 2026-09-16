import { createTheme, type DataFrame, FieldType, toDataFrame } from '@grafana/data';

import { legacyToWide } from 'lib/echarts/relations/converters/legacyToWide';
import { frameToRelationsGraph, type RelationsGraphReadResult } from 'lib/echarts/relations/converters/nodeGraph';

import { GRAPH_EDGES_WIDE, GRAPH_NODES_WIDE } from 'lib/echarts/relations/converters/contract';
jest.mock('development', () => ({
  debug: jest.fn(),
  LOG_LEVELS: { debug: 0, info: 1, warn: 2, error: 3 },
}));

const theme = createTheme();

const graphData = (result: RelationsGraphReadResult) => {
  if (result.kind !== 'data') {
    throw new Error(`fixture produced ${result.reason}`);
  }
  return result.data;
};

const rowEdges = (): DataFrame =>
  toDataFrame({
    name: 'edges',
    fields: [
      { name: 'id', type: FieldType.string, values: ['e1', 'e2'] },
      { name: 'source', type: FieldType.string, values: ['a', 'b'] },
      { name: 'target', type: FieldType.string, values: ['b', 'c'] },
      { name: 'mainstat', type: FieldType.number, values: [10, 20], config: { unit: 'ms' } },
    ],
  });

const rowNodes = (): DataFrame =>
  toDataFrame({
    name: 'nodes',
    fields: [
      { name: 'id', type: FieldType.string, values: ['a', 'b', 'c'] },
      { name: 'title', type: FieldType.string, values: ['Gateway', 'API', 'DB'] },
      { name: 'mainstat', type: FieldType.number, values: [1, 2, 3] },
    ],
  });

describe('frameToRelationsGraph', () => {
  it('reads the field-based contract the pipeline hands it', () => {
    const data = graphData(frameToRelationsGraph(legacyToWide([rowEdges(), rowNodes()]), theme));

    expect(data.nodes.map((node) => node.name)).toEqual(['Gateway', 'API', 'DB']);
    expect(data.links.map((link) => link.id)).toEqual(['e1', 'e2']);
    // Every mark carries its own field, which is what makes it an override target.
    expect(data.links[0].field?.name).toBe('e1');
    expect(data.nodes[0].field?.name).toBe('a');
  });

  it('reports row-format frames rather than rendering nothing', () => {
    expect(frameToRelationsGraph([rowEdges(), rowNodes()], theme)).toEqual({
      kind: 'issue',
      reason: 'legacy-row-data',
    });
  });

  it('reports row-format edges when a declared nodes frame is also present', () => {
    const nodes = toDataFrame({
      meta: { type: GRAPH_NODES_WIDE },
      fields: [{ name: 'a', type: FieldType.number, values: [1] }],
    });

    expect(frameToRelationsGraph([nodes, rowEdges()], theme)).toEqual({
      kind: 'issue',
      reason: 'legacy-row-data',
    });
  });

  it('reports a normal time series as an unsupported frame shape', () => {
    const series = toDataFrame({
      fields: [
        { name: 'time', type: FieldType.time, values: [1] },
        { name: 'value', type: FieldType.number, values: [2] },
      ],
    });

    expect(frameToRelationsGraph([series], theme)).toEqual({
      kind: 'issue',
      reason: 'unsupported-frame-shape',
    });
  });

  it('reports a flame graph frame as an unsupported frame shape', () => {
    const flame = toDataFrame({
      meta: { preferredVisualisationType: 'flamegraph' },
      fields: [
        { name: 'level', type: FieldType.number, values: [0] },
        { name: 'label', type: FieldType.string, values: ['root'] },
        { name: 'value', type: FieldType.number, values: [1] },
      ],
    });

    expect(frameToRelationsGraph([flame], theme)).toEqual({
      kind: 'issue',
      reason: 'unsupported-frame-shape',
    });
  });

  it('reports a declared nodes-only response', () => {
    const nodes = toDataFrame({
      meta: { type: GRAPH_NODES_WIDE },
      fields: [{ name: 'a', type: FieldType.number, values: [1] }],
    });

    expect(frameToRelationsGraph([nodes], theme)).toEqual({ kind: 'issue', reason: 'nodes-without-edges' });
  });

  it('reports a declared edges frame without endpoints', () => {
    const edges = toDataFrame({
      meta: { type: GRAPH_EDGES_WIDE },
      fields: [{ name: 'requests', type: FieldType.number, values: [1] }],
    });

    expect(frameToRelationsGraph([edges], theme)).toEqual({ kind: 'issue', reason: 'edges-without-endpoints' });
  });

  it('reports declared custom endpoint keys that do not match field labels', () => {
    const edges = toDataFrame({
      meta: {
        type: GRAPH_EDGES_WIDE,
        custom: { graph: { sourceKey: 'client', targetKey: 'server' } },
      },
      fields: [{ name: 'requests', type: FieldType.number, labels: { source: 'a', destination: 'b' }, values: [1] }],
    });

    expect(frameToRelationsGraph([edges], theme)).toEqual({ kind: 'issue', reason: 'edges-without-endpoints' });
  });

  it('reports an empty response as unsupported for the panel-level empty path', () => {
    expect(frameToRelationsGraph([], theme)).toEqual({ kind: 'issue', reason: 'unsupported-frame-shape' });
  });
});

describe('frame roles', () => {
  it('takes a declared nodes frame as nodes, however its fields are named', () => {
    const nodes = toDataFrame({
      meta: { type: GRAPH_NODES_WIDE },
      fields: [{ name: 'a-->b', type: FieldType.number, config: { unit: 'percent' }, values: [5] }],
    });
    const edges = toDataFrame({
      meta: { type: GRAPH_EDGES_WIDE },
      fields: [{ name: 'e1', type: FieldType.number, labels: { source: 'a-->b', target: 'c' }, values: [1] }],
    });

    const data = graphData(frameToRelationsGraph([nodes, edges], theme));

    expect(data.links.map((link) => link.id)).toEqual(['e1']);
    expect(data.nodes.find((node) => node.id === 'a-->b')?.field?.config.unit).toBe('percent');
  });

  it('reads a raw multi-frame response whole, each mark with its own field', () => {
    const series = (source: string, target: string, unit: string): DataFrame =>
      toDataFrame({
        fields: [
          { name: 'Time', type: FieldType.time, values: [1700000000000] },
          { name: 'Value', type: FieldType.number, labels: { source, target }, config: { unit }, values: [1] },
        ],
      });

    const data = graphData(frameToRelationsGraph([series('a', 'b', 'ms'), series('b', 'c', 'percent')], theme));

    expect(data.links.map((link) => [link.source, link.target])).toEqual([
      ['a', 'b'],
      ['b', 'c'],
    ]);
    expect(data.links.map((link) => link.field?.config.unit)).toEqual(['ms', 'percent']);
    // The links share an id but use different lookup keys.
    expect(data.links.map((link) => link.id)).toEqual(['Value', 'Value']);
    expect(data.links.map((link) => link.markKey)).toEqual(['a-->b', 'b-->c']);
  });

  it('reads an edges-only response, deriving its nodes', () => {
    const frames = [
      toDataFrame({
        meta: { type: GRAPH_EDGES_WIDE },
        fields: [{ name: 'e1', type: FieldType.number, labels: { source: 'a', target: 'b' }, values: [1] }],
      }),
    ];

    const data = graphData(frameToRelationsGraph(frames, theme));

    expect(data.links[0].field?.name).toBe('e1');
    expect(data.nodes.every((node) => node.field === undefined)).toBe(true);
  });
});
