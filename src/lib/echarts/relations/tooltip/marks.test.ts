import { createTheme, type DataFrame, FieldType, toDataFrame } from '@grafana/data';
import { GRAPH_EDGES_WIDE, GRAPH_NODES_WIDE } from 'lib/echarts/relations/converters/contract';
import { frameToRelationsGraph } from 'lib/echarts/relations/converters/nodeGraph';
import { getRelationsTooltipMarks } from 'lib/echarts/relations/tooltip/marks';
jest.mock('development', () => ({
  debug: jest.fn(),
  LOG_LEVELS: { debug: 0, info: 1, warn: 2, error: 3 },
}));

jest.mock('development', () => ({
  debug: jest.fn(),
  LOG_LEVELS: { debug: 0, info: 1, warn: 2, error: 3 },
}));

const theme = createTheme();

const graphOf = (frames: DataFrame[]) => {
  const result = frameToRelationsGraph(frames, theme);
  if (result.kind !== 'data') {
    throw new Error(`fixture produced ${result.reason}`);
  }
  return result.data;
};

const wideNodes = (): DataFrame =>
  toDataFrame({
    name: 'nodes',
    meta: { type: GRAPH_NODES_WIDE },
    fields: [
      { name: 'gateway', type: FieldType.number, values: [12], config: { unit: 'ms', decimals: 1, filterable: true } },
      {
        name: 'db',
        type: FieldType.number,
        values: [0.42],
        config: { unit: 'percentunit', decimals: 0, filterable: true },
      },
    ],
  });

const wideEdges = (): DataFrame =>
  toDataFrame({
    name: 'edges',
    meta: { type: GRAPH_EDGES_WIDE },
    fields: [
      {
        name: 'e1',
        type: FieldType.number,
        labels: { source: 'gateway', target: 'db' },
        values: [3.5],
        config: {
          unit: 's',
          decimals: 2,
          filterable: true,
          links: [{ title: 'Trace e1', url: 'http://example.com/e1' }],
        },
      },
      {
        name: 'e2',
        type: FieldType.number,
        labels: { source: 'gateway', target: 'db' },
        values: [25],
        config: { unit: 'percent', decimals: 1, filterable: true },
      },
    ],
  });

describe('getRelationsTooltipMarks', () => {
  it('keys nodes and edges separately, so a shared name cannot collide', () => {
    // A node and an edge both called `e1`: legal, since they live in different frames.
    const nodes = toDataFrame({
      meta: { type: GRAPH_NODES_WIDE },
      fields: [
        { name: 'e1', type: FieldType.number, values: [1], config: { unit: 'ms', decimals: 0 } },
        { name: 'b', type: FieldType.number, values: [2] },
      ],
    });
    const edges = toDataFrame({
      meta: { type: GRAPH_EDGES_WIDE },
      fields: [
        {
          name: 'e1',
          type: FieldType.number,
          labels: { source: 'e1', target: 'b' },
          values: [5],
          config: { unit: 'percent', decimals: 0 },
        },
      ],
    });

    const marks = getRelationsTooltipMarks(graphOf([nodes, edges]), theme, 'utc');

    expect(marks.nodes.get('e1')?.source.field.config.unit).toBe('ms');
    expect(marks.links.get('e1')?.source.field.config.unit).toBe('percent');
  });

  it('collects an adjacency list for every node', () => {
    const withStats = graphOf([wideNodes(), wideEdges()]);
    const derived = graphOf([wideEdges()]);

    expect([...getRelationsTooltipMarks(withStats, theme, 'utc').adjacency!.keys()]).toEqual(['gateway', 'db']);
    // Derive both parallel edges from each endpoint.
    expect([...getRelationsTooltipMarks(derived, theme, 'utc').adjacency!.keys()]).toEqual(['gateway', 'db']);
  });

  it('holds no entry for a mark with no field, so the lookup misses cleanly', () => {
    expect(getRelationsTooltipMarks(graphOf([wideEdges()]), theme, 'utc').nodes.size).toBe(0);
  });

  describe('the filter footer’s inputs', () => {
    /** `a → b → c`, one node per role, plus a self-loop on `d`. */
    const chain = () =>
      toDataFrame({
        name: 'edges',
        meta: { type: GRAPH_EDGES_WIDE },
        fields: [
          { name: 'a-b', type: FieldType.number, labels: { source: 'a', target: 'b' }, values: [1] },
          { name: 'b-c', type: FieldType.number, labels: { source: 'b', target: 'c' }, values: [2] },
          {
            name: 'd-d',
            type: FieldType.number,
            labels: { source: 'd', target: 'd' },
            values: [3],
            config: { filterable: true },
          },
        ],
      });

    it('reads each node’s endpoint keys off the edges touching it', () => {
      const marks = getRelationsTooltipMarks(graphOf([chain()]), theme, 'utc');

      expect([...marks.nodeFilterLabels!]).toEqual([
        ['a', { sources: ['source'], targets: [] }],
        ['b', { sources: ['source'], targets: ['target'] }],
        ['c', { sources: [], targets: ['target'] }],
        ['d', { sources: ['source'], targets: ['target'] }],
      ]);
    });

    it('takes one filterable edge as the response’s opt-in', () => {
      const marks = getRelationsTooltipMarks(graphOf([chain()]), theme, 'utc');

      expect(marks.endpointsFilterable).toBe(true);
    });

    it('reports no opt-in when no edge carries one', () => {
      const marks = getRelationsTooltipMarks(graphOf([wideEdges()]), theme, 'utc');
      const plain = { ...wideEdges(), fields: wideEdges().fields.map((field) => ({ ...field, config: {} })) };

      // Only `wideEdges` metadata enables this behavior.
      expect(marks.endpointsFilterable).toBe(true);
      expect(getRelationsTooltipMarks(graphOf([plain]), theme, 'utc').endpointsFilterable).toBe(false);
    });
  });
});
