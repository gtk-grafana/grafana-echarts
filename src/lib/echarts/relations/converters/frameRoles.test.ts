import { FieldType, toDataFrame } from '@grafana/data';
import { GRAPH_EDGES_WIDE, GRAPH_NODES_WIDE } from 'lib/echarts/relations/converters/contract';
import { hasNoNodeStats, isEdgesWideFrame, isGraphWideFrames } from 'lib/echarts/relations/converters/frameRoles';
import { frameToGraphWide } from 'lib/echarts/relations/converters/graphWide';
import { theme, labelledEdges, namedEdges, rawSeries, valueEdges, withCalc } from 'test/graphWide';

describe('isGraphWideFrames', () => {
  it('detects an edges frame from endpoint labels', () => {
    expect(isGraphWideFrames([labelledEdges()])).toBe(true);
    expect(isEdgesWideFrame(labelledEdges())).toBe(true);
  });

  it('detects an edges frame from a `-->` field name', () => {
    expect(isGraphWideFrames([namedEdges()])).toBe(true);
  });

  it('does not claim a legacy long node-graph frame', () => {
    const long = toDataFrame({
      fields: [
        { name: 'id', type: FieldType.string, values: ['e1'] },
        { name: 'source', type: FieldType.string, values: ['a'] },
        { name: 'target', type: FieldType.string, values: ['b'] },
        { name: 'mainstat', type: FieldType.number, values: [10] },
      ],
    });

    expect(isGraphWideFrames([long])).toBe(false);
  });

  it('does not claim an ordinary numeric frame', () => {
    const series = toDataFrame({
      fields: [
        { name: 'time', type: FieldType.time, values: [1, 2] },
        { name: 'value', type: FieldType.number, values: [3, 4] },
      ],
    });

    expect(isGraphWideFrames([series])).toBe(false);
  });

  it('does not treat a lone nodes frame as a graph', () => {
    const nodes = toDataFrame({
      meta: { type: GRAPH_NODES_WIDE },
      fields: [{ name: 'a', type: FieldType.number, values: [1] }],
    });

    expect(isGraphWideFrames([nodes])).toBe(false);
  });

  // Data sources can use conventional endpoint pairs instead of `source` and `target`.
  it('detects an edges frame from a conventional endpoint pair', () => {
    const clientServer = toDataFrame({
      fields: [{ name: 'e1', type: FieldType.number, labels: { client: 'a', server: 'b' }, values: [10] }],
    });

    expect(isEdgesWideFrame(clientServer)).toBe(true);
    expect(isGraphWideFrames([clientServer])).toBe(true);
  });
});

describe('frame role resolution', () => {
  it('never claims a declared nodes frame as edges, however its fields are named', () => {
    const nodes = toDataFrame({
      meta: { type: GRAPH_NODES_WIDE },
      fields: [{ name: 'a-->b', type: FieldType.number, values: [5] }],
    });

    expect(isEdgesWideFrame(nodes)).toBe(false);
    expect(isGraphWideFrames([nodes])).toBe(false);
    expect(frameToGraphWide([nodes], theme)).toBeNull();
  });

  it('picks the declared edges frame over one that merely looks like edges', () => {
    const declared = toDataFrame({
      meta: { type: GRAPH_EDGES_WIDE },
      fields: [{ name: 'e1', type: FieldType.number, labels: { source: 'a', target: 'b' }, values: [1] }],
    });
    const lookalike = toDataFrame({
      fields: [{ name: 'x-->y', type: FieldType.number, values: [2] }],
    });

    // Listed second, and still the edges frame.
    expect(frameToGraphWide([lookalike, declared], theme)!.links.map((link) => link.id)).toEqual(['e1']);
  });

  it('does not read an unrelated frame in a mixed response as nodes', () => {
    const unrelated = toDataFrame({
      name: 'B-series',
      fields: [
        { name: 'time', type: FieldType.time, values: [1, 2] },
        { name: 'cpu', type: FieldType.number, values: [3, 4] },
      ],
    });

    const data = frameToGraphWide([namedEdges(), unrelated], theme)!;

    expect(data.nodes.map((node) => node.id)).toEqual(['a', 'b', 'c']);
  });

  it('still finds an undeclared nodes frame that names the endpoints', () => {
    const nodes = toDataFrame({
      fields: [
        { name: 'a', type: FieldType.number, values: [5] },
        { name: 'b', type: FieldType.number, values: [6] },
      ],
    });

    const data = frameToGraphWide([nodes, namedEdges()], theme)!;

    expect(data.nodes.map((node) => [node.id, node.value])).toEqual([
      ['a', 5],
      ['b', 6],
      // Declared nodes keep their stat. Derived node `c` has none.
      ['c', null],
    ]);
  });
});

describe('hasNoNodeStats', () => {
  it('is true when no nodes frame reached the panel at all', () => {
    expect(hasNoNodeStats([labelledEdges()])).toBe(true);
  });

  it('is true when the derived-node pre-pass declared them with null values', () => {
    const derived = toDataFrame({
      meta: { type: GRAPH_NODES_WIDE },
      fields: [
        { name: 'a', type: FieldType.number, values: [null] },
        { name: 'b', type: FieldType.number, values: [null] },
      ],
    });

    expect(hasNoNodeStats([labelledEdges(), derived])).toBe(true);
  });

  it('is false as soon as one node carries a value', () => {
    const mixed = toDataFrame({
      meta: { type: GRAPH_NODES_WIDE },
      fields: [
        { name: 'a', type: FieldType.number, values: [null] },
        { name: 'b', type: FieldType.number, values: [7] },
      ],
    });

    expect(hasNoNodeStats([labelledEdges(), mixed])).toBe(false);
  });

  it('is false for frames that are not the wide contract, and for no frames', () => {
    expect(hasNoNodeStats([])).toBe(false);
    expect(hasNoNodeStats(undefined)).toBe(false);
    expect(hasNoNodeStats([toDataFrame({ fields: [{ name: 'x', type: FieldType.number, values: [1] }] })])).toBe(false);
  });
});

describe('collecting every edges frame', () => {
  it('collects every frame that looks like edges', () => {
    const data = frameToGraphWide(valueEdges(), theme)!;

    // Values are the `median` default (`RELATIONS_CALC_DEFAULT`) of each edge's rows.
    expect(data.links.map((link) => [link.source, link.target, link.value])).toEqual([
      ['a', 'b', 11],
      ['b', 'c', 21],
      ['a', 'c', 31],
    ]);
    // The whole topology, rather than the first frame's single pair.
    expect(data.nodes.map((node) => node.id)).toEqual(['a', 'b', 'c']);
  });

  it('collects only the declared frames when any frame declares itself', () => {
    const declared = toDataFrame({
      meta: { type: GRAPH_EDGES_WIDE },
      fields: [{ name: 'e1', type: FieldType.number, labels: { source: 'a', target: 'b' }, values: [1] }],
    });
    const lookalike = toDataFrame({
      fields: [{ name: 'x-->y', type: FieldType.number, values: [2] }],
    });
    const raw = rawSeries({ source: 'c', target: 'd' }, [3]);

    expect(frameToGraphWide([lookalike, declared, raw], theme)!.links.map((link) => link.id)).toEqual(['e1']);
  });

  it('unions the endpoint set across every edges frame when looking for nodes', () => {
    const nodes = toDataFrame({
      fields: [{ name: 'c', type: FieldType.number, values: [6] }],
    });

    const data = frameToGraphWide(
      [rawSeries({ source: 'a', target: 'b' }, [1]), rawSeries({ source: 'b', target: 'c' }, [2]), nodes],
      theme
    )!;

    expect(data.nodes.map((node) => [node.id, node.value])).toEqual([
      ['c', 6],
      ['a', null],
      ['b', null],
    ]);
  });

  it('does not read a second edges frame as the nodes frame', () => {
    const first = toDataFrame({
      fields: [{ name: 'a-->b', type: FieldType.number, values: [1] }],
    });
    const second = toDataFrame({
      fields: [{ name: 'b', type: FieldType.number, labels: { source: 'b', target: 'c' }, values: [2] }],
    });

    const data = frameToGraphWide([first, second], theme)!;

    expect(data.links.map((link) => [link.source, link.target])).toEqual([
      ['a', 'b'],
      ['b', 'c'],
    ]);
    expect(data.nodes.map((node) => node.id)).toEqual(['a', 'b', 'c']);
    expect(data.nodes.every((node) => node.field == null)).toBe(true);
  });

  it('reduces each mark over its own rows, however ragged', () => {
    const frames = [
      rawSeries({ source: 'a', target: 'b' }, [5]),
      rawSeries({ source: 'b', target: 'c' }, [1, null, 3, 4]),
    ];

    expect(frameToGraphWide(frames, theme, withCalc('sum'))!.links.map((link) => link.value)).toEqual([5, 8]);
    // The gap is skipped rather than averaged in as a zero: 8 / 3, not 8 / 4.
    expect(frameToGraphWide(frames, theme, withCalc('mean'))!.links.map((link) => link.value)).toEqual([5, 8 / 3]);
  });

  it('draws a weightless edge for a series with no samples', () => {
    const data = frameToGraphWide([rawSeries({ source: 'a', target: 'b' }, [])], theme)!;

    expect(data.links).toHaveLength(1);
    expect(data.links[0].value).toBe(1);
  });
});

describe('collecting every nodes frame', () => {
  it('reads every nodes frame, first field per id winning', () => {
    const first = toDataFrame({
      meta: { type: GRAPH_NODES_WIDE },
      fields: [
        { name: 'a', type: FieldType.number, values: [5] },
        { name: 'b', type: FieldType.number, values: [6] },
      ],
    });
    const second = toDataFrame({
      meta: { type: GRAPH_NODES_WIDE },
      fields: [
        { name: 'b', type: FieldType.number, values: [99] },
        { name: 'c', type: FieldType.number, values: [7] },
      ],
    });

    const data = frameToGraphWide([labelledEdges(), first, second], theme)!;

    expect(data.nodes.map((node) => [node.id, node.value])).toEqual([
      ['a', 5],
      ['b', 6],
      ['c', 7],
    ]);
  });
});
