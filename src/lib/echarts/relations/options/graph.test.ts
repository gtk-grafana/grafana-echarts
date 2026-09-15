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

const data = (extra: Partial<NodeGraphData> = {}): NodeGraphData =>
  nodeGraph({
    nodes: [
      { id: 'a', name: 'A', value: 1, color: getPaletteColorByIndex(0, theme) },
      { id: 'b', name: 'B', value: 2, color: getPaletteColorByIndex(1, theme) },
    ],
    ...extra,
  });

describe('getGraphEdgeSymbol / getGraphEmphasis', () => {
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
    // `id` resolves links. `name` contains the display title.
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

  it('lets a per-edge curveness override the panel-level one', () => {
    const curved = data({ links: [{ id: 'e1', source: 'a', target: 'b', value: 1, curveness: 0.4 }] });
    const series = getGraphSeries(curved, ctx(baseOptions({ relationsCurveness: 0.1 })));

    expect(series.links).toMatchObject([{ lineStyle: { curveness: 0.4 } }]);
    expect(series.lineStyle).toMatchObject({ curveness: 0.1 });
  });

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

  // Pan binds drag, not the wheel. Zoom does not change `roam`.
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

  it('resolves the source and target modes to the endpoint colours themselves', () => {
    const source = getGraphSeries(pinned(), ctx(baseOptions({ relationsLinkColor: 'source' })));
    const target = getGraphSeries(pinned(), ctx(baseOptions({ relationsLinkColor: 'target' })));

    expect(gradientOf(source)).toBe(getPaletteColorByIndex(0, theme));
    expect(gradientOf(target)).toBe(getPaletteColorByIndex(1, theme));
    // …and the two differ, which is the whole claim.
    expect(gradientOf(source)).not.toBe(gradientOf(target));
  });
});
