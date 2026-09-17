import { createDataFrame, FieldType, getPanelDataSummary, type DataFrame } from '@grafana/data';
import { GRAPH_NODES_WIDE } from 'lib/echarts/relations/converters/contract';
import { relationsTopology } from 'lib/echarts/relations/charts/topology';

const summaryOf = (...frames: DataFrame[]) => getPanelDataSummary(frames);

const legacyEdges = (pairs: Array<[unknown, unknown]>) =>
  createDataFrame({
    name: 'edges',
    fields: [
      { name: 'source', type: FieldType.string, values: pairs.map(([source]) => source) },
      { name: 'target', type: FieldType.string, values: pairs.map(([, target]) => target) },
    ],
  });

const legacyNodes = (ids: string[]) =>
  createDataFrame({
    name: 'nodes',
    fields: [{ name: 'id', type: FieldType.string, values: ids }],
  });

describe('relationsTopology', () => {
  it('measures a legacy graph from its longest path and declared nodes', () => {
    const summary = summaryOf(
      legacyEdges([
        ['a', 'b'],
        ['a', 'c'],
        ['b', 'd'],
        ['c', 'd'],
      ]),
      legacyNodes(['a', 'b', 'c', 'd', 'isolated'])
    );

    expect(relationsTopology(summary)).toEqual({ hasCycle: false, levels: 3, nodeCount: 5 });
  });

  it('detects cycles without counting duplicate edges twice', () => {
    const summary = summaryOf(
      legacyEdges([
        ['a', 'b'],
        ['a', 'b'],
        ['b', 'c'],
        ['c', 'a'],
      ])
    );

    expect(relationsTopology(summary)).toEqual({ hasCycle: true, levels: 1, nodeCount: 3 });
  });

  it('ignores incomplete endpoints and converts numeric endpoint values', () => {
    const summary = summaryOf(
      legacyEdges([
        [1, 2],
        ['', 3],
        [3, null],
      ])
    );

    expect(relationsTopology(summary)).toEqual({ hasCycle: false, levels: 2, nodeCount: 2 });
  });

  it('reads graph-wide edges and node fields', () => {
    const edges = createDataFrame({
      fields: [
        { name: 'time', type: FieldType.time, values: [0, 1000] },
        { name: 'a-to-b', type: FieldType.number, labels: { source: 'a', target: 'b' }, values: [1, 2] },
        { name: 'b-to-c', type: FieldType.number, labels: { source: 'b', target: 'c' }, values: [2, 1] },
      ],
    });
    const nodes = createDataFrame({
      meta: { type: GRAPH_NODES_WIDE },
      fields: [
        { name: 'a', type: FieldType.number, values: [1] },
        { name: 'b', type: FieldType.number, values: [2] },
        { name: 'c', type: FieldType.number, values: [3] },
        { name: 'isolated', type: FieldType.number, values: [4] },
      ],
    });

    expect(relationsTopology(summaryOf(edges, nodes))).toEqual({ hasCycle: false, levels: 3, nodeCount: 4 });
  });

  it('returns an empty topology for a lone legacy nodes frame', () => {
    expect(relationsTopology(summaryOf(legacyNodes(['a', 'b'])))).toEqual({
      hasCycle: false,
      levels: 0,
      nodeCount: 2,
    });
  });

  it('returns undefined when the response has no graph frames', () => {
    const frame = createDataFrame({
      fields: [{ name: 'value', type: FieldType.number, values: [1] }],
    });

    expect(relationsTopology(summaryOf(frame))).toBeUndefined();
  });
});
