import { createTheme, type Field, type FieldConfigSource, FieldType, toDataFrame } from '@grafana/data';
import { type CallbackDataParams } from 'echarts/types/dist/shared';
import { type RelationsChartContext } from 'lib/echarts/charts/types';
import { type NodeGraphData } from 'lib/echarts/converters/relationsModel';
import {
  getGraphEdgeSymbol,
  getGraphEmphasis,
  getGraphForce,
  getGraphLabel,
  getGraphLayout,
  getGraphLinkStyle,
  getGraphSeries,
  getRelationsNodeLabelFormatter,
  RELATIONS_NODE_SIZE_DEFAULT,
  type RelationsSeriesContext,
} from 'lib/echarts/options/graph';
import { getPaletteColorByIndex } from 'lib/echarts/style';
import { type TooltipSource } from 'lib/echarts/tooltip/types';
import { type PanelOptions } from 'types';

const theme = createTheme();
const emptyFieldConfig: FieldConfigSource = { defaults: {}, overrides: [] };

const baseOptions = (extra: Partial<PanelOptions> = {}): PanelOptions =>
  ({
    legend: { showLegend: true, displayMode: 'list', placement: 'bottom', calcs: [] },
    tooltip: { mode: 'single' },
    ...extra,
  }) as PanelOptions;

const ctx = (options: PanelOptions = baseOptions()): RelationsChartContext =>
  ({
    frames: [],
    theme,
    timeZone: 'utc',
    timeRange: {} as RelationsChartContext['timeRange'],
    options,
    seriesType: 'graph',
    formatValue: (value: unknown) => ({ text: String(value) }),
    fieldConfig: emptyFieldConfig,
    replaceVariables: (value: string) => value,
  }) as unknown as RelationsChartContext;

/**
 * Nodes reach this layer already coloured — the reader resolves every mark's colour
 * through its own display processor and palettes whatever is left
 * (`converters/graphWide.ts`), so a fixture that omitted `color` would not be one the
 * panel can produce. Colour *resolution* is tested there; this file only checks that
 * the resolved colour is painted.
 */
const data = (extra: Partial<NodeGraphData> = {}): NodeGraphData => ({
  nodes: [
    { id: 'a', name: 'A', value: 1, color: getPaletteColorByIndex(0, theme) },
    { id: 'b', name: 'B', value: 2, color: getPaletteColorByIndex(1, theme) },
  ],
  links: [{ id: 'e1', source: 'a', target: 'b', value: 5 }],
  ...extra,
});

describe('getGraphLayout', () => {
  it('defaults to force', () => {
    expect(getGraphLayout(data(), baseOptions())).toBe('force');
  });

  it('honors an explicit layout option', () => {
    expect(getGraphLayout(data(), baseOptions({ relationsLayout: 'circular' }))).toBe('circular');
  });

  it('uses none when every node pins fixedx/fixedy', () => {
    const pinned = data({
      nodes: [
        { id: 'a', name: 'A', value: 1, fixedX: 0, fixedY: 0 },
        { id: 'b', name: 'B', value: 2, fixedX: 10, fixedY: 10 },
      ],
    });
    expect(getGraphLayout(pinned, baseOptions())).toBe('none');
  });

  it('stays on force when only some nodes pin coordinates', () => {
    // The node-graph spec is all-or-nothing: "If used, all nodes must provide a value".
    const partial = data({
      nodes: [
        { id: 'a', name: 'A', value: 1, fixedX: 0, fixedY: 0 },
        { id: 'b', name: 'B', value: 2 },
      ],
    });
    expect(getGraphLayout(partial, baseOptions())).toBe('force');
  });

  it('an explicit layout still wins over pinned coordinates', () => {
    const pinned = data({ nodes: [{ id: 'a', name: 'A', value: 1, fixedX: 0, fixedY: 0 }] });
    expect(getGraphLayout(pinned, baseOptions({ relationsLayout: 'force' }))).toBe('force');
  });
});

describe('getGraphForce', () => {
  it('is undefined when nothing is overridden, so the key is omitted', () => {
    expect(getGraphForce(baseOptions())).toBeUndefined();
  });

  it('includes only the overridden knobs', () => {
    expect(getGraphForce(baseOptions({ relationsRepulsion: 200 }))).toEqual({ repulsion: 200 });
    expect(
      getGraphForce(baseOptions({ relationsRepulsion: 200, relationsGravity: 0.2, relationsEdgeLength: 40 }))
    ).toEqual({ repulsion: 200, gravity: 0.2, edgeLength: 40 });
  });
});

describe('getGraphEdgeSymbol / getGraphEmphasis', () => {
  it('omit their keys at the default (off)', () => {
    expect(getGraphEdgeSymbol(baseOptions())).toBeUndefined();
    expect(getGraphEmphasis(baseOptions())).toBeUndefined();
  });

  it('emit an arrow at the target end when enabled', () => {
    expect(getGraphEdgeSymbol(baseOptions({ relationsEdgeArrows: true }))).toEqual(['none', 'arrow']);
  });

  it('focus adjacency when enabled', () => {
    expect(getGraphEmphasis(baseOptions({ relationsFocusAdjacency: true }))).toEqual({ focus: 'adjacency' });
  });
});

describe('getGraphLinkStyle', () => {
  // The family default is `gradient`, which ECharts' `graph` series cannot read —
  // `edgeVisual.ts` swaps only `source`/`target` and would treat `gradient` as a literal
  // colour. So the series keyword degrades to `source` and the blend, when the layout
  // allows one, is emitted per link instead.
  it('degrades the gradient default to source, which the graph series can read', () => {
    const style = getGraphLinkStyle(baseOptions());
    expect(style).toEqual({ color: 'source' });
    expect(style).not.toHaveProperty('curveness');
  });

  it('passes through a mode the graph series implements', () => {
    expect(getGraphLinkStyle(baseOptions({ relationsLinkColor: 'target' })).color).toBe('target');
  });

  it('omits curveness at 0 but emits it above', () => {
    expect(getGraphLinkStyle(baseOptions({ relationsCurveness: 0 }))).not.toHaveProperty('curveness');
    expect(getGraphLinkStyle(baseOptions({ relationsCurveness: 0.3 })).curveness).toBe(0.3);
  });
});

describe('getGraphLabel', () => {
  it('shows labels by default', () => {
    expect(getGraphLabel(ctx())).toMatchObject({ show: true, position: 'bottom' });
  });

  it('hides labels when switched off', () => {
    expect(getGraphLabel(ctx(baseOptions({ relationsShowNodeLabels: false })))).toEqual({ show: false });
  });

  // A graph node is labelled from `data.getName(idx)` already, so the formatter is
  // dead weight until there is a value to append.
  it('omits the formatter while node values are off', () => {
    expect(getGraphLabel(ctx())).not.toHaveProperty('formatter');
  });

  it('adds a formatter when node values are switched on', () => {
    const label = getGraphLabel(ctx(baseOptions({ relationsShowNodeValues: true })));

    expect(typeof label).toBe('object');
    expect(typeof (label as { formatter?: unknown }).formatter).toBe('function');
  });
});

describe('getRelationsNodeLabelFormatter', () => {
  const params = (name: string, item: Record<string, unknown>) =>
    ({ name, data: item }) as unknown as CallbackDataParams;

  /** A mark's field + row, as `getRelationsTooltipMarks` builds it. */
  const markSource = (name: string): TooltipSource => ({
    field: toDataFrame({ fields: [{ name, type: FieldType.number, values: [42] }] }).fields[0] as Field,
    rowIndex: 0,
  });

  it('returns nothing while the option is off, so each variant keeps its own formatter', () => {
    expect(getRelationsNodeLabelFormatter(ctx())).toBeUndefined();
  });

  // `graph` carries the stat as `value`; `sankey` and `chord` leave `value` to
  // ECharts' flow computation and carry it as `stat`.
  it('reads the stat from `value` (graph items)', () => {
    const formatter = getRelationsNodeLabelFormatter(ctx(baseOptions({ relationsShowNodeValues: true })))!;

    expect(formatter(params('A', { id: 'a', name: 'A', value: 42 }))).toBe('A\n42');
  });

  it('reads the stat from `stat` (sankey/chord items)', () => {
    const formatter = getRelationsNodeLabelFormatter(ctx(baseOptions({ relationsShowNodeValues: true })))!;

    expect(formatter(params('B', { id: 'b', name: 'B', stat: 7 }))).toBe('B\n7');
  });

  // `stat` wins so a sankey's ECharts-computed `value` cannot shadow the mainstat,
  // matching the tooltip's precedence.
  it('prefers `stat` over `value`', () => {
    const formatter = getRelationsNodeLabelFormatter(ctx(baseOptions({ relationsShowNodeValues: true })))!;

    expect(formatter(params('C', { id: 'c', name: 'C', stat: 5, value: 900 }))).toBe('C\n5');
  });

  it('leaves a statless node on one line rather than adding a blank one', () => {
    const formatter = getRelationsNodeLabelFormatter(ctx(baseOptions({ relationsShowNodeValues: true })))!;

    expect(formatter(params('D', { id: 'd', name: 'D' }))).toBe('D');
  });

  /**
   * The label prints the same number the tooltip does, so it formats through the same
   * per-mark lookup. Formatting it with the panel formatter instead would put two
   * different renderings of one value on screen at once.
   */
  it('formats the stat with the node’s own field, like the tooltip', () => {
    const withMarks: RelationsSeriesContext = {
      ...ctx(baseOptions({ relationsShowNodeValues: true })),
      marks: {
        nodes: new Map([
          ['a', { formatValue: (value: number) => ({ text: `${value}`, suffix: ' ms' }), source: markSource('a') }],
        ]),
        links: new Map(),
      },
    };

    const formatter = getRelationsNodeLabelFormatter(withMarks)!;

    expect(formatter(params('A', { id: 'a', name: 'A', value: 42 }))).toBe('A\n42 ms');
    // A node with no field of its own (a derived node) prints a plain count — its
    // value is a degree, so there is no unit to borrow. See `formatDerivedMarkValue`.
    expect(formatter(params('Z', { id: 'z', name: 'Z', value: 42 }))).toBe('Z\n42');
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

  it('emits x/y only for pinned nodes', () => {
    const pinned = data({
      nodes: [
        { id: 'a', name: 'A', value: 1, fixedX: 5, fixedY: 6 },
        { id: 'b', name: 'B', value: 2 },
      ],
    });
    const series = getGraphSeries(pinned, ctx());
    expect(series.data![0]).toMatchObject({ x: 5, y: 6 });
    expect(series.data![1]).not.toHaveProperty('x');
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

  it('omits lineStyle entirely for an unstyled link', () => {
    expect(getGraphSeries(data(), ctx()).links![0]).not.toHaveProperty('lineStyle');
  });

  it('keeps roam and draggable off by default', () => {
    const series = getGraphSeries(data(), ctx());
    expect(series.roam).toBe(false);
    expect(series.draggable).toBe(false);
  });

  it('omits force, edgeSymbol and emphasis at their defaults', () => {
    const series = getGraphSeries(data(), ctx());
    expect(series).not.toHaveProperty('force');
    expect(series).not.toHaveProperty('edgeSymbol');
    expect(series).not.toHaveProperty('emphasis');
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
 * ECharts' `graph` series implements `lineStyle.color: 'source' | 'target'` and nothing
 * else — `'gradient'` is sankey/chord-only — so the blend is built per link here.
 *
 * It can only be built when the node positions are known, because zrender resolves a
 * non-global gradient against the shape's bounding box: `x: 0 -> x2: 1` runs left to
 * right across the edge, which is source-to-target only if the source sits on the left.
 * Under a force or circular layout the positions do not exist until ECharts has laid the
 * graph out, so orienting would be a coin flip and half the edges would report their
 * direction backwards.
 */
describe('getGraphSeries — edge gradients', () => {
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

  it('leaves the keyword to do the work when the layout has not pinned positions', () => {
    // The default force layout: no positions, so no honest orientation exists.
    expect(getGraphSeries(data(), ctx()).links![0]).not.toHaveProperty('lineStyle');
    expect(getGraphLinkStyle(baseOptions()).color).toBe('source');
  });

  it('does not blend a self-loop, which has no direction to express', () => {
    const loop = pinned({ links: [{ id: 'e1', source: 'a', target: 'a', value: 5 }] });

    expect(getGraphSeries(loop, ctx()).links![0]).not.toHaveProperty('lineStyle');
  });

  it('yields to an explicit per-edge colour', () => {
    const overridden = pinned({ links: [{ id: 'e1', source: 'a', target: 'b', value: 5, color: 'cyan' }] });

    expect(gradientOf(getGraphSeries(overridden, ctx()))).toBe('cyan');
  });

  it('emits no gradient when another colour mode is chosen', () => {
    const series = getGraphSeries(pinned(), ctx(baseOptions({ relationsLinkColor: 'target' })));

    expect(series.links![0]).not.toHaveProperty('lineStyle');
    expect(getGraphLinkStyle(baseOptions({ relationsLinkColor: 'target' })).color).toBe('target');
  });
});
