import {
  createTheme,
  type DataFrame,
  type Field,
  FieldColorModeId,
  type FieldConfigSource,
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
  normalizeRelationsCalcs,
  RELATIONS_CALC_DEFAULT,
} from 'lib/echarts/converters/graphWide';
import { getPaletteColorByIndex } from 'lib/echarts/style';
import { applyTestFieldConfig } from 'test/fieldConfig';

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

/**
 * The real pre-panel field-config pass, so an override is matched and resolved by
 * Grafana rather than by the test. Under jest the standard property registry is empty
 * and overrides are silently dropped unless one is supplied — see `test/fieldConfig.ts`.
 */
const asPipelineWould = (frames: DataFrame[], overrides: FieldConfigSource['overrides'] = []): DataFrame[] =>
  applyTestFieldConfig(frames, { defaults: {}, overrides }, theme);

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

    expect(frameToGraphWide([frame], theme, { calcs: ['max'] })!.links[0].value).toBe(9);
    expect(frameToGraphWide([frame], theme, { calcs: ['sum'] })!.links[0].value).toBe(12);
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

describe('frameToGraphWide — edge colour', () => {
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

  it('leaves colour unset when the field carries none', () => {
    expect(frameToGraphWide([labelledEdges()], theme)!.links[0].color).toBeUndefined();
  });

  /**
   * The important half of the rule, and the one a fixture without a display processor
   * cannot show: in the host every field has `config.color` merged in from the panel's
   * registered default, which is palette-classic. Reading it would paint every edge a
   * different palette colour and defeat the series-level endpoint colouring, so a
   * palette mode counts as "nothing chosen" for an edge — but not for a node, whose
   * palette colour is exactly right.
   */
  it('ignores a palette mode on an edge and honours it on a node', () => {
    const paletted = (name: string, index: number, labels?: Record<string, string>): Field => {
      const field: Field = {
        name,
        type: FieldType.number,
        ...(labels ? { labels } : {}),
        config: { color: { mode: FieldColorModeId.PaletteClassic } },
        values: [10],
        state: { seriesIndex: index },
      };
      field.display = getDisplayProcessor({ field, theme });
      return field;
    };

    const edges = toDataFrame({ meta: { type: GRAPH_EDGES_WIDE }, fields: [] });
    edges.fields = [paletted('e1', 0, { source: 'a', target: 'b' })];
    edges.length = 1;
    const nodes = toDataFrame({ meta: { type: GRAPH_NODES_WIDE }, fields: [] });
    nodes.fields = [paletted('a', 1), paletted('b', 2)];
    nodes.length = 1;

    const data = frameToGraphWide([edges, nodes], theme)!;

    expect(data.links[0].color).toBeUndefined();
    expect(data.nodes.map((node) => node.color)).toEqual([
      getPaletteColorByIndex(1, theme),
      getPaletteColorByIndex(2, theme),
    ]);
  });

  it('honours a real colour choice on an edge', () => {
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

    expect(frameToGraphWide([frame], theme)!.links[0].color).toBe(theme.visualization.getColorByName('dark-red'));
  });

  /**
   * "Edges have no color-scheme path at all" — `relations-color-schemes.md` — closes
   * by construction rather than by a new resolver: an edge **is** a field, so an
   * ordinary `byName` override targets exactly one of them, and only that one. There
   * was never an edge equivalent of the node resolver to delete; this is the gap
   * closing because the mark became addressable.
   */
  it('lets a byName override recolour one edge, theme-resolved', () => {
    const [frame] = asPipelineWould(
      [
        toDataFrame({
          meta: { type: GRAPH_EDGES_WIDE },
          fields: [
            { name: 'e1', type: FieldType.number, labels: { source: 'a', target: 'b' }, values: [1] },
            { name: 'e2', type: FieldType.number, labels: { source: 'b', target: 'c' }, values: [2] },
          ],
        }),
      ],
      [
        {
          matcher: { id: 'byName', options: 'e2' },
          properties: [{ id: 'color', value: { mode: FieldColorModeId.Fixed, fixedColor: 'dark-red' } }],
        },
      ]
    );

    const [e1, e2] = frameToGraphWide([frame], theme)!.links;
    expect(e2.color).toBe(theme.visualization.getColorByName('dark-red'));
    // Its neighbour keeps the palette default, which for an *edge* means no per-edge
    // colour at all so the series-level endpoint mode still governs it.
    expect(e1.color).toBeUndefined();
  });
});

/**
 * The colour path, end to end. There is no resolver any more: `applyFieldOverrides`
 * runs above the panel, so whatever it decided is already on `field.display` by the
 * time the reader looks. These are the cases `makeRelationsColorResolver` used to
 * enumerate, restated against the pipeline that actually produces them.
 */
describe('frameToGraphWide — node colour', () => {
  /** Two marks, `a` and `b`, joined by the single edge below. */
  const nodesFrame = (): DataFrame =>
    toDataFrame({
      meta: { type: GRAPH_NODES_WIDE },
      fields: [
        { name: 'a', type: FieldType.number, values: [1] },
        { name: 'b', type: FieldType.number, values: [100] },
      ],
    });

  const oneEdge = (): DataFrame =>
    toDataFrame({
      meta: { type: GRAPH_EDGES_WIDE },
      fields: [{ name: 'e1', type: FieldType.number, labels: { source: 'a', target: 'b' }, values: [1] }],
    });

  /**
   * Nodes are listed **first** because `applyFieldOverrides` numbers `state.seriesIndex`
   * across the whole response, and that index is the palette slot. Role resolution reads
   * `meta.type`, not order, so the graph is the same either way.
   */
  const graph = (overrides: FieldConfigSource['overrides'] = []): DataFrame[] =>
    asPipelineWould([nodesFrame(), oneEdge()], overrides);

  const colorsOf = (frames: DataFrame[]): Array<string | undefined> =>
    frameToGraphWide(frames, theme)!.nodes.map((node) => node.color);

  /**
   * The headline capability, and the measurement the migration plan rests on: a
   * `byName` override targets **one mark**, and it arrives theme-resolved. The old
   * resolver read `fixedColor` straight out of `fieldConfig` and handed ECharts the
   * raw name, so `dark-red` painted as CSS `darkred` rather than Grafana's `#C4162A`.
   */
  it('lets a byName override recolour one node, theme-resolved', () => {
    const [a, b] = colorsOf(
      graph([
        {
          matcher: { id: 'byName', options: 'b' },
          properties: [{ id: 'color', value: { mode: FieldColorModeId.Fixed, fixedColor: 'dark-red' } }],
        },
      ])
    );

    expect(b).toBe(theme.visualization.getColorByName('dark-red'));
    expect(b).not.toBe('dark-red');
    // And only that one: its neighbour keeps its palette colour.
    expect(a).toBe(getPaletteColorByIndex(0, theme));
  });

  it('colours every node from its own value under a by-value scheme', () => {
    const [a, b] = colorsOf(
      graph([
        {
          matcher: { id: 'byType', options: 'number' },
          properties: [{ id: 'color', value: { mode: FieldColorModeId.ContinuousGrYlRd } }],
        },
      ])
    );

    // Different values, different points on the gradient — per mark, not per frame.
    expect(a).not.toBe(b);
  });

  /**
   * Grafana's own default colour mode is by-value (thresholds), but the panel
   * registers palette-classic, so "nothing configured" must stay categorical.
   */
  it('keeps an unconfigured node on the classic palette, by position', () => {
    expect(colorsOf(graph())).toEqual([getPaletteColorByIndex(0, theme), getPaletteColorByIndex(1, theme)]);
  });

  /**
   * A node **derived** from an edge's endpoints has no field, so nothing resolved a
   * colour for it. Left unset it would fall through to ECharts' own palette, which is
   * not the theme's — see `fillPaletteColors`.
   */
  it('palettes a derived node, which has no field to ask', () => {
    // `labelledEdges` is a->b, b->c: three nodes, none of them declared.
    const data = frameToGraphWide([labelledEdges()], theme)!;

    expect(data.nodes.every((node) => node.field == null)).toBe(true);
    expect(data.nodes.map((node) => node.color)).toEqual([
      getPaletteColorByIndex(0, theme),
      getPaletteColorByIndex(1, theme),
      getPaletteColorByIndex(2, theme),
    ]);
  });

  /**
   * Positions run over the *final* node list, so an endpoint the nodes frame did not
   * declare continues the palette rather than restarting it and colliding with the
   * first declared node.
   */
  it('continues the palette across appended endpoints', () => {
    const partial = toDataFrame({
      meta: { type: GRAPH_NODES_WIDE },
      fields: [{ name: 'a', type: FieldType.number, values: [5] }],
    });
    const data = frameToGraphWide([labelledEdges(), partial], theme)!;

    expect(data.nodes.map((node) => node.id)).toEqual(['a', 'b', 'c']);
    expect(new Set(data.nodes.map((node) => node.color)).size).toBe(3);
    expect(data.nodes[2].color).toBe(getPaletteColorByIndex(2, theme));
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
      ['c', 1],
    ]);
  });
});

describe('reduceOptions', () => {
  const ranged = (): DataFrame =>
    toDataFrame({
      meta: { type: GRAPH_NODES_WIDE },
      fields: [{ name: 'a', type: FieldType.number, config: { unit: 'ms' }, values: [1, 5, 9] }],
    });

  it('truncates calcs to the two stat slots a mark has', () => {
    expect(normalizeRelationsCalcs({ calcs: ['max', 'min', 'mean'] })).toEqual(['max', 'min']);
    expect(normalizeRelationsCalcs({ calcs: [] })).toEqual([RELATIONS_CALC_DEFAULT, undefined]);
    expect(normalizeRelationsCalcs(undefined)).toEqual([RELATIONS_CALC_DEFAULT, undefined]);
  });

  it('reduces the main stat with calcs[0] and the secondary with calcs[1]', () => {
    const frames = [labelledEdges(), withDisplay(ranged())];
    const data = frameToGraphWide(frames, theme, { calcs: ['max', 'min'], values: false, fields: '' })!;

    expect(data.nodes[0].value).toBe(9);
    // Formatted through the mark's *own* display processor, so it carries its own unit.
    expect(data.nodes[0].secondary).toBe('1 ms');
  });

  it('falls back to the secondarystat label when no second calc is chosen', () => {
    const frames = [labelledEdges(), ranged()];
    frames[1].fields[0].labels = { secondarystat: '12 req/s' };

    expect(frameToGraphWide(frames, theme, { calcs: ['max'], values: false, fields: '' })!.nodes[0].secondary).toBe(
      '12 req/s'
    );
  });
});

describe('mark rows', () => {
  it('points every mark with a field at row 0, and derived nodes at none', () => {
    const data = frameToGraphWide([labelledEdges()], theme)!;

    expect(data.links.map((link) => link.sourceRowIndex)).toEqual([0, 0]);
    // A derived node has no field, so there is no row for its data links either.
    expect(data.nodes.every((node) => node.sourceRowIndex === undefined && node.field === undefined)).toBe(true);
  });
});
