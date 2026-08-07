import { createTheme, type Field, type FieldConfigSource, FieldType, toDataFrame } from '@grafana/data';
import { type CallbackDataParams, type LabelLayoutOptionCallbackParams } from 'echarts/types/dist/shared';
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
  getRelationsEdgeLabel,
  getRelationsLabelLayout,
  getRelationsLabelStyle,
  getRelationsNodeLabelFormatter,
  getRelationsViewState,
  RELATIONS_NODE_SIZE_DEFAULT,
  resolveFixedPositions,
  resolveRelationsRoam,
  resolveRelationsZoom,
  type RelationsSeriesContext,
} from 'lib/echarts/options/graph';
import { getPaletteColorByIndex } from 'lib/echarts/style';
import { type TooltipSource } from 'lib/echarts/tooltip/types';
import { type PanelOptions } from 'types';

const theme = createTheme();
const emptyFieldConfig: FieldConfigSource = { defaults: {}, overrides: [] };

/**
 * Label-layout callback params. Only `dataType` is read, so the rest is left off
 * rather than filled with values no assertion depends on.
 */
const labelParams = (dataType: 'node' | 'edge'): LabelLayoutOptionCallbackParams =>
  ({ dataType, dataIndex: 0, seriesIndex: 0 }) as LabelLayoutOptionCallbackParams;

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

describe('resolveFixedPositions', () => {
  // The whole point: a node with no `x` lays out at `[NaN, NaN]` and is not drawn, so
  // "Fixed" on data that pins nothing used to blank the panel.
  it('gives every node a finite position when nothing is pinned', () => {
    const positions = resolveFixedPositions(data().nodes);

    expect(positions.size).toBe(2);
    for (const { x, y } of positions.values()) {
      expect(Number.isFinite(x)).toBe(true);
      expect(Number.isFinite(y)).toBe(true);
    }
  });

  // Deterministic, so a refresh does not reshuffle the graph — the same reason the force
  // simulation is seeded (`RELATIONS_FORCE_INIT_LAYOUT`).
  it('seeds the same positions for the same nodes', () => {
    expect([...resolveFixedPositions(data().nodes)]).toEqual([...resolveFixedPositions(data().nodes)]);
  });

  it('leaves a pinned node exactly where it is pinned', () => {
    const pinned = data({
      nodes: [
        { id: 'a', name: 'A', value: 1, fixedX: 5, fixedY: 6 },
        { id: 'b', name: 'B', value: 2, fixedX: 7, fixedY: 8 },
      ],
    });

    expect([...resolveFixedPositions(pinned.nodes)]).toEqual([
      ['a', { x: 5, y: 6 }],
      ['b', { x: 7, y: 8 }],
    ]);
  });

  // Partially-pinned data: the pinned marks keep their exact coordinates and the rest go
  // on a ring outside their bounding box, so they read as "not placed yet" rather than
  // landing on top of the pinned cluster.
  it('seeds the unpinned nodes clear of the pinned ones', () => {
    const partial = data({
      nodes: [
        { id: 'a', name: 'A', value: 1, fixedX: 0, fixedY: 0 },
        { id: 'b', name: 'B', value: 2, fixedX: 10, fixedY: 0 },
        { id: 'c', name: 'C', value: 3 },
      ],
    });
    const positions = resolveFixedPositions(partial.nodes);

    expect(positions.get('a')).toEqual({ x: 0, y: 0 });
    expect(positions.get('b')).toEqual({ x: 10, y: 0 });
    // Centre of the pinned box is (5, 0) and its half-extent 5, so the ring sits at 6.25.
    const seeded = positions.get('c')!;
    expect(Math.hypot(seeded.x - 5, seeded.y - 0)).toBeCloseTo(6.25);
  });
});

describe('getGraphForce', () => {
  // Always emitted, because three of the four keys disagree with ECharts on purpose:
  // the simulation is seeded so a render is reproducible, its steps are not drawn so a
  // refresh does not jiggle, and it is spread far wider so the labels have room.
  it('always emits the seeded, non-animated, spread-out defaults', () => {
    expect(getGraphForce(baseOptions())).toEqual({
      initLayout: 'circular',
      repulsion: 400,
      edgeLength: 200,
      layoutAnimation: false,
    });
  });

  it('lets each knob be overridden, and adds gravity only when set', () => {
    expect(getGraphForce(baseOptions({ relationsRepulsion: 200 }))).toMatchObject({ repulsion: 200 });
    expect(getGraphForce(baseOptions())).not.toHaveProperty('gravity');
    expect(
      getGraphForce(
        baseOptions({
          relationsRepulsion: 200,
          relationsGravity: 0.2,
          relationsEdgeLength: 40,
          relationsLayoutAnimation: true,
        })
      )
    ).toEqual({ initLayout: 'circular', repulsion: 200, gravity: 0.2, edgeLength: 40, layoutAnimation: true });
  });
});

describe('resolveRelationsRoam / resolveRelationsZoom', () => {
  it('keeps both off by default', () => {
    expect(resolveRelationsRoam(baseOptions())).toBe(false);
    expect(resolveRelationsZoom(baseOptions())).toBe(false);
  });

  // Pan is the only thing routed through `roam`: zoom is the panel's buttons, so the
  // scroll wheel is never bound and the dashboard can still be scrolled past.
  it('maps pan alone to move, and zoom alone to no roam at all', () => {
    expect(resolveRelationsRoam(baseOptions({ relationsPan: true }))).toBe('move');
    expect(resolveRelationsRoam(baseOptions({ relationsZoom: true }))).toBe(false);
    expect(resolveRelationsZoom(baseOptions({ relationsZoom: true }))).toBe(true);
  });

  // A dashboard saved with the superseded single switch keeps both behaviours.
  it('falls back to the superseded relationsRoam switch', () => {
    expect(resolveRelationsRoam(baseOptions({ relationsRoam: true }))).toBe('move');
    expect(resolveRelationsZoom(baseOptions({ relationsRoam: true }))).toBe(true);
    // An explicit new value wins over it, in both directions.
    expect(resolveRelationsZoom(baseOptions({ relationsRoam: true, relationsZoom: false }))).toBe(false);
  });
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

describe('getRelationsViewState', () => {
  // `zoom`/`center` are where ECharts keeps a `View`'s roam state, and the roam action
  // syncs them back onto the series model — so emitting them *is* restoring the view.
  it('restores the saved view when Remember view is on', () => {
    const saved = baseOptions({ relationsRememberView: true, relationsViewZoom: 2, relationsViewCenter: [10, 20] });

    expect(getRelationsViewState(saved)).toEqual({ zoom: 2, center: [10, 20] });
    expect(getGraphSeries(data(), ctx(saved))).toMatchObject({ zoom: 2, center: [10, 20] });
  });

  // The switch gates the *read* as well as the write, so turning it off restores the
  // default view rather than leaving the panel stuck at a pan nobody can see a control
  // for. `ADVANCED_RELATIONS_DEFAULTS` clears the switch in Default editor mode, which
  // is what makes that reachable.
  it('emits nothing when the switch is off, whatever was stored', () => {
    const stored = baseOptions({ relationsViewZoom: 2, relationsViewCenter: [10, 20] });

    expect(getRelationsViewState(stored)).toEqual({});
    expect(getGraphSeries(data(), ctx(stored))).not.toHaveProperty('zoom');
  });

  it('emits only what has been stored so far', () => {
    expect(getRelationsViewState(baseOptions({ relationsRememberView: true }))).toEqual({});
  });
});

describe('getRelationsLabelLayout', () => {
  it('hides overlapping node labels by default', () => {
    expect(getRelationsLabelLayout(baseOptions())?.(labelParams('node'))).toEqual({ hideOverlap: true });
  });

  // The reason the callback form is used at all. An edge label put through
  // `hideOverlap` is measured before the link geometry has settled, so each render
  // lets one more through and "Show edge values" draws more labels every refresh.
  it('leaves edge labels out of the overlap pass', () => {
    expect(getRelationsLabelLayout(baseOptions())?.(labelParams('edge'))).toEqual({});
  });

  // Omitted rather than emitted empty: `LabelManager` skips a series whose
  // `labelLayout` has no keys, so the two are equivalent and omitting says it.
  it('omits the key when switched off', () => {
    expect(getRelationsLabelLayout(baseOptions({ relationsHideOverlappingLabels: false }))).toBeUndefined();
  });
});

describe('getRelationsLabelStyle', () => {
  it('truncates at the default label width', () => {
    expect(getRelationsLabelStyle(ctx())).toMatchObject({ overflow: 'truncate', width: 120 });
  });

  it('writes no overflow keys at none, which is ECharts own default', () => {
    const style = getRelationsLabelStyle(ctx(baseOptions({ relationsLabelOverflow: 'none' })));
    expect(style).not.toHaveProperty('overflow');
    expect(style).not.toHaveProperty('width');
  });

  it('honours an explicit overflow mode and width', () => {
    const style = getRelationsLabelStyle(
      ctx(baseOptions({ relationsLabelOverflow: 'break', relationsLabelWidth: 60 }))
    );
    expect(style).toMatchObject({ overflow: 'break', width: 60 });
  });
});

describe('getRelationsEdgeLabel', () => {
  it('is undefined by default, so the key is omitted', () => {
    expect(getRelationsEdgeLabel(ctx())).toBeUndefined();
  });

  it('formats an edge weight through the panel formatter when the mark has no field', () => {
    const edgeLabel = getRelationsEdgeLabel(ctx(baseOptions({ relationsShowEdgeValues: true })));

    expect(edgeLabel).toMatchObject({ show: true });
    expect(edgeLabel?.formatter({ data: { value: 12 } } as never)).toBe('12');
    // A link with no weight draws nothing rather than an empty box.
    expect(edgeLabel?.formatter({ data: {} } as never)).toBe('');
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
    // A node with no field of its own has no unit to borrow, so it prints plainly rather
    // than in the first edge's. A derived node reaches this only if it somehow carries a
    // stat — it no longer does — which is why `formatDerivedMarkValue` is a safety net.
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
