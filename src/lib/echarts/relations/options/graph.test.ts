import { RELATIONS_NODE_SIZE_DEFAULT } from 'editor/relations/constants';
import { type RelationsChartContext } from 'lib/echarts/charts/types';
import { type NodeGraphData } from 'lib/echarts/relations/converters/model';
import { getGraphEdgeSymbol, getGraphEmphasis } from 'lib/echarts/relations/options/emphasis';
import { getGraphSeries } from 'lib/echarts/relations/options/graph';
import { getGraphLinkStyle } from 'lib/echarts/relations/options/linkColor';
import { getPaletteColorByIndex } from 'lib/echarts/style';
import { nodeGraph, relationsContext, relationsOptions, relationsTheme } from 'test/relations';
import { type PanelOptions } from 'types';

const theme = relationsTheme;

const baseOptions = relationsOptions;

const ctx = (options: PanelOptions = baseOptions()): RelationsChartContext =>
  relationsContext({ options, seriesType: 'graph' });

/**
 * Nodes reach this layer already coloured — the reader resolves every mark's colour
 * through its own display processor and palettes whatever is left
 * (`converters/readNodes.ts`), so a fixture that omitted `color` would not be one the
 * panel can produce. Colour *resolution* is tested there; this file only checks that
 * the resolved colour is painted.
 */
const data = (extra: Partial<NodeGraphData> = {}): NodeGraphData =>
  nodeGraph({
    nodes: [
      { id: 'a', name: 'A', value: 1, color: getPaletteColorByIndex(0, theme) },
      { id: 'b', name: 'B', value: 2, color: getPaletteColorByIndex(1, theme) },
    ],
    ...extra,
  });

describe('getGraphEdgeSymbol / getGraphEmphasis', () => {
  // Both flipped on: an edge is directed by contract and the arrowhead is the only
  // thing that says so under a force layout, and adjacency is what a topology is
  // hovered for.
  it('emit an arrow and adjacency focus at their defaults', () => {
    expect(getGraphEdgeSymbol(baseOptions())).toEqual(['none', 'arrow']);
    expect(getGraphEmphasis(baseOptions())).toEqual({ focus: 'adjacency' });
  });

  it('omit their keys when switched off', () => {
    expect(getGraphEdgeSymbol(baseOptions({ relationsEdgeArrows: false }))).toBeUndefined();
    expect(getGraphEmphasis(baseOptions({ relationsFocusAdjacency: false }))).toBeUndefined();
  });
});

describe('getGraphLinkStyle', () => {
  // No colour at series level any more: the ECharts keywords do not work on a `graph`
  // series (see `resolveLinkColor`), so every edge carries its own resolved colour and
  // ECharts' neutral grey stays as the last resort.
  it('emits no colour keyword at all', () => {
    expect(getGraphLinkStyle(baseOptions())).toEqual({});
    expect(getGraphLinkStyle(baseOptions({ relationsLinkColor: 'target' }))).toEqual({});
  });

  it('omits curveness at 0 but emits it above', () => {
    expect(getGraphLinkStyle(baseOptions({ relationsCurveness: 0 }))).not.toHaveProperty('curveness');
    expect(getGraphLinkStyle(baseOptions({ relationsCurveness: 0.3 })).curveness).toBe(0.3);
  });
});

describe('getGraphSeries', () => {
  it('maps nodes to data and links to links, keyed by id', () => {
    const series = getGraphSeries(data(), ctx());
    expect(series.type).toBe('graph');
    // `id` pins ECharts' link resolution; `name` carries the display title.
    expect(series.data).toMatchObject([
      { id: 'a', name: 'A', value: 1, symbolSize: RELATIONS_NODE_SIZE_DEFAULT },
      { id: 'b', name: 'B', value: 2, symbolSize: RELATIONS_NODE_SIZE_DEFAULT },
    ]);
    expect(series.links).toMatchObject([{ source: 'a', target: 'b', value: 5 }]);
  });

  it('lets noderadius win over the panel-level node size', () => {
    const withRadius = data({ nodes: [{ id: 'a', name: 'A', value: 1, radius: 42 }] });
    const series = getGraphSeries(withRadius, ctx(baseOptions({ relationsNodeSize: 8 })));
    expect(series.data).toMatchObject([{ symbolSize: 42 }]);
  });

  it('applies the panel node size to nodes without a radius', () => {
    const series = getGraphSeries(data(), ctx(baseOptions({ relationsNodeSize: 8 })));
    expect(series.data).toMatchObject([{ symbolSize: 8 }, { symbolSize: 8 }]);
  });

  // Only the fixed layout reads `x`/`y`: `getGraphForce` pins `initLayout: 'circular'`,
  // so `forceLayout` seeds from the ring and never consults them, and a circular layout
  // computes its own. Emitting them anyway would only move the view's bounding box.
  it('emits no x/y under a layout that does not read them', () => {
    const partlyPinned = data({
      nodes: [
        { id: 'a', name: 'A', value: 1, fixedX: 5, fixedY: 6 },
        { id: 'b', name: 'B', value: 2 },
      ],
    });
    const series = getGraphSeries(partlyPinned, ctx());

    expect(series.layout).toBe('force');
    expect(series.data![0]).not.toHaveProperty('x');
    expect(series.data![1]).not.toHaveProperty('x');
  });

  it('emits every pinned coordinate when all of them are pinned', () => {
    const pinned = data({
      nodes: [
        { id: 'a', name: 'A', value: 1, fixedX: 5, fixedY: 6 },
        { id: 'b', name: 'B', value: 2, fixedX: 7, fixedY: 8 },
      ],
    });
    const series = getGraphSeries(pinned, ctx());

    expect(series.layout).toBe('none');
    expect(series.data).toMatchObject([
      { x: 5, y: 6 },
      { x: 7, y: 8 },
    ]);
  });

  /**
   * **The reported bug**: picking Fixed drew nothing. `simpleLayout` lays a node with no
   * `x` out at `[NaN, NaN]`, and `fixedx`/`fixedy` are per-mark overrides that no fresh
   * panel has written — so the layout the user selected blanked the panel and left
   * nothing to drag or override from. See `resolveFixedPositions`.
   */
  it('seeds a position for every node when Fixed is selected with nothing pinned', () => {
    const series = getGraphSeries(data(), ctx(baseOptions({ relationsLayout: 'none' })));

    expect(series.layout).toBe('none');
    for (const item of series.data ?? []) {
      const node = item as { x?: number; y?: number };
      expect(Number.isFinite(node.x)).toBe(true);
      expect(Number.isFinite(node.y)).toBe(true);
    }
  });

  it('lets nodes be dragged under the fixed layout when asked', () => {
    const series = getGraphSeries(data(), ctx(baseOptions({ relationsLayout: 'none', relationsDraggable: true })));

    expect(series.draggable).toBe(true);
  });

  // The switch is hidden for force and circular, and refused here too, so a dashboard that
  // saved the pair keeps a working panel. See `resolveGraphDraggable`.
  it('refuses dragging under force even when the option says otherwise', () => {
    const series = getGraphSeries(data(), ctx(baseOptions({ relationsLayout: 'force', relationsDraggable: true })));

    expect(series.draggable).toBe(false);
  });

  it('maps a per-edge color, width and line type onto the link item', () => {
    const styled = data({
      links: [{ id: 'e1', source: 'a', target: 'b', value: 1, color: 'cyan', width: 3, lineType: 'dashed' }],
    });
    const series = getGraphSeries(styled, ctx());
    expect(series.links).toMatchObject([{ lineStyle: { color: 'cyan', width: 3, type: 'dashed' } }]);
  });

  // ECharts reads `curveness` off the item's own `lineStyle` first, so a per-edge
  // override beats the panel-level "Link curveness" for that edge alone.
  it('lets a per-edge curveness override the panel-level one', () => {
    const curved = data({ links: [{ id: 'e1', source: 'a', target: 'b', value: 1, curveness: 0.4 }] });
    const series = getGraphSeries(curved, ctx(baseOptions({ relationsCurveness: 0.1 })));

    expect(series.links).toMatchObject([{ lineStyle: { curveness: 0.4 } }]);
    expect(series.lineStyle).toMatchObject({ curveness: 0.1 });
  });

  // Every link carries a colour now, since ECharts cannot resolve the endpoint
  // keywords itself on a `graph` series — see `resolveLinkColor`. `lineStyle` is
  // therefore never absent; what an unstyled link omits is everything *else*.
  it('gives an unstyled link a colour and nothing else', () => {
    expect(getGraphSeries(data(), ctx()).links![0]).toMatchObject({
      lineStyle: { color: getPaletteColorByIndex(0, theme) },
    });
    expect(Object.keys((getGraphSeries(data(), ctx()).links![0] as { lineStyle: object }).lineStyle)).toEqual([
      'color',
    ]);
  });

  it('keeps roam and draggable off by default', () => {
    const series = getGraphSeries(data(), ctx());
    expect(series.roam).toBe(false);
    expect(series.draggable).toBe(false);
  });

  // Pan binds drag, not the wheel; zoom never touches `roam` at all.
  it('emits move roam when panning is on', () => {
    expect(getGraphSeries(data(), ctx(baseOptions({ relationsPan: true }))).roam).toBe('move');
    expect(getGraphSeries(data(), ctx(baseOptions({ relationsZoom: true }))).roam).toBe(false);
  });

  it('emits the force, arrow, adjacency and label-layout defaults', () => {
    const series = getGraphSeries(data(), ctx());
    expect(series.force).toMatchObject({ initLayout: 'circular', layoutAnimation: false });
    expect(series.edgeSymbol).toEqual(['none', 'arrow']);
    expect(series.emphasis).toEqual({ focus: 'adjacency' });
    expect(typeof series.labelLayout).toBe('function');
  });

  it('omits edgeLabel unless edge values are switched on', () => {
    expect(getGraphSeries(data(), ctx())).not.toHaveProperty('edgeLabel');
    expect(getGraphSeries(data(), ctx(baseOptions({ relationsShowEdgeValues: true }))).edgeLabel).toMatchObject({
      show: true,
    });
  });

  // The whole of the family's colour path: the mark's own field already decided it,
  // so this layer paints and does not resolve.
  it('paints each node with the colour its own field resolved', () => {
    const coloured = data({
      nodes: [
        { id: 'a', name: 'A', value: 1, color: '#C4162A' },
        { id: 'b', name: 'B', value: 2, color: '#37872D' },
      ],
    });

    expect(getGraphSeries(coloured, ctx()).data).toMatchObject([
      { itemStyle: { color: '#C4162A' } },
      { itemStyle: { color: '#37872D' } },
    ]);
  });

  it('never borders a node: there is no arc ring to approximate under the contract', () => {
    const series = getGraphSeries(data(), ctx());
    expect(series.data![0]).toMatchObject({ itemStyle: expect.any(Object) });
    expect((series.data![0] as { itemStyle: Record<string, unknown> }).itemStyle).not.toHaveProperty('borderColor');
  });

  it('carries the series zlevel from the panel option', () => {
    const series = getGraphSeries(data(), ctx(baseOptions({ zLevel: { series: 3 } })));
    expect(series.zlevel).toBe(3);
  });
});

/**
 * Edge colour on a `graph` series is resolved **here, per link** — none of the three
 * modes can be handed to ECharts.
 *
 * `'source'` / `'target'` are keywords `edgeVisual.ts` swaps for the endpoint node's
 * fill, but it runs at `PRIORITY.VISUAL.CHART` (3000) and the task that applies each
 * node's own `itemStyle.color` runs at `CHART_DATA_CUSTOM` (4500) — so the swap sees
 * only the series-level fill and every edge comes out the same palette colour. (ECharts'
 * own demos hide this by colouring nodes through `categories`, which *does* run first.)
 * `'gradient'` it does not implement for `graph` at all.
 *
 * The blend can only be *oriented* when the node positions are known, because zrender
 * resolves a non-global gradient against the shape's bounding box: `x: 0 -> x2: 1` runs
 * left to right across the edge, which is source-to-target only if the source sits on
 * the left. Under a force or circular layout the positions do not exist until ECharts
 * has laid the graph out, so orienting would be a coin flip and half the edges would
 * report their direction backwards — hence the degradation to the source colour.
 */
describe('getGraphSeries — edge colours', () => {
  const pinned = (extra: Partial<NodeGraphData> = {}): NodeGraphData =>
    data({
      nodes: [
        { id: 'a', name: 'A', value: 1, fixedX: 0, fixedY: 0, color: getPaletteColorByIndex(0, theme) },
        { id: 'b', name: 'B', value: 2, fixedX: 100, fixedY: 100, color: getPaletteColorByIndex(1, theme) },
      ],
      ...extra,
    });

  const gradientOf = (series: ReturnType<typeof getGraphSeries>, index = 0) =>
    (series.links as Array<{ lineStyle?: { color?: unknown } }>)[index]?.lineStyle?.color;

  it('blends from the source node colour to the target node colour', () => {
    const gradient = gradientOf(getGraphSeries(pinned(), ctx()));

    expect(gradient).toMatchObject({
      type: 'linear',
      colorStops: [
        { offset: 0, color: getPaletteColorByIndex(0, theme) },
        { offset: 1, color: getPaletteColorByIndex(1, theme) },
      ],
    });
  });

  it('orients the gradient along the edge, so reversing it reverses the blend', () => {
    // a is top-left, b is bottom-right: the gradient runs from the box's top-left.
    expect(gradientOf(getGraphSeries(pinned(), ctx()))).toMatchObject({ x: 0, y: 0, x2: 1, y2: 1 });

    // Same two nodes, edge the other way: same bounding box, opposite gradient axis.
    const reversed = pinned({ links: [{ id: 'e1', source: 'b', target: 'a', value: 5 }] });
    expect(gradientOf(getGraphSeries(reversed, ctx()))).toMatchObject({ x: 1, y: 1, x2: 0, y2: 0 });
  });

  it('degrades to the source node colour when the layout has not pinned positions', () => {
    // The default force layout: no positions, so no honest orientation exists. The
    // colour is still endpoint-derived — a real hex, not the inert `'source'` keyword.
    expect(gradientOf(getGraphSeries(data(), ctx()))).toBe(getPaletteColorByIndex(0, theme));
  });

  it('does not blend a self-loop, which has no direction to express', () => {
    const loop = pinned({ links: [{ id: 'e1', source: 'a', target: 'a', value: 5 }] });

    expect(gradientOf(getGraphSeries(loop, ctx()))).toBe(getPaletteColorByIndex(0, theme));
  });

  it('yields to an explicit per-edge colour', () => {
    const overridden = pinned({ links: [{ id: 'e1', source: 'a', target: 'b', value: 5, color: 'cyan' }] });

    expect(gradientOf(getGraphSeries(overridden, ctx()))).toBe('cyan');
  });

  // The reported bug: picking Source or Target changed nothing at all, because the
  // keyword reached ECharts and resolved against a colour the nodes did not have yet.
  it('resolves the source and target modes to the endpoint colours themselves', () => {
    const source = getGraphSeries(pinned(), ctx(baseOptions({ relationsLinkColor: 'source' })));
    const target = getGraphSeries(pinned(), ctx(baseOptions({ relationsLinkColor: 'target' })));

    expect(gradientOf(source)).toBe(getPaletteColorByIndex(0, theme));
    expect(gradientOf(target)).toBe(getPaletteColorByIndex(1, theme));
    // …and the two differ, which is the whole claim.
    expect(gradientOf(source)).not.toBe(gradientOf(target));
  });
});
