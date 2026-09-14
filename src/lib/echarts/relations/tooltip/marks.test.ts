import { createTheme, type DataFrame, FieldType, toDataFrame } from '@grafana/data';
import { GRAPH_EDGES_WIDE, GRAPH_NODES_WIDE } from 'lib/echarts/relations/converters/contract';
import { frameToRelationsGraph } from 'lib/echarts/relations/converters/nodeGraph';
import { getRelationsTooltipMarks } from 'lib/echarts/relations/tooltip/marks';
// The reader warns when collected marks share a `field.name`, which the fixtures below do
// deliberately. Mocked so the decision is testable in `graphWide.test.ts` and silent here.
jest.mock('development', () => ({
  debug: jest.fn(),
  LOG_LEVELS: { debug: 0, info: 1, warn: 2, error: 3 },
}));

// The reader warns when collected marks share a `field.name`, which the fixtures below do
// deliberately. Mocked so the decision is testable in `graphWide.test.ts` and silent here.
jest.mock('development', () => ({
  debug: jest.fn(),
  LOG_LEVELS: { debug: 0, info: 1, warn: 2, error: 3 },
}));

const theme = createTheme();

/**
 * Two nodes with **different units**, which is the case the row form cannot express
 * at all: `mainstat` is one column, so one unit covers every node.
 */
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

/**
 * Two **parallel** edges over the same pair, each with its own unit and its own link.
 * They are why an edge is looked up by `markId` rather than by its endpoints.
 */
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

    const data = frameToRelationsGraph([nodes, edges], theme);
    const marks = getRelationsTooltipMarks(data!, theme, 'utc');

    expect(marks.nodes.get('e1')?.source.field.config.unit).toBe('ms');
    expect(marks.links.get('e1')?.source.field.config.unit).toBe('percent');
  });

  /**
   * Every node, whether or not it measures anything of its own: a node's value and the edges
   * touching it are different facts, and the tooltip now reports both (value first). The map
   * used to hold the statless nodes alone, which is where the list started.
   */

  /**
   * Every node, whether or not it measures anything of its own: a node's value and the edges
   * touching it are different facts, and the tooltip now reports both (value first). The map
   * used to hold the statless nodes alone, which is where the list started.
   */
  it('collects an adjacency list for every node', () => {
    const withStats = frameToRelationsGraph([wideNodes(), wideEdges()], theme)!;
    const derived = frameToRelationsGraph([wideEdges()], theme)!;

    expect([...getRelationsTooltipMarks(withStats, theme, 'utc').adjacency!.keys()]).toEqual(['gateway', 'db']);
    // Derived from the endpoints, and keyed the same way — the two parallel edges, from each end.
    expect([...getRelationsTooltipMarks(derived, theme, 'utc').adjacency!.keys()]).toEqual(['gateway', 'db']);
  });

  it('holds no entry for a mark with no field, so the lookup misses cleanly', () => {
    const data = frameToRelationsGraph([wideEdges()], theme);

    expect(getRelationsTooltipMarks(data!, theme, 'utc').nodes.size).toBe(0);
  });

  /**
   * The two derivations the filter footer reads, asserted directly rather than through a
   * hover: which endpoint keys a node may claim, and whether anything opted in at all.
   */

  /**
   * The two derivations the filter footer reads, asserted directly rather than through a
   * hover: which endpoint keys a node may claim, and whether anything opted in at all.
   */
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

    // The roles a node really plays, and the key each is under. `a` is only ever a source
    // and `c` only ever a target, so one list of theirs is empty — and `negate` fills it
    // from the far end of the pair they sit on. See `NodeFilterLabels`.
    it('reads each node’s endpoint keys off the edges touching it', () => {
      const marks = getRelationsTooltipMarks(frameToRelationsGraph([chain()], theme)!, theme, 'utc');

      expect([...marks.nodeFilterLabels!]).toEqual([
        ['a', { sources: ['source'], targets: [], negate: ['source', 'target'] }],
        ['b', { sources: ['source'], targets: ['target'], negate: ['source', 'target'] }],
        ['c', { sources: [], targets: ['target'], negate: ['source', 'target'] }],
        ['d', { sources: ['source'], targets: ['target'], negate: ['source', 'target'] }],
      ]);
    });

    // Any, not every: the endpoint keys are resolved response-wide, so one filterable edge
    // means the response's endpoint dimensions are filterable. Only `d-d` carries it here.
    it('takes one filterable edge as the response’s opt-in', () => {
      const marks = getRelationsTooltipMarks(frameToRelationsGraph([chain()], theme)!, theme, 'utc');

      expect(marks.endpointsFilterable).toBe(true);
    });

    it('reports no opt-in when no edge carries one', () => {
      const marks = getRelationsTooltipMarks(frameToRelationsGraph([wideEdges()], theme)!, theme, 'utc');
      const plain = { ...wideEdges(), fields: wideEdges().fields.map((field) => ({ ...field, config: {} })) };

      // `wideEdges` opts in; the same frames stripped of it do not.
      expect(marks.endpointsFilterable).toBe(true);
      expect(getRelationsTooltipMarks(frameToRelationsGraph([plain], theme)!, theme, 'utc').endpointsFilterable).toBe(
        false
      );
    });
  });
});
