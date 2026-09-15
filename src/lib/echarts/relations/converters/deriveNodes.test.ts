import {
  createTheme,
  type DataFrame,
  FieldColorModeId,
  type FieldConfigSource,
  FieldMatcherID,
  FieldType,
  toDataFrame,
} from '@grafana/data';
import { lastValueFrom, of } from 'rxjs';

import { GRAPH_EDGES_WIDE, GRAPH_NODES_WIDE, isDerivedNodesFrame } from 'lib/echarts/relations/converters/contract';
import { deriveNodes, deriveNodesOperator } from 'lib/echarts/relations/converters/deriveNodes';
import { resolveGraphWideRoles } from 'lib/echarts/relations/converters/frameRoles';
import { frameToGraphWide } from 'lib/echarts/relations/converters/graphWide';
import { applyTestFieldConfig } from 'test/fieldConfig';

import { longToWide } from './longToWide';

const theme = createTheme();

/** Build two edges that imply three nodes. */
const wideEdges = (): DataFrame =>
  toDataFrame({
    refId: 'A',
    meta: { type: GRAPH_EDGES_WIDE },
    fields: [
      { name: 'a-->b', type: FieldType.number, labels: { source: 'a', target: 'b' }, values: [1] },
      { name: 'b-->c', type: FieldType.number, labels: { source: 'b', target: 'c' }, values: [2] },
    ],
  });

/** One frame of a labelled datasource's long response, before the pivot. */
const longEdge = (source: string, target: string): DataFrame =>
  toDataFrame({
    refId: 'A',
    fields: [
      { name: 'Time', type: FieldType.time, values: [1700000000000] },
      { name: 'Value', type: FieldType.number, labels: { source, target }, values: [10] },
    ],
  });

const fieldNames = (frame: DataFrame): string[] => frame.fields.map((field) => field.name);

/** A `byName` override carrying one standard and one custom property. */
const byName = (name: string): FieldConfigSource => ({
  defaults: {},
  overrides: [
    {
      matcher: { id: FieldMatcherID.byName, options: name },
      properties: [
        { id: 'color', value: { mode: FieldColorModeId.Fixed, fixedColor: 'red' } },
        { id: 'custom.nodeRadius', value: 40 },
      ],
    },
  ],
});

describe('deriveNodes', () => {
  it('declares every endpoint an edges-only response only implied', () => {
    const edges = wideEdges();

    const [nodes, ...rest] = deriveNodes([edges]);

    expect(nodes.meta?.type).toBe(GRAPH_NODES_WIDE);
    expect(fieldNames(nodes)).toEqual(['a', 'b', 'c']);
    // The frame the response actually carried is passed through untouched.
    expect(rest).toEqual([edges]);
    expect(rest[0]).toBe(edges);
  });

  it('gives each derived node no stat', () => {
    const [nodes] = deriveNodes([wideEdges()]);

    expect(nodes.fields.map((field) => field.values)).toEqual([[null], [null], [null]]);
    expect(nodes.length).toBe(1);
  });

  it('puts a new nodes frame first', () => {
    const out = deriveNodes([wideEdges()]);

    expect(out[0].meta?.type).toBe(GRAPH_NODES_WIDE);
  });

  it('returns the response by reference when every node is already declared', () => {
    const frames = [
      toDataFrame({
        meta: { type: GRAPH_NODES_WIDE },
        fields: [
          { name: 'a', type: FieldType.number, values: [5] },
          { name: 'b', type: FieldType.number, values: [6] },
          { name: 'c', type: FieldType.number, values: [7] },
        ],
      }),
      wideEdges(),
    ];

    expect(deriveNodes(frames)).toBe(frames);
  });

  it('returns the response by reference when it is not a graph at all', () => {
    const frames = [
      toDataFrame({
        fields: [
          { name: 'time', type: FieldType.time, values: [1] },
          { name: 'value', type: FieldType.number, values: [2] },
        ],
      }),
    ];

    expect(deriveNodes(frames)).toBe(frames);
  });

  it('appends to an existing nodes frame rather than minting a rival declared one', () => {
    const declared = toDataFrame({
      fields: [{ name: 'a', type: FieldType.number, config: { unit: 'ms' }, values: [5] }],
    });

    const out = deriveNodes([declared, wideEdges()]);

    expect(out).toHaveLength(2);
    expect(fieldNames(out[0])).toEqual(['a', 'b', 'c']);
    // Still undeclared, so it is still found the way it was found before.
    expect(out[0].meta?.type).toBeUndefined();

    const roles = resolveGraphWideRoles(out)!;
    expect(roles.nodesFrames).toHaveLength(1);
    expect(roles.nodesFrames[0].fields[0].config.unit).toBe('ms');
  });

  it('pads appended fields to the frame’s own row count', () => {
    const ranged = toDataFrame({
      meta: { type: GRAPH_NODES_WIDE },
      fields: [{ name: 'a', type: FieldType.number, values: [1, 2, 3] }],
    });

    const [nodes] = deriveNodes([ranged, wideEdges()]);

    expect(nodes.length).toBe(3);
    expect(nodes.fields.map((field) => field.values.length)).toEqual([3, 3, 3]);
  });

  it('completes the pivot’s output, which is edges only by construction', () => {
    const pivoted = longToWide([longEdge('a', 'b'), longEdge('b', 'c')]);

    const [nodes] = deriveNodes(pivoted);

    expect(nodes.meta?.type).toBe(GRAPH_NODES_WIDE);
    expect(fieldNames(nodes)).toEqual(['a', 'b', 'c']);
  });

  it('marks a frame it mints, and only that one, as a placeholder', () => {
    const declared = toDataFrame({
      meta: { type: GRAPH_NODES_WIDE },
      fields: [{ name: 'a', type: FieldType.number, values: [5] }],
    });

    expect(isDerivedNodesFrame(deriveNodes([wideEdges()])[0])).toBe(true);
    expect(isDerivedNodesFrame(deriveNodes([declared, wideEdges()])[0])).toBe(false);
  });
});

describe('a placeholder frame meeting the real nodes frame downstream', () => {
  /** Build one row per node without `meta.type`. */
  const nodeStats = (): DataFrame =>
    toDataFrame({
      refId: 'rowsToFields-B',
      fields: [
        { name: 'a', type: FieldType.number, config: { unit: 'percentunit' }, values: [0.02] },
        { name: 'b', type: FieldType.number, config: { unit: 'percentunit' }, values: [0.07] },
      ],
    });

  /** Apply the pre-pass before user transformations. */
  const asRendered = (): DataFrame[] => [...deriveNodes([wideEdges()]), nodeStats()];

  it('collects the real frame instead of letting the placeholder filter it out', () => {
    const roles = resolveGraphWideRoles(asRendered())!;

    expect(roles.nodesFrames.map((frame) => frame.refId)).toEqual(['A', 'rowsToFields-B']);
    expect(roles.nodesFrames.map(isDerivedNodesFrame)).toEqual([true, false]);
  });

  it('reads each node’s stat from the real field, not the placeholder', () => {
    const graph = frameToGraphWide(applyTestFieldConfig(asRendered(), { defaults: {}, overrides: [] }, theme), theme)!;

    expect(graph.nodes.map(({ id, value }) => [id, value])).toEqual([
      ['a', 0.02],
      ['b', 0.07],
      ['c', null],
    ]);
  });

  it('keeps the endpoint order even though the real frame arrives last', () => {
    const graph = frameToGraphWide(applyTestFieldConfig(asRendered(), { defaults: {}, overrides: [] }, theme), theme)!;

    expect(graph.nodes.map(({ id }) => id)).toEqual(['a', 'b', 'c']);
  });

  /** An endpoint the real frame does not declare still gets its placeholder field. */
  it('still declares the endpoints the real frame left out', () => {
    const frames = applyTestFieldConfig(asRendered(), byName('c'), theme);

    const node = frameToGraphWide(frames, theme)!.nodes.find(({ id }) => id === 'c')!;

    expect(node.color).toBe(theme.visualization.getColorByName('red'));
    expect(node.radius).toBe(40);
  });
});

describe('deriveNodes and the reader agree', () => {
  it('derives the same nodes, in the same order, as the reader’s fallback', () => {
    const fallback = frameToGraphWide([wideEdges()], theme)!;
    const prePass = frameToGraphWide(deriveNodes([wideEdges()]), theme)!;

    expect(prePass.nodes.map((node) => node.id)).toEqual(fallback.nodes.map((node) => node.id));
    expect(prePass.links.map((link) => link.id)).toEqual(fallback.links.map((link) => link.id));
  });

  it('paints the nodes the colours the fallback already paints them', () => {
    const fallback = frameToGraphWide(applyTestFieldConfig([wideEdges()], undefined, theme), theme)!;
    const prePass = frameToGraphWide(applyTestFieldConfig(deriveNodes([wideEdges()]), undefined, theme), theme)!;

    expect(prePass.nodes.map((node) => node.color)).toEqual(fallback.nodes.map((node) => node.color));
  });

  /** Each derived node now has a field for overrides. */
  it('turns each node into a mark with a field of its own', () => {
    const fallback = frameToGraphWide([wideEdges()], theme)!;
    const prePass = frameToGraphWide(deriveNodes([wideEdges()]), theme)!;

    expect(fallback.nodes.map((node) => node.field)).toEqual([undefined, undefined, undefined]);
    expect(prePass.nodes.map((node) => node.field?.name)).toEqual(['a', 'b', 'c']);
    // `field.name` *is* the node id, so a `byName` override addresses exactly this node.
    expect(prePass.nodes.every((node) => node.field?.name === node.id)).toBe(true);
  });

  it('leaves the derived nodes statless, so no link count reaches a value slot', () => {
    const prePass = frameToGraphWide(deriveNodes([wideEdges()]), theme)!;

    expect(prePass.nodes.map((node) => node.value)).toEqual([null, null, null]);
  });
});

describe('a derived node under applyFieldOverrides', () => {
  it('takes a byName colour and per-mark config, like any other mark', () => {
    const frames = applyTestFieldConfig(deriveNodes([wideEdges()]), byName('b'), theme);

    const node = frameToGraphWide(frames, theme)!.nodes.find(({ id }) => id === 'b')!;

    expect(node.color).toBe(theme.visualization.getColorByName('red'));
    expect(node.radius).toBe(40);
  });

  /** The control: the same override against the same response with the pass skipped. */
  it('is unreachable by that override without the pre-pass', () => {
    const frames = applyTestFieldConfig([wideEdges()], byName('b'), theme);

    const node = frameToGraphWide(frames, theme)!.nodes.find(({ id }) => id === 'b')!;

    expect(node.field).toBeUndefined();
    expect(node.radius).toBeUndefined();
    expect(node.color).not.toBe(theme.visualization.getColorByName('red'));
  });
});

describe('deriveNodesOperator', () => {
  it('derives through the rx pipeline the host runs it in', async () => {
    const ctx = { interpolate: (value: string) => value };

    const out = await lastValueFrom(of([wideEdges()]).pipe(deriveNodesOperator(ctx)));

    expect(out).toHaveLength(2);
    expect(fieldNames(out[0])).toEqual(['a', 'b', 'c']);
  });
});
