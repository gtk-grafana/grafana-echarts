import {
  type DataFrame,
  type Field,
  FieldColorModeId,
  type FieldConfig,
  type FieldConfigSource,
  FieldType,
  getDisplayProcessor,
  ThresholdsMode,
  toDataFrame,
} from '@grafana/data';
import { RELATIONS_CALC_DEFAULT } from 'editor/relations/constants';
import { GRAPH_EDGES_WIDE, GRAPH_NODES_WIDE } from 'lib/echarts/relations/converters/contract';
import { frameToGraphWide } from 'lib/echarts/relations/converters/graphWide';
import { normalizeRelationsCalcs } from 'lib/echarts/relations/converters/markRead';
import { getPaletteColorByIndex } from 'lib/echarts/style';
import { theme, labelledEdges, namedEdges, rawSeries, valueEdges, withDisplay, asPipelineWould } from 'test/graphWide';
import { debug, LOG_LEVELS } from 'development';

jest.mock('development', () => ({
  debug: jest.fn(),
  LOG_LEVELS: { debug: 0, info: 1, warn: 2, error: 3 },
}));

const logged = (level: number): string[] =>
  jest
    .mocked(debug)
    .mock.calls.filter((call) => call[1] === level)
    .map(([message]) => message);

beforeEach(() => {
  jest.mocked(debug).mockClear();
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
          config: { custom: { lineWidth: 6, lineType: 'dashed', curveness: 0.4 } },
          values: [1],
        },
      ],
    });

    const [link] = frameToGraphWide([frame], theme)!.links;
    expect(link.width).toBe(6);
    expect(link.lineType).toBe('dashed');
    expect(link.curveness).toBe(0.4);
  });

  it('reduces the mark values with the requested calc', () => {
    const frame = toDataFrame({
      fields: [{ name: 'e1', type: FieldType.number, labels: { source: 'a', target: 'b' }, values: [1, 2, 9] }],
    });

    expect(frameToGraphWide([frame], theme, { calcs: ['max'] })!.links[0].value).toBe(9);
    expect(frameToGraphWide([frame], theme, { calcs: ['sum'] })!.links[0].value).toBe(12);
    expect(frameToGraphWide([frame], theme)!.links[0].value).toBe(2);
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
    expect(data?.nodes[1].secondaries).toEqual([{ value: '12 req/s' }]);
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
    expect(data?.nodes.map((node) => node.value)).toEqual([null, null, null]);
  });
});

describe('frameToGraphWide — edge colour', () => {
  /** Build one edge for a color configuration test. */
  const edgeWith = (color: FieldConfig['color'], config: FieldConfig = {}): DataFrame =>
    withDisplay(
      toDataFrame({
        fields: [
          {
            name: 'e1',
            type: FieldType.number,
            labels: { source: 'a', target: 'b' },
            config: { ...config, color },
            values: [1],
          },
        ],
      })
    );

  it('takes the colour the display processor resolved, per mark', () => {
    const color = frameToGraphWide([edgeWith({ mode: FieldColorModeId.Fixed, fixedColor: 'dark-red' })], theme)!
      .links[0].color;

    expect(color).toBe(theme.visualization.getColorByName('dark-red'));
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

  it('honours the other two literal-colour modes on an edge', () => {
    const shades = frameToGraphWide([edgeWith({ mode: FieldColorModeId.Shades, fixedColor: 'dark-red' })], theme)!;
    const gradient = frameToGraphWide(
      [edgeWith({ mode: FieldColorModeId.Gradient, fixedColor: 'dark-red', gradientColorTo: 'dark-blue' })],
      theme
    )!;

    expect(shades.links[0].color).toBeDefined();
    expect(gradient.links[0].color).toBeDefined();
  });

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
    expect(e1.color).toBeUndefined();
  });

  it.each([
    FieldColorModeId.PaletteClassicByName,
    FieldColorModeId.PaletteColorblind,
    'palette-categorical-next',
    'palette-invented-upstream',
  ])('leaves an edge to Link color under the %s palette', (mode) => {
    expect(frameToGraphWide([edgeWith({ mode })], theme)!.links[0].color).toBeUndefined();
  });

  it.each([FieldColorModeId.Thresholds, FieldColorModeId.ContinuousGrYlRd])(
    'lets a by-value scheme (%s) colour the edge by its own weight',
    (mode) => {
      const frame = edgeWith(
        { mode },
        {
          thresholds: {
            mode: ThresholdsMode.Absolute,
            steps: [
              { color: 'green', value: -Infinity },
              { color: 'red', value: 0.5 },
            ],
          },
          min: 0,
          max: 1,
        }
      );

      expect(frameToGraphWide([frame], theme)!.links[0].color).toBeDefined();
    }
  );

  /** Thresholds, resolved: the edge's own value picks the band, not an endpoint's. */
  it('grades an edge by its own value, not its source node', () => {
    const thresholds = {
      color: { mode: FieldColorModeId.Thresholds },
      thresholds: {
        mode: ThresholdsMode.Absolute,
        steps: [
          { color: 'green', value: -Infinity },
          { color: 'red', value: 0.5 },
        ],
      },
    };
    const edges = withDisplay(
      toDataFrame({
        meta: { type: GRAPH_EDGES_WIDE },
        fields: [
          {
            name: 'e1',
            type: FieldType.number,
            labels: { source: 'a', target: 'b' },
            config: thresholds,
            values: [0.9],
          },
          {
            name: 'e2',
            type: FieldType.number,
            labels: { source: 'a', target: 'c' },
            config: thresholds,
            values: [0.1],
          },
        ],
      })
    );

    const data = frameToGraphWide([edges], theme)!;

    expect(data.links.map((link) => link.color)).toEqual([
      theme.visualization.getColorByName('red'),
      theme.visualization.getColorByName('green'),
    ]);
  });
});

describe('frameToGraphWide — hidden marks', () => {
  const hiddenCustom = { hideFrom: { viz: true, legend: false, tooltip: false } };

  it('flags an edge whose field is hidden', () => {
    const frame = toDataFrame({
      meta: { type: GRAPH_EDGES_WIDE },
      fields: [
        { name: 'e1', type: FieldType.number, labels: { source: 'a', target: 'b' }, values: [1] },
        {
          name: 'e2',
          type: FieldType.number,
          labels: { source: 'b', target: 'c' },
          config: { custom: hiddenCustom },
          values: [2],
        },
      ],
    });

    expect(frameToGraphWide([frame], theme)!.links.map((link) => link.hidden)).toEqual([undefined, true]);
  });

  it('flags a node whose field is hidden', () => {
    const nodes = toDataFrame({
      meta: { type: GRAPH_NODES_WIDE },
      fields: [
        { name: 'a', type: FieldType.number, values: [1] },
        { name: 'b', type: FieldType.number, config: { custom: hiddenCustom }, values: [2] },
      ],
    });

    expect(frameToGraphWide([labelledEdges(), nodes], theme)!.nodes.map((node) => node.hidden)).toEqual([
      undefined,
      true,
      // `c` is derived from the edges and has no field to carry the flag.
      undefined,
    ]);
  });

  it('treats an unset or false viz flag as visible', () => {
    const frame = toDataFrame({
      meta: { type: GRAPH_EDGES_WIDE },
      fields: [
        {
          name: 'e1',
          type: FieldType.number,
          labels: { source: 'a', target: 'b' },
          config: { custom: { hideFrom: { viz: false, legend: true, tooltip: true } } },
          values: [1],
        },
      ],
    });

    expect(frameToGraphWide([frame], theme)!.links[0].hidden).toBeUndefined();
  });
});

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

  const graph = (overrides: FieldConfigSource['overrides'] = []): DataFrame[] =>
    asPipelineWould([nodesFrame(), oneEdge()], overrides);

  const colorsOf = (frames: DataFrame[]): Array<string | undefined> =>
    frameToGraphWide(frames, theme)!.nodes.map((node) => node.color);

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
    // The other node keeps its palette color.
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

    // Each mark resolves its own point on the gradient.
    expect(a).not.toBe(b);
  });

  it('keeps an unconfigured node on the classic palette, by position', () => {
    expect(colorsOf(graph())).toEqual([getPaletteColorByIndex(0, theme), getPaletteColorByIndex(1, theme)]);
  });

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

describe('reduceOptions', () => {
  const ranged = (): DataFrame =>
    toDataFrame({
      meta: { type: GRAPH_NODES_WIDE },
      fields: [{ name: 'a', type: FieldType.number, config: { unit: 'ms' }, values: [1, 5, 9] }],
    });

  it('keeps every calc, defaulting only an empty list', () => {
    expect(normalizeRelationsCalcs({ calcs: ['max', 'min', 'mean'] })).toEqual(['max', 'min', 'mean']);
    expect(normalizeRelationsCalcs({ calcs: [] })).toEqual([RELATIONS_CALC_DEFAULT]);
    expect(normalizeRelationsCalcs(undefined)).toEqual([RELATIONS_CALC_DEFAULT]);
  });

  it('reduces the main stat with calcs[0] and the secondary with calcs[1]', () => {
    const frames = [labelledEdges(), withDisplay(ranged())];
    const data = frameToGraphWide(frames, theme, { calcs: ['max', 'min'], values: false, fields: '' })!;

    expect(data.nodes[0].value).toBe(9);
    expect(data.nodes[0].secondaries).toEqual([{ calc: 'min', value: '1 ms' }]);
  });

  it('reduces one stat per calc past the first, in the order they were picked', () => {
    const frames = [labelledEdges(), withDisplay(ranged())];
    const data = frameToGraphWide(frames, theme, {
      calcs: ['max', 'min', 'mean', 'first'],
      values: false,
      fields: '',
    })!;

    expect(data.nodes[0].value).toBe(9);
    expect(data.nodes[0].secondaries).toEqual([
      { calc: 'min', value: '1 ms' },
      { calc: 'mean', value: '5 ms' },
      { calc: 'first', value: '1 ms' },
    ]);
  });

  it('skips a calc that reduces to nothing without shifting the rest', () => {
    const data = frameToGraphWide([labelledEdges(), withDisplay(ranged())], theme, {
      calcs: ['max', 'notAReducer', 'min'],
      values: false,
      fields: '',
    })!;

    expect(data.nodes[0].secondaries).toEqual([{ calc: 'min', value: '1 ms' }]);
  });

  it('falls back to the secondarystat label when no second calc is chosen', () => {
    const frames = [labelledEdges(), ranged()];
    frames[1].fields[0].labels = { secondarystat: '12 req/s' };

    expect(
      frameToGraphWide(frames, theme, { calcs: ['max'], values: false, fields: '' })!.nodes[0].secondaries
    ).toEqual([{ value: '12 req/s' }]);
  });

  it('reduces an edge secondary stat with calcs[1]', () => {
    const rangedEdges = toDataFrame({
      meta: { type: GRAPH_EDGES_WIDE },
      fields: [
        {
          name: 'e1',
          type: FieldType.number,
          config: { unit: 'ms' },
          labels: { source: 'a', target: 'b' },
          values: [1, 5, 9],
        },
      ],
    });
    const data = frameToGraphWide([withDisplay(rangedEdges)], theme, {
      calcs: ['max', 'min'],
      values: false,
      fields: '',
    })!;

    expect(data.links[0].value).toBe(9);
    // Formatted through the edge's own display processor, as a node's is.
    expect(data.links[0].secondaries).toEqual([{ calc: 'min', value: '1 ms' }]);
  });

  it('leaves an edge secondary unset when only one calc is chosen', () => {
    const data = frameToGraphWide([labelledEdges()], theme, { calcs: ['max'], values: false, fields: '' })!;

    expect(data.links[0].secondaries).toBeUndefined();
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

describe('identity across collected frames', () => {
  it('keeps field.name as the id, even when several marks share it', () => {
    const data = frameToGraphWide(valueEdges(), theme)!;

    expect(data.links.map((link) => link.id)).toEqual(['Value', 'Value', 'Value']);
    // Each mark still carries its own field, so nothing but the *name* is shared.
    expect(data.links.map((link) => link.field?.labels?.target)).toEqual(['b', 'c', 'c']);
  });

  it('gives each colliding mark its own lookup key', () => {
    const keys = frameToGraphWide(valueEdges(), theme)!.links.map((link) => link.markKey);

    expect(keys).toEqual(['a-->b', 'b-->c', 'a-->c']);
    expect(new Set(keys).size).toBe(3);
  });

  /** Build parallel edges with distinct labels. */
  it('discriminates colliding marks over one node pair by the label that tells them apart', () => {
    const data = frameToGraphWide(
      [
        rawSeries({ source: 'a', target: 'b', protocol: 'http' }, [1]),
        rawSeries({ source: 'a', target: 'b', protocol: 'grpc' }, [2]),
      ],
      theme
    )!;

    expect(data.links.map((link) => link.markKey)).toEqual(['a-->b {protocol="http"}', 'a-->b {protocol="grpc"}']);
  });

  it('leaves markKey unset when the ids are already unique', () => {
    const data = frameToGraphWide([labelledEdges()], theme)!;

    expect(data.links.every((link) => link.markKey === undefined)).toBe(true);
  });

  it('lets a byName override on the display name reach exactly one of N Value marks', () => {
    const frames = asPipelineWould(valueEdges(), [
      {
        matcher: { id: 'byName', options: '{source="b", target="c"}' },
        properties: [{ id: 'color', value: { mode: FieldColorModeId.Fixed, fixedColor: 'dark-red' } }],
      },
    ]);

    expect(frameToGraphWide(frames, theme)!.links.map((link) => link.color)).toEqual([
      undefined,
      theme.visualization.getColorByName('dark-red'),
      undefined,
    ]);
  });
});

describe('reader diagnostics', () => {
  it('notes the collection at info level, with what the first frame alone would have drawn', () => {
    frameToGraphWide(valueEdges(), theme);

    expect(logged(LOG_LEVELS.info)).toEqual([expect.stringContaining('read 3 edge(s) from 3 edges frames')]);
  });

  it('warns when collected marks share an id, and names the fix', () => {
    frameToGraphWide(valueEdges(), theme);

    expect(logged(LOG_LEVELS.warn)).toEqual([
      expect.stringContaining('Colliding edges: 3 edges with colliding names: Value'),
    ]);
  });

  it('says nothing about a single edges frame whose ids are unique', () => {
    frameToGraphWide([labelledEdges()], theme);

    expect(logged(LOG_LEVELS.info)).toEqual([]);
    expect(logged(LOG_LEVELS.warn)).toEqual([]);
  });
});
