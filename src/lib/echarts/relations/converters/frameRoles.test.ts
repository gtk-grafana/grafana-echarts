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

  // No datasource emits `source`/`target`; the conventional pairs are what actually arrives.
  it('detects an edges frame from a conventional endpoint pair', () => {
    const clientServer = toDataFrame({
      fields: [{ name: 'e1', type: FieldType.number, labels: { client: 'a', server: 'b' }, values: [10] }],
    });

    expect(isEdgesWideFrame(clientServer)).toBe(true);
    expect(isGraphWideFrames([clientServer])).toBe(true);
  });
});

describe('frame role resolution', () => {
  /**
   * `meta.type` first, in both directions. Without the negative half a node
   * legitimately named `a-->b` would be read as an edge, and the nodes frame would
   * become its own edges frame.
   */
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

  /**
   * The nodes frame is not "any other frame with a numeric field": a second query
   * returning an ordinary series would otherwise add a disconnected node named after
   * it. Requiring a field name that an edge refers to is the wide equivalent of the row
   * form's "a nodes frame must have an `id` column".
   */
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
      // Declared nodes keep their stat; `c`, which only the edges name, has none.
      ['c', null],
    ]);
  });
});

/**
 * The predicate behind "Show node values"'s visibility: on an edges-only response every
 * node is derived from an endpoint and carries no stat, so the switch would be a control
 * that visibly does nothing. See `hasNoNodeStats`.
 */
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

  // The important half: it answers false whenever it cannot tell, because hiding a
  // working control is worse than showing an inert one.
  it('is false for frames that are not the wide contract, and for no frames', () => {
    expect(hasNoNodeStats([])).toBe(false);
    expect(hasNoNodeStats(undefined)).toBe(false);
    expect(hasNoNodeStats([toDataFrame({ fields: [{ name: 'x', type: FieldType.number, values: [1] }] })])).toBe(false);
  });
});

describe('collecting every edges frame', () => {
  /**
   * The contract's *Multi* row variant, and the shape any labelled datasource returns with
   * no transformation at all. Each of these frames passes `isEdgesWideFrame` on its own, so
   * the old singular `.find()` drew a **one-edge graph** from a ten-series response with no
   * error, no notice and no log. The pivot that fixes the identity side cannot be relied on
   * to fix this one: `setDataTransformations` is feature-detected *and* gated behind
   * `grafana.panelPluginTransformations`, off by default, so on a stock host the reader is
   * the entire data path.
   */
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

  /**
   * Declared-wins is a **filter**, not a find — the generalisation of "picks the declared
   * edges frame over one that merely looks like edges".
   *
   * It keeps `meta.type` authoritative in the negative direction: a frame that says what it
   * is never gets mixed with frames that were only guessed at. It also keeps the reader and
   * the pivot agreeing about one response, since `longEdgeSeries` declines a whole response
   * for the same reason — so a declared frame beside raw series renders what it does today.
   */
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

  /**
   * The nodes search runs over the union of every collected frame's endpoints. Here `c` is
   * named by the **second** edges frame alone, so a search over the first frame's endpoints
   * would miss this nodes frame entirely and `c` would be derived — statless — instead of
   * keeping the stat the frame declares for it.
   */
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

  /**
   * The nodes search excludes **every** edges candidate, collected or not. The second frame
   * here is edges by its labels *and* named after an endpoint, so under the old
   * "any frame that is not the edges frame" exclusion it would have become the nodes frame —
   * turning one of the two edges into a node's stat.
   */
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

  /**
   * A mark reduces over its **own** rows, and every reducer skips nulls — so a raw series
   * gives the same number as the same series null-padded onto a pivot's shared row grid.
   * "Key on the timestamp, never the row index" binds whatever *builds* a frame; the reader
   * joins nothing.
   */
  it('reduces each mark over its own rows, however ragged', () => {
    const frames = [
      rawSeries({ source: 'a', target: 'b' }, [5]),
      rawSeries({ source: 'b', target: 'c' }, [1, null, 3, 4]),
    ];

    expect(frameToGraphWide(frames, theme, withCalc('sum'))!.links.map((link) => link.value)).toEqual([5, 8]);
    // The gap is skipped rather than averaged in as a zero: 8 / 3, not 8 / 4.
    expect(frameToGraphWide(frames, theme, withCalc('mean'))!.links.map((link) => link.value)).toEqual([5, 8 / 3]);
  });

  /**
   * A series with no samples still claimed to describe this edge, so it draws — weightless.
   * Pre-existing behaviour of the `value ?? 1` fallback, asserted because a raw multi-frame
   * response is where an empty series actually turns up.
   */
  it('draws a weightless edge for a series with no samples', () => {
    const data = frameToGraphWide([rawSeries({ source: 'a', target: 'b' }, [])], theme)!;

    expect(data.links).toHaveLength(1);
    expect(data.links[0].value).toBe(1);
  });
});

describe('collecting every nodes frame', () => {
  /**
   * The same silent drop on the nodes side: `legacyToWide` converts *every* legacy nodes
   * frame it finds, so a two-query legacy response produces two `graph-nodes-wide` frames of
   * which the reader used to read one. A node id is the ECharts graph key, so a repeated
   * declaration is a real collision rather than a display problem — response order decides.
   */
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
