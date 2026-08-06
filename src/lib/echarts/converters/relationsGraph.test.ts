import { createTheme, type DataFrame, FieldType, toDataFrame } from '@grafana/data';

import { GRAPH_EDGES_WIDE, GRAPH_NODES_WIDE } from 'lib/echarts/converters/graphWide';
import { legacyToWide } from 'lib/echarts/converters/legacyToWide';
import {
  frameToRelationsGraph,
  getRelationsLinkValueField,
  getRelationsValueField,
} from 'lib/echarts/converters/relationsGraph';

const theme = createTheme();

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
    const data = frameToRelationsGraph(legacyToWide([rowEdges(), rowNodes()]), theme);

    expect(data?.nodes.map((node) => node.name)).toEqual(['Gateway', 'API', 'DB']);
    expect(data?.links.map((link) => link.id)).toEqual(['e1', 'e2']);
    // Every mark carries its own field, which is what makes it an override target.
    expect(data?.links[0].field?.name).toBe('e1');
    expect(data?.nodes[0].field?.name).toBe('a');
  });

  /**
   * The conversion has to happen above the panel to be worth anything, so a row-format
   * response reaching the panel means the pipeline is missing a step. Rendering nothing
   * would hide that; this says so instead, and names the fix. See item 12 of
   * ../../../../todo/graph-wide-migration.md.
   */
  it('reports row-format frames rather than rendering nothing', () => {
    expect(() => frameToRelationsGraph([rowEdges(), rowNodes()], theme)).toThrow(/Rows to fields/);
  });

  it('returns null for frames that are not a graph in either shape', () => {
    const series = toDataFrame({
      fields: [
        { name: 'time', type: FieldType.time, values: [1] },
        { name: 'value', type: FieldType.number, values: [2] },
      ],
    });

    // Null, not a throw: nothing to draw is the no-data view's job.
    expect(frameToRelationsGraph([series], theme)).toBeNull();
  });

  it('returns null for an empty response', () => {
    expect(frameToRelationsGraph([], theme)).toBeNull();
  });
});

describe('value field resolution', () => {
  it('finds a representative mark field either side of the frame pair', () => {
    const frames = legacyToWide([rowEdges(), rowNodes()]);

    // The nodes frame's first mark, carrying the stat column's copied formatting.
    expect(getRelationsValueField(frames)?.name).toBe('a');
    expect(getRelationsLinkValueField(frames)?.name).toBe('e1');
    expect(getRelationsLinkValueField(frames)?.config.unit).toBe('ms');
  });

  it('resolves against an edges-only response', () => {
    const frames = [
      toDataFrame({
        meta: { type: GRAPH_EDGES_WIDE },
        fields: [{ name: 'e1', type: FieldType.number, labels: { source: 'a', target: 'b' }, values: [1] }],
      }),
    ];

    expect(getRelationsValueField(frames)?.name).toBe('e1');
  });

  it('returns nothing when there is no graph to resolve against', () => {
    expect(getRelationsValueField([])).toBeUndefined();
    expect(getRelationsLinkValueField([])).toBeUndefined();
  });

  /**
   * Roles come from the same resolver the reader uses, so the two cannot disagree about
   * which frame is which — including in the case shape alone gets wrong, a node named
   * with the edge separator.
   */
  it('agrees with the reader about frame roles', () => {
    const nodes = toDataFrame({
      meta: { type: GRAPH_NODES_WIDE },
      fields: [{ name: 'a-->b', type: FieldType.number, config: { unit: 'percent' }, values: [5] }],
    });
    const edges = toDataFrame({
      meta: { type: GRAPH_EDGES_WIDE },
      fields: [{ name: 'e1', type: FieldType.number, labels: { source: 'a-->b', target: 'c' }, values: [1] }],
    });
    const frames = [nodes, edges];

    expect(getRelationsValueField(frames)?.name).toBe('a-->b');
    expect(getRelationsLinkValueField(frames)?.name).toBe('e1');
    expect(frameToRelationsGraph(frames, theme)?.links.map((link) => link.id)).toEqual(['e1']);
  });
});
