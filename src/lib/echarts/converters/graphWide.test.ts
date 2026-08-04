import {
  createTheme,
  type DataFrame,
  FieldColorModeId,
  FieldType,
  getDisplayProcessor,
  toDataFrame,
} from '@grafana/data';

import {
  frameToGraphWide,
  GRAPH_EDGES_WIDE,
  GRAPH_NODES_WIDE,
  isEdgesWideFrame,
  isGraphWideFrames,
} from 'lib/echarts/converters/graphWide';

const theme = createTheme();

/** Edges carried the contract's primary way: endpoints in labels. */
const labelledEdges = (): DataFrame =>
  toDataFrame({
    name: 'edges',
    meta: { type: GRAPH_EDGES_WIDE },
    fields: [
      { name: 'e1', type: FieldType.number, labels: { source: 'a', target: 'b' }, values: [10] },
      { name: 'e2', type: FieldType.number, labels: { source: 'b', target: 'c' }, values: [20] },
    ],
  });

/** Edges carried the fallback way: endpoints in the field name. */
const namedEdges = (): DataFrame =>
  toDataFrame({
    fields: [
      { name: 'a-->b', type: FieldType.number, values: [10] },
      { name: 'b-->c', type: FieldType.number, values: [20] },
    ],
  });

/** Attach the display processor `applyFieldOverrides` would have left behind. */
const withDisplay = (frame: DataFrame): DataFrame => {
  for (const field of frame.fields) {
    field.display = getDisplayProcessor({ field, theme });
  }
  return frame;
};

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
});

describe('frameToGraphWide — edges', () => {
  it('reads one link per field, with endpoints from labels', () => {
    const data = frameToGraphWide([labelledEdges()], theme);

    expect(data?.links).toEqual([
      expect.objectContaining({ id: 'e1', source: 'a', target: 'b', value: 10 }),
      expect.objectContaining({ id: 'e2', source: 'b', target: 'c', value: 20 }),
    ]);
  });

  it('falls back to splitting the field name', () => {
    const data = frameToGraphWide([namedEdges()], theme);

    expect(data?.links.map((link) => [link.source, link.target])).toEqual([
      ['a', 'b'],
      ['b', 'c'],
    ]);
  });

  it('prefers labels over the name split when a frame carries both', () => {
    const frame = toDataFrame({
      fields: [{ name: 'x-->y', type: FieldType.number, labels: { source: 'a', target: 'b' }, values: [1] }],
    });

    const [link] = frameToGraphWide([frame], theme)!.links;
    expect([link.source, link.target]).toEqual(['a', 'b']);
    // The name is still the identity, and so the override target.
    expect(link.id).toBe('x-->y');
  });

  it('splits on the first separator, so a node id may contain one', () => {
    const frame = toDataFrame({
      fields: [{ name: 'a-->b-->c', type: FieldType.number, values: [1] }],
    });

    const [link] = frameToGraphWide([frame], theme)!.links;
    expect([link.source, link.target]).toEqual(['a', 'b-->c']);
  });

  it('carries per-edge custom style', () => {
    const frame = toDataFrame({
      fields: [
        {
          name: 'e1',
          type: FieldType.number,
          labels: { source: 'a', target: 'b' },
          config: { custom: { lineWidth: 6, lineType: 'dashed' } },
          values: [1],
        },
      ],
    });

    const [link] = frameToGraphWide([frame], theme)!.links;
    expect(link.width).toBe(6);
    expect(link.lineType).toBe('dashed');
  });

  it('reduces the mark values with the requested calc', () => {
    const frame = toDataFrame({
      fields: [{ name: 'e1', type: FieldType.number, labels: { source: 'a', target: 'b' }, values: [1, 2, 9] }],
    });

    expect(frameToGraphWide([frame], theme, ['max'])!.links[0].value).toBe(9);
    expect(frameToGraphWide([frame], theme, ['sum'])!.links[0].value).toBe(12);
    // Default is lastNotNull.
    expect(frameToGraphWide([frame], theme)!.links[0].value).toBe(9);
  });

  it('carries the owning field on every link', () => {
    const [link] = frameToGraphWide([labelledEdges()], theme)!.links;
    expect(link.field?.name).toBe('e1');
  });

  it('ignores a numeric field that describes no edge', () => {
    const frame = toDataFrame({
      fields: [
        { name: 'e1', type: FieldType.number, labels: { source: 'a', target: 'b' }, values: [1] },
        { name: 'unrelated', type: FieldType.number, values: [2] },
      ],
    });

    expect(frameToGraphWide([frame], theme)!.links.map((link) => link.id)).toEqual(['e1']);
  });

  it('returns null when there is no edges frame', () => {
    const nodes = toDataFrame({
      meta: { type: GRAPH_NODES_WIDE },
      fields: [{ name: 'a', type: FieldType.number, values: [1] }],
    });

    expect(frameToGraphWide([nodes], theme)).toBeNull();
  });
});

describe('frameToGraphWide — nodes', () => {
  const nodesFrame = (): DataFrame =>
    toDataFrame({
      name: 'nodes',
      meta: { type: GRAPH_NODES_WIDE },
      fields: [
        {
          name: 'a',
          type: FieldType.number,
          config: { displayName: 'Gateway', custom: { subtitle: 'edge', nodeRadius: 30, fixedX: 1, fixedY: 2 } },
          values: [5],
        },
        { name: 'b', type: FieldType.number, labels: { secondarystat: '12 req/s' }, values: [6] },
      ],
    });

  it('reads one node per field, identified by name and titled by displayName', () => {
    const data = frameToGraphWide([labelledEdges(), nodesFrame()], theme);

    expect(data?.nodes[0]).toEqual(expect.objectContaining({ id: 'a', name: 'Gateway', value: 5 }));
    // No displayName: the id is the label.
    expect(data?.nodes[1]).toEqual(expect.objectContaining({ id: 'b', name: 'b', value: 6 }));
  });

  it('carries per-node custom style and the secondary stat label', () => {
    const data = frameToGraphWide([labelledEdges(), nodesFrame()], theme);

    expect(data?.nodes[0]).toEqual(expect.objectContaining({ subtitle: 'edge', radius: 30, fixedX: 1, fixedY: 2 }));
    expect(data?.nodes[1].secondary).toBe('12 req/s');
  });

  it('appends endpoints the nodes frame did not declare', () => {
    const partial = toDataFrame({
      meta: { type: GRAPH_NODES_WIDE },
      fields: [{ name: 'a', type: FieldType.number, values: [5] }],
    });

    const data = frameToGraphWide([labelledEdges(), partial], theme);

    expect(data?.nodes.map((node) => node.id)).toEqual(['a', 'b', 'c']);
  });

  it('derives the node set from the links when no nodes frame is present', () => {
    const data = frameToGraphWide([labelledEdges()], theme);

    expect(data?.nodes.map((node) => node.id)).toEqual(['a', 'b', 'c']);
    // Degree is the only stat derivable without a nodes frame.
    expect(data?.nodes.map((node) => node.value)).toEqual([1, 2, 1]);
  });
});

describe('frameToGraphWide — colour', () => {
  it('takes the colour the display processor resolved, per mark', () => {
    const frame = withDisplay(
      toDataFrame({
        fields: [
          {
            name: 'e1',
            type: FieldType.number,
            labels: { source: 'a', target: 'b' },
            config: { color: { mode: FieldColorModeId.Fixed, fixedColor: 'dark-red' } },
            values: [1],
          },
        ],
      })
    );

    // This is the payoff of the pivot: whatever `applyFieldOverrides` resolved onto the
    // field — a byName override, a fixed colour, a by-value scheme — arrives already
    // resolved, so no separate resolver is involved.
    expect(frameToGraphWide([frame], theme)!.links[0].color).toBe(theme.visualization.getColorByName('dark-red'));
  });

  it('falls back to the configured fixed colour when overrides have not run', () => {
    const frame = toDataFrame({
      fields: [
        {
          name: 'e1',
          type: FieldType.number,
          labels: { source: 'a', target: 'b' },
          config: { color: { mode: FieldColorModeId.Fixed, fixedColor: '#ff0000' } },
          values: [1],
        },
      ],
    });

    expect(frameToGraphWide([frame], theme)!.links[0].color).toBe('#ff0000');
  });

  it('leaves colour unset when the field carries none, so the palette still applies', () => {
    expect(frameToGraphWide([labelledEdges()], theme)!.links[0].color).toBeUndefined();
  });
});
