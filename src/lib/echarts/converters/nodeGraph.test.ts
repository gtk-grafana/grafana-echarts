import { createTheme, type DataFrame, FieldType, toDataFrame } from '@grafana/data';
import {
  frameToNodeGraph,
  getNodeGraphValueField,
  isEdgesFrame,
  isNodeGraphFrames,
  isNodesFrame,
} from 'lib/echarts/converters/nodeGraph';

const theme = createTheme();

/** The canonical edges frame: `id` + `source` + `target` plus a numeric weight. */
const edgesFrame = (): DataFrame =>
  toDataFrame({
    name: 'edges',
    refId: 'edges',
    fields: [
      { name: 'id', type: FieldType.string, values: ['e1', 'e2'] },
      { name: 'source', type: FieldType.string, values: ['a', 'b'] },
      { name: 'target', type: FieldType.string, values: ['b', 'c'] },
      { name: 'mainstat', type: FieldType.number, values: [10, 20] },
    ],
  });

const nodesFrame = (): DataFrame =>
  toDataFrame({
    name: 'nodes',
    refId: 'nodes',
    fields: [
      { name: 'id', type: FieldType.string, values: ['a', 'b', 'c'] },
      { name: 'title', type: FieldType.string, values: ['Gateway', 'API', 'DB'] },
      { name: 'subtitle', type: FieldType.string, values: ['edge', 'svc', 'store'] },
      { name: 'mainstat', type: FieldType.number, values: [1, 2, 3] },
    ],
  });

describe('isEdgesFrame / isNodesFrame', () => {
  it('classifies a frame with source and target as edges', () => {
    expect(isEdgesFrame(edgesFrame())).toBe(true);
    expect(isNodesFrame(edgesFrame())).toBe(false);
  });

  it('classifies a frame with id but no source/target as nodes', () => {
    expect(isNodesFrame(nodesFrame())).toBe(true);
    expect(isEdgesFrame(nodesFrame())).toBe(false);
  });

  it('matches field names case-insensitively, as Grafana does', () => {
    const upper = toDataFrame({
      fields: [
        { name: 'ID', type: FieldType.string, values: ['e1'] },
        { name: 'Source', type: FieldType.string, values: ['a'] },
        { name: 'TARGET', type: FieldType.string, values: ['b'] },
      ],
    });
    expect(isEdgesFrame(upper)).toBe(true);
  });

  it('does not treat a table with only a source column as edges', () => {
    // `target` is required too — Grafana's own role test keys on `source` alone,
    // but that runs only after the node graph panel is already chosen.
    const notEdges = toDataFrame({
      fields: [
        { name: 'source', type: FieldType.string, values: ['a'] },
        { name: 'count', type: FieldType.number, values: [1] },
      ],
    });
    expect(isEdgesFrame(notEdges)).toBe(false);
  });

  it('does not treat an id-less frame as nodes', () => {
    const plain = toDataFrame({ fields: [{ name: 'name', type: FieldType.string, values: ['a'] }] });
    expect(isNodesFrame(plain)).toBe(false);
  });
});

describe('isNodeGraphFrames', () => {
  it('is true when an edges frame is present', () => {
    expect(isNodeGraphFrames([nodesFrame(), edgesFrame()])).toBe(true);
  });

  it('is false for a nodes frame alone — that is a table, not a graph', () => {
    expect(isNodeGraphFrames([nodesFrame()])).toBe(false);
  });

  it('is false for unrelated frames and for no frames', () => {
    const timeSeries = toDataFrame({
      fields: [
        { name: 'time', type: FieldType.time, values: [0, 1] },
        { name: 'value', type: FieldType.number, values: [1, 2] },
      ],
    });
    expect(isNodeGraphFrames([timeSeries])).toBe(false);
    expect(isNodeGraphFrames([])).toBe(false);
  });

  it('detects frames that carry no metadata at all (CSV / SQL Expression shape)', () => {
    // Provisioned `csv_content` fixtures and SQL Expression outputs cannot set
    // `meta.preferredVisualisationType` and are named by refId, so field shape is
    // the only surviving signal.
    const bare = toDataFrame({
      refId: 'B',
      fields: [
        { name: 'id', type: FieldType.string, values: ['x'] },
        { name: 'source', type: FieldType.string, values: ['a'] },
        { name: 'target', type: FieldType.string, values: ['b'] },
      ],
    });
    expect(isNodeGraphFrames([bare])).toBe(true);
  });
});

describe('frameToNodeGraph', () => {
  describe('nodes + edges pair', () => {
    it('maps nodes and links, using title as the display name and id as the key', () => {
      const result = frameToNodeGraph([nodesFrame(), edgesFrame()], theme);
      expect(result).not.toBeNull();
      expect(result!.nodes).toMatchObject([
        { id: 'a', name: 'Gateway', subtitle: 'edge', value: 1, sourceRowIndex: 0 },
        { id: 'b', name: 'API', subtitle: 'svc', value: 2, sourceRowIndex: 1 },
        { id: 'c', name: 'DB', subtitle: 'store', value: 3, sourceRowIndex: 2 },
      ]);
      expect(result!.links).toMatchObject([
        { id: 'e1', source: 'a', target: 'b', value: 10, sourceRowIndex: 0 },
        { id: 'e2', source: 'b', target: 'c', value: 20, sourceRowIndex: 1 },
      ]);
    });

    it('appends endpoints missing from the nodes frame so their edges survive', () => {
      // ECharts' `addEdge` silently fails when an endpoint is not a known node, so
      // an incomplete nodes frame would otherwise drop edges.
      const partialNodes = toDataFrame({
        fields: [{ name: 'id', type: FieldType.string, values: ['a'] }],
      });
      const result = frameToNodeGraph([partialNodes, edgesFrame()], theme);
      expect(result!.nodes.map((node) => node.id)).toEqual(['a', 'b', 'c']);
      expect(result!.links).toHaveLength(2);
    });
  });

  describe('edges only', () => {
    it('derives the node set and degree from the links', () => {
      // Grafana computes nodes from edges when no nodes frame is supplied; TestData's
      // `nodes.type: "random edges"` is exactly this shape.
      const result = frameToNodeGraph([edgesFrame()], theme);
      expect(result!.nodes).toMatchObject([
        // a: 1 edge, b: 2 edges (target of e1, source of e2), c: 1 edge.
        { id: 'a', name: 'a', value: 1 },
        { id: 'b', name: 'b', value: 2 },
        { id: 'c', name: 'c', value: 1 },
      ]);
      // Derived nodes have no backing row, so no footer data links.
      expect(result!.nodes.every((node) => node.sourceRowIndex === undefined)).toBe(true);
    });

    it('orders derived nodes by first appearance, for stable palette colors', () => {
      const reordered = toDataFrame({
        fields: [
          { name: 'source', type: FieldType.string, values: ['z', 'm'] },
          { name: 'target', type: FieldType.string, values: ['m', 'a'] },
        ],
      });
      expect(frameToNodeGraph([reordered], theme)!.nodes.map((node) => node.id)).toEqual(['z', 'm', 'a']);
    });
  });

  describe('link weight fallback chain', () => {
    it('prefers a numeric mainstat', () => {
      const result = frameToNodeGraph([edgesFrame()], theme);
      expect(result!.links.map((link) => link.value)).toEqual([10, 20]);
    });

    it('falls back to thickness when mainstat is a string', () => {
      // `mainstat` may legitimately be a string per the frame spec, so it cannot be
      // coerced — sankey/chord need a real number or their ribbons collapse.
      const frame = toDataFrame({
        fields: [
          { name: 'source', type: FieldType.string, values: ['a'] },
          { name: 'target', type: FieldType.string, values: ['b'] },
          { name: 'mainstat', type: FieldType.string, values: ['12ms'] },
          { name: 'thickness', type: FieldType.number, values: [7] },
        ],
      });
      const result = frameToNodeGraph([frame], theme);
      expect(result!.links[0]).toMatchObject({ value: 7, width: 7 });
    });

    it('falls back to 1 when neither is numeric', () => {
      const frame = toDataFrame({
        fields: [
          { name: 'source', type: FieldType.string, values: ['a'] },
          { name: 'target', type: FieldType.string, values: ['b'] },
        ],
      });
      expect(frameToNodeGraph([frame], theme)!.links[0].value).toBe(1);
    });
  });

  describe('optional edge and node fields', () => {
    it('reads edge color, thickness and strokedasharray', () => {
      const frame = toDataFrame({
        fields: [
          { name: 'source', type: FieldType.string, values: ['a'] },
          { name: 'target', type: FieldType.string, values: ['b'] },
          { name: 'thickness', type: FieldType.number, values: [3] },
          { name: 'color', type: FieldType.string, values: ['cyan'] },
          { name: 'strokedasharray', type: FieldType.string, values: ['5 5'] },
        ],
      });
      expect(frameToNodeGraph([frame], theme)!.links[0]).toMatchObject({
        color: 'cyan',
        width: 3,
        dashArray: '5 5',
      });
    });

    it('reads node radius, color, secondarystat and fixed coordinates', () => {
      const nodes = toDataFrame({
        fields: [
          { name: 'id', type: FieldType.string, values: ['a'] },
          { name: 'noderadius', type: FieldType.number, values: [40] },
          { name: 'color', type: FieldType.string, values: ['red'] },
          { name: 'secondarystat', type: FieldType.string, values: ['16gbRAM'] },
          { name: 'fixedx', type: FieldType.number, values: [100] },
          { name: 'fixedy', type: FieldType.number, values: [200] },
        ],
      });
      const edges = toDataFrame({
        fields: [
          { name: 'source', type: FieldType.string, values: ['a'] },
          { name: 'target', type: FieldType.string, values: ['b'] },
        ],
      });
      expect(frameToNodeGraph([nodes, edges], theme)!.nodes[0]).toMatchObject({
        radius: 40,
        color: 'red',
        secondary: '16gbRAM',
        fixedX: 100,
        fixedY: 200,
      });
    });

    it('ignores a numeric node color, leaving it to the field color scheme', () => {
      // A numeric `color` means "shade me by value per field.config.color.mode",
      // which the options layer resolves instead of the converter.
      const nodes = toDataFrame({
        fields: [
          { name: 'id', type: FieldType.string, values: ['a'] },
          { name: 'color', type: FieldType.number, values: [0.5] },
        ],
      });
      const edges = toDataFrame({
        fields: [
          { name: 'source', type: FieldType.string, values: ['a'] },
          { name: 'target', type: FieldType.string, values: ['b'] },
        ],
      });
      expect(frameToNodeGraph([nodes, edges], theme)!.nodes[0].color).toBeUndefined();
    });

    it('approximates arc__* with the dominant section color', () => {
      // No ECharts relationship series can draw a multi-section ring, so only the
      // largest section's color survives — the proportions are lost by design.
      const nodes = toDataFrame({
        fields: [
          { name: 'id', type: FieldType.string, values: ['a'] },
          { name: 'arc__success', type: FieldType.number, values: [0.9], config: { color: { fixedColor: 'green' } } },
          { name: 'arc__errors', type: FieldType.number, values: [0.1], config: { color: { fixedColor: 'red' } } },
        ],
      });
      const edges = toDataFrame({
        fields: [
          { name: 'source', type: FieldType.string, values: ['a'] },
          { name: 'target', type: FieldType.string, values: ['b'] },
        ],
      });
      expect(frameToNodeGraph([nodes, edges], theme)!.nodes[0].borderColor).toBe('green');
    });

    it('prefers an explicit node color over the arc approximation', () => {
      // The field spec says `color` and `arc__*` must not be combined; if both are
      // present the single color wins and no border is drawn.
      const nodes = toDataFrame({
        fields: [
          { name: 'id', type: FieldType.string, values: ['a'] },
          { name: 'color', type: FieldType.string, values: ['blue'] },
          { name: 'arc__success', type: FieldType.number, values: [1], config: { color: { fixedColor: 'green' } } },
        ],
      });
      const edges = toDataFrame({
        fields: [
          { name: 'source', type: FieldType.string, values: ['a'] },
          { name: 'target', type: FieldType.string, values: ['b'] },
        ],
      });
      const node = frameToNodeGraph([nodes, edges], theme)!.nodes[0];
      expect(node.color).toBe('blue');
      expect(node.borderColor).toBeUndefined();
    });

    it('synthesises a link id when the edges frame has none', () => {
      const frame = toDataFrame({
        fields: [
          { name: 'source', type: FieldType.string, values: ['a'] },
          { name: 'target', type: FieldType.string, values: ['b'] },
        ],
      });
      expect(frameToNodeGraph([frame], theme)!.links[0].id).toBe('a--b');
    });
  });

  describe('no usable data', () => {
    it('returns null with no frames and with no edges frame', () => {
      expect(frameToNodeGraph([], theme)).toBeNull();
      expect(frameToNodeGraph([nodesFrame()], theme)).toBeNull();
    });

    it('returns null when every edge row is missing an endpoint', () => {
      const frame = toDataFrame({
        fields: [
          { name: 'source', type: FieldType.string, values: [null, ''] },
          { name: 'target', type: FieldType.string, values: ['b', null] },
        ],
      });
      expect(frameToNodeGraph([frame], theme)).toBeNull();
    });

    it('drops only the incomplete rows when some edges are valid', () => {
      const frame = toDataFrame({
        fields: [
          { name: 'source', type: FieldType.string, values: ['a', null] },
          { name: 'target', type: FieldType.string, values: ['b', 'c'] },
        ],
      });
      const result = frameToNodeGraph([frame], theme);
      expect(result!.links).toHaveLength(1);
      expect(result!.links[0]).toMatchObject({ source: 'a', target: 'b' });
    });
  });
});

describe('getNodeGraphValueField', () => {
  it('prefers the nodes frame numeric mainstat', () => {
    const field = getNodeGraphValueField([nodesFrame(), edgesFrame()]);
    expect(field?.name).toBe('mainstat');
    expect(field?.values).toEqual([1, 2, 3]);
  });

  it('falls back to the edges frame mainstat when nodes have none', () => {
    const bareNodes = toDataFrame({ fields: [{ name: 'id', type: FieldType.string, values: ['a'] }] });
    const field = getNodeGraphValueField([bareNodes, edgesFrame()]);
    expect(field?.values).toEqual([10, 20]);
  });

  it('returns undefined when no mainstat is numeric', () => {
    const frame = toDataFrame({
      fields: [
        { name: 'source', type: FieldType.string, values: ['a'] },
        { name: 'target', type: FieldType.string, values: ['b'] },
        { name: 'mainstat', type: FieldType.string, values: ['12ms'] },
      ],
    });
    expect(getNodeGraphValueField([frame])).toBeUndefined();
  });
});
