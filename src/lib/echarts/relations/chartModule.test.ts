import { createTheme, type DataFrame, type FieldConfigSource, FieldType, toDataFrame } from '@grafana/data';
import { relationsChartModule } from 'lib/echarts/relations/chartModule';
import { type RelationsChartContext } from 'lib/echarts/charts/types';
import { SeriesVisibilityChangeMode } from '@grafana/ui';
import { legacyToWide } from 'lib/echarts/relations/converters/legacyToWide';
import { changeSeriesColorConfig, toggleSeriesVisibilityConfig } from 'lib/grafana/fields/seriesConfig';
import { applyTestFieldConfig } from 'test/fieldConfig';
import { type PanelOptions } from 'types';
import { GRAPH_EDGES_WIDE, GRAPH_NODES_WIDE } from 'lib/echarts/relations/converters/contract';

const theme = createTheme();
const emptyFieldConfig: FieldConfigSource = { defaults: {}, overrides: [] };

const nodesFrame = toDataFrame({
  name: 'nodes',
  fields: [
    { name: 'id', type: FieldType.string, values: ['a', 'b'] },
    { name: 'title', type: FieldType.string, values: ['Gateway', 'API'] },
    { name: 'mainstat', type: FieldType.number, values: [10, 20] },
  ],
});

const edgesFrame = toDataFrame({
  name: 'edges',
  fields: [
    { name: 'id', type: FieldType.string, values: ['e1'] },
    { name: 'source', type: FieldType.string, values: ['a'] },
    { name: 'target', type: FieldType.string, values: ['b'] },
    { name: 'mainstat', type: FieldType.number, values: [5] },
  ],
});

/** Build a cyclic edge set that ECharts sankey rejects. */
const cyclicEdgesFrame = toDataFrame({
  name: 'edges',
  fields: [
    { name: 'id', type: FieldType.string, values: ['e1', 'e2'] },
    { name: 'source', type: FieldType.string, values: ['a', 'b'] },
    { name: 'target', type: FieldType.string, values: ['b', 'a'] },
    { name: 'mainstat', type: FieldType.number, values: [5, 3] },
  ],
});

const ctx = (
  rawFrames: DataFrame[],
  fieldConfig: FieldConfigSource = emptyFieldConfig,
  seriesType: RelationsChartContext['seriesType'] = 'graph'
): RelationsChartContext =>
  ({
    frames: applyTestFieldConfig(legacyToWide(rawFrames), fieldConfig, theme),
    theme,
    timeZone: 'utc',
    timeRange: {},
    options: {
      legend: { showLegend: true, displayMode: 'list', placement: 'bottom', calcs: [] },
      tooltip: { mode: 'single' },
    } as unknown as PanelOptions,
    seriesType,
    formatValue: (value: unknown) => ({ text: String(value) }),
    fieldConfig,
    replaceVariables: (value: string) => value,
  }) as unknown as RelationsChartContext;

/** The same context, narrowed to the sankey render variant. */
const sankeyCtx = (frames: DataFrame[]): RelationsChartContext => ctx(frames, emptyFieldConfig, 'sankey');
/** The same context, narrowed to the chord render variant. */
const chordCtx = (frames: DataFrame[]): RelationsChartContext => ctx(frames, emptyFieldConfig, 'chord');

const base = { isGrafanaLegend: true };

/** A hand-written "Hide in area" override. */
const hiding = (name: string): FieldConfigSource => ({
  defaults: {},
  overrides: [
    {
      matcher: { id: 'byName', options: name },
      properties: [{ id: 'custom.hideFrom', value: { viz: true, legend: false, tooltip: false } }],
    },
  ],
});

describe('relationsChartModule', () => {
  describe('buildOption', () => {
    it('builds a single graph series from a nodes + edges pair', () => {
      const option = relationsChartModule.buildOption(ctx([nodesFrame, edgesFrame]), base);
      expect(option).not.toBeNull();
      const series = option!.series as Array<Record<string, unknown>>;
      expect(series).toHaveLength(1);
      expect(series[0].type).toBe('graph');
      expect(series[0].data).toHaveLength(2);
      expect(series[0].links).toHaveLength(1);
    });

    it('builds from an edges-only response', () => {
      const option = relationsChartModule.buildOption(ctx([edgesFrame]), base);
      const series = option!.series as Array<Record<string, unknown>>;
      expect(series[0].data).toHaveLength(2);
    });

    it('returns null when there is no edges frame', () => {
      expect(relationsChartModule.buildOption(ctx([nodesFrame]), base)).toBeNull();
      expect(relationsChartModule.buildOption(ctx([]), base)).toBeNull();
    });

    it('builds a sankey series from the same frames when the variant is selected', () => {
      const option = relationsChartModule.buildOption(sankeyCtx([nodesFrame, edgesFrame]), base);
      const series = option!.series as Array<Record<string, unknown>>;

      expect(series).toHaveLength(1);
      expect(series[0].type).toBe('sankey');
      expect(series[0].data).toHaveLength(2);
      expect(series[0].links).toHaveLength(1);
    });

    it('returns null for the sankey variant when there is no edges frame', () => {
      expect(relationsChartModule.buildOption(sankeyCtx([nodesFrame]), base)).toBeNull();
    });

    it('reports no notice for an acyclic sankey', () => {
      const context = sankeyCtx([nodesFrame, edgesFrame]);

      expect(relationsChartModule.buildOption(context, base)).not.toHaveProperty('title');
      expect(relationsChartModule.getNotices?.(context)).toEqual([]);
    });

    it('breaks a cycle for the sankey variant and reports the dropped link as a notice', () => {
      const context = sankeyCtx([nodesFrame, cyclicEdgesFrame]);
      const option = relationsChartModule.buildOption(context, base);
      const series = option!.series as Array<Record<string, unknown>>;

      expect(series[0].links).toHaveLength(1);
      // The note is a panel corner notice now, not an ECharts canvas `title`.
      expect(option).not.toHaveProperty('title');
      expect(relationsChartModule.getNotices?.(context)).toEqual([
        { severity: 'warning', text: '1 link hidden to remove cycles' },
      ]);
    });

    // The graph series accepts any digraph, so the same frames must keep both edges.
    it('keeps the cycle for the graph variant', () => {
      const context = ctx([nodesFrame, cyclicEdgesFrame]);
      const option = relationsChartModule.buildOption(context, base);
      const series = option!.series as Array<Record<string, unknown>>;

      expect(series[0].links).toHaveLength(2);
      expect(option).not.toHaveProperty('title');
      // Only sankey rewrites links, so graph never reports a cycle notice.
      expect(relationsChartModule.getNotices?.(context)).toEqual([]);
    });

    it('builds a chord series from the same frames when the variant is selected', () => {
      const option = relationsChartModule.buildOption(chordCtx([nodesFrame, edgesFrame]), base);
      const series = option!.series as Array<Record<string, unknown>>;

      expect(series).toHaveLength(1);
      expect(series[0].type).toBe('chord');
      expect(series[0].data).toHaveLength(2);
      expect(series[0].links).toHaveLength(1);
    });

    it('returns null for the chord variant when there is no edges frame', () => {
      expect(relationsChartModule.buildOption(chordCtx([nodesFrame]), base)).toBeNull();
    });

    it('keeps the cycle for the chord variant and adds no note', () => {
      const option = relationsChartModule.buildOption(chordCtx([nodesFrame, cyclicEdgesFrame]), base);
      const series = option!.series as Array<Record<string, unknown>>;

      expect(series[0].links).toHaveLength(2);
      expect(option).not.toHaveProperty('title');
    });

    it('draws an isolated declared node for graph and sankey, but not chord', () => {
      const hiddenEndpoint = hiding('a');

      expect(relationsChartModule.buildOption(ctx([nodesFrame, edgesFrame], hiddenEndpoint), base)).not.toBeNull();
      expect(
        relationsChartModule.buildOption(ctx([nodesFrame, edgesFrame], hiddenEndpoint, 'sankey'), base)
      ).not.toBeNull();
      expect(relationsChartModule.buildOption(ctx([nodesFrame, edgesFrame], hiddenEndpoint, 'chord'), base)).toBeNull();
    });
  });

  describe('getDataIssue', () => {
    it.each([
      {
        name: 'unsupported frame shape',
        context: ctx([
          toDataFrame({
            fields: [
              { name: 'time', type: FieldType.time, values: [1] },
              { name: 'value', type: FieldType.number, values: [2] },
            ],
          }),
        ]),
        issue: {
          reason: 'unsupported-frame-shape',
          message: 'Graph data is missing edges. Add source and target labels to each numeric edge field.',
        },
      },
      {
        name: 'declared nodes without edges',
        context: ctx([
          toDataFrame({
            meta: { type: GRAPH_NODES_WIDE },
            fields: [{ name: 'a', type: FieldType.number, values: [1] }],
          }),
        ]),
        issue: {
          reason: 'nodes-without-edges',
          message: 'Graph data contains nodes but no edges. Add an edges frame.',
        },
      },
      {
        name: 'declared edges without endpoints',
        context: ctx([
          toDataFrame({
            meta: { type: GRAPH_EDGES_WIDE },
            fields: [{ name: 'requests', type: FieldType.number, values: [1] }],
          }),
        ]),
        issue: {
          reason: 'edges-without-endpoints',
          message: 'Graph edge fields are missing endpoints. Add source and target labels to each numeric edge field.',
        },
      },
      {
        name: 'legacy row data',
        context: { ...ctx([]), frames: [edgesFrame] },
        issue: {
          reason: 'legacy-row-data',
          message:
            'Row-based Node Graph data was not converted. Add a Rows to fields transformation, or enable panel system transformations in Grafana.',
        },
      },
    ])('maps $name to its actionable message', ({ context, issue }) => {
      expect(relationsChartModule.getDataIssue?.(context)).toEqual(issue);
    });

    it.each(['graph', 'sankey', 'chord'] as const)('reports hidden derived marks for %s', (seriesType) => {
      expect(relationsChartModule.getDataIssue?.(ctx([edgesFrame], hiding('e1'), seriesType))).toEqual({
        reason: 'hidden-marks',
        message: 'All graph marks are hidden. Show at least one node or edge in the field configuration.',
      });
    });

    it('accepts isolated declared nodes for graph and sankey, but not chord', () => {
      const hiddenEndpoint = hiding('a');

      expect(relationsChartModule.getDataIssue?.(ctx([nodesFrame, edgesFrame], hiddenEndpoint))).toBeUndefined();
      expect(
        relationsChartModule.getDataIssue?.(ctx([nodesFrame, edgesFrame], hiddenEndpoint, 'sankey'))
      ).toBeUndefined();
      expect(relationsChartModule.getDataIssue?.(ctx([nodesFrame, edgesFrame], hiddenEndpoint, 'chord'))).toEqual({
        reason: 'hidden-marks',
        message: 'All graph marks are hidden. Show at least one node or edge in the field configuration.',
      });
    });

    it('returns no issue for a complete graph', () => {
      expect(relationsChartModule.getDataIssue?.(ctx([nodesFrame, edgesFrame]))).toBeUndefined();
    });
  });

  describe('buildLegendItems', () => {
    it('lists one entry per node, labelled by title', () => {
      const items = relationsChartModule.buildLegendItems(ctx([nodesFrame, edgesFrame]), []);
      expect(items.map((item) => item.label)).toEqual(['Gateway', 'API']);
      expect(items.every((item) => typeof item.color === 'string')).toBe(true);
    });

    it('keys items by node id so they stay stable across renders', () => {
      const items = relationsChartModule.buildLegendItems(ctx([nodesFrame, edgesFrame]), []);
      expect(items.map((item) => item.getItemKey!())).toEqual(['relations-a', 'relations-b']);
    });

    it('matches the swatch color to the chart', () => {
      const chartColors = (
        relationsChartModule.buildOption(ctx([nodesFrame, edgesFrame]), base)!.series as Array<Record<string, unknown>>
      )[0].data as Array<{ itemStyle?: { color?: string } }>;
      const items = relationsChartModule.buildLegendItems(ctx([nodesFrame, edgesFrame]), []);
      expect(items.map((item) => item.color)).toEqual(chartColors.map((node) => node.itemStyle?.color));
    });

    it('is empty when there is no usable graph', () => {
      expect(relationsChartModule.buildLegendItems(ctx([]), [])).toEqual([]);
    });
  });

  describe('legend colour', () => {
    const nodeColors = (fieldConfig: FieldConfigSource) => {
      const series = relationsChartModule.buildOption(ctx([nodesFrame, edgesFrame], fieldConfig), base)!
        .series as Array<Record<string, unknown>>;
      return (series[0].data as Array<{ name: string; itemStyle?: { color?: string } }>).map((node) => [
        node.name,
        node.itemStyle?.color,
      ]);
    };

    it('recolours exactly the picked node, theme-resolved', () => {
      const picked = changeSeriesColorConfig(emptyFieldConfig, 'Gateway', 'dark-red');

      const [gateway, api] = nodeColors(picked);
      expect(gateway).toEqual(['Gateway', '#C4162A']);
      expect(api).toEqual(['API', nodeColors(emptyFieldConfig)[1][1]]);
    });

    it('shows the picked colour on the legend swatch too', () => {
      const picked = changeSeriesColorConfig(emptyFieldConfig, 'Gateway', 'dark-red');

      const items = relationsChartModule.buildLegendItems(ctx([nodesFrame, edgesFrame], picked), []);

      expect(items.map((item) => item.color)).toEqual(nodeColors(picked).map(([, color]) => color));
    });

    it('matches on the display name the legend shows, not the field name', () => {
      const byFieldName = changeSeriesColorConfig(emptyFieldConfig, 'a', 'dark-red');

      expect(nodeColors(byFieldName)[0]).toEqual(['Gateway', '#C4162A']);
    });
  });

  describe('legend visibility', () => {
    /** The `hideSeriesFrom` system override core writes: keep only `keptNames`. */
    const hidingAllBut = (keptNames: string[]): FieldConfigSource => ({
      defaults: {},
      overrides: [
        {
          __systemRef: 'hideSeriesFrom',
          matcher: { id: 'byNames', options: { mode: 'exclude', names: keptNames, prefix: 'All except:' } },
          properties: [{ id: 'custom.hideFrom', value: { viz: true, legend: false, tooltip: true } }],
        } as unknown as FieldConfigSource['overrides'][number],
      ],
    });

    const nodesOf = (fieldConfig: FieldConfigSource) => {
      const series = relationsChartModule.buildOption(ctx([nodesFrame, edgesFrame], fieldConfig), base)!
        .series as Array<Record<string, unknown>>;
      return series[0];
    };

    it('drops a hidden node from the rendered series', () => {
      const series = nodesOf(hidingAllBut(['Gateway']));

      expect((series.data as Array<{ name: string }>).map((node) => node.name)).toEqual(['Gateway']);
    });

    // An edge whose endpoint is gone has nothing to attach to.
    it('drops every link touching a hidden node', () => {
      expect(nodesOf(hidingAllBut(['Gateway'])).links).toEqual([]);
    });

    it('keeps the hidden node listed in the legend, greyed, so it can be restored', () => {
      const items = relationsChartModule.buildLegendItems(ctx([nodesFrame, edgesFrame], hidingAllBut(['Gateway'])), []);

      expect(items.map((item) => item.label)).toEqual(['Gateway', 'API']);
      expect(items.map((item) => item.disabled)).toEqual([false, true]);
    });

    it('keeps the surviving nodes on their original palette colors', () => {
      const before = relationsChartModule.buildOption(ctx([nodesFrame, edgesFrame]), base)!.series as Array<
        Record<string, unknown>
      >;
      const apiColorBefore = (before[0].data as Array<{ name: string; itemStyle?: { color?: string } }>).find(
        (node) => node.name === 'API'
      )?.itemStyle?.color;

      const after = nodesOf(hidingAllBut(['API']));
      const apiColorAfter = (after.data as Array<{ name: string; itemStyle?: { color?: string } }>)[0].itemStyle?.color;

      expect(apiColorAfter).toBe(apiColorBefore);
    });
  });

  describe('per-mark hiding', () => {
    const wideNodes = toDataFrame({
      name: 'nodes',
      fields: [
        { name: 'id', type: FieldType.string, values: ['a', 'b', 'c'] },
        { name: 'mainstat', type: FieldType.number, values: [1, 2, 3] },
      ],
    });
    const wideEdges = toDataFrame({
      name: 'edges',
      fields: [
        { name: 'id', type: FieldType.string, values: ['e1', 'e2'] },
        { name: 'source', type: FieldType.string, values: ['a', 'b'] },
        { name: 'target', type: FieldType.string, values: ['b', 'c'] },
        { name: 'mainstat', type: FieldType.number, values: [5, 6] },
      ],
    });

    const seriesOf = (frames: DataFrame[], fieldConfig?: FieldConfigSource) =>
      (relationsChartModule.buildOption(ctx(frames, fieldConfig), base)!.series as Array<Record<string, unknown>>)[0];

    const namesOf = (series: Record<string, unknown>) =>
      (series.data as Array<{ name: string }>).map((node) => node.name);
    const edgesOf = (series: Record<string, unknown>) =>
      (series.links as Array<{ source: string; target: string }>).map((link) => `${link.source}->${link.target}`);

    it('hides one edge without touching its endpoints', () => {
      const series = seriesOf([wideNodes, wideEdges], hiding('e1'));

      expect(edgesOf(series)).toEqual(['b->c']);
      expect(namesOf(series)).toEqual(['a', 'b', 'c']);
    });

    it('hides one node and only the links that touch it', () => {
      const series = seriesOf([wideNodes, wideEdges], hiding('a'));

      expect(namesOf(series)).toEqual(['b', 'c']);
      expect(edgesOf(series)).toEqual(['b->c']);
    });

    it('keeps a declared node with no visible links, but drops a derived one', () => {
      expect(namesOf(seriesOf([wideNodes, wideEdges], hiding('e1')))).toContain('a');

      const derived = seriesOf([wideEdges], hiding('e1'));
      expect(edgesOf(derived)).toEqual(['b->c']);
      expect(namesOf(derived)).toEqual(['b', 'c']);
    });
  });

  describe('positions for derived nodes', () => {
    const wideEdges = toDataFrame({
      name: 'edges',
      fields: [
        { name: 'id', type: FieldType.string, values: ['e1'] },
        { name: 'source', type: FieldType.string, values: ['a'] },
        { name: 'target', type: FieldType.string, values: ['b'] },
        { name: 'mainstat', type: FieldType.number, values: [5] },
      ],
    });
    const declaredNodes = toDataFrame({
      name: 'nodes',
      fields: [
        { name: 'id', type: FieldType.string, values: ['a', 'b'] },
        { name: 'mainstat', type: FieldType.number, values: [1, 2] },
      ],
    });

    const pinning = (name: string, x: number, y: number): FieldConfigSource => ({
      defaults: {},
      overrides: [
        {
          matcher: { id: 'byName', options: name },
          properties: [
            { id: 'custom.fixedX', value: x },
            { id: 'custom.fixedY', value: y },
          ],
        },
      ],
    });

    const fixedLayout = (frames: DataFrame[], fieldConfig: FieldConfigSource): RelationsChartContext => {
      const context = ctx(frames, fieldConfig);
      return { ...context, options: { ...context.options, relationsLayout: 'none' } };
    };

    const nodeAt = (context: RelationsChartContext, id: string) => {
      const series = (relationsChartModule.buildOption(context, base)!.series as Array<Record<string, unknown>>)[0];
      return (series.data as Array<{ id: string; x?: number; y?: number }>).find((node) => node.id === id);
    };

    it('places a derived node at the position an override names', () => {
      expect(nodeAt(fixedLayout([wideEdges], pinning('a', 120, 340)), 'a')).toMatchObject({ x: 120, y: 340 });
    });

    it('leaves the nodes no override names where the seed put them', () => {
      const seeded = nodeAt(fixedLayout([wideEdges], pinning('a', 120, 340)), 'b');

      expect(Number.isFinite(seeded?.x)).toBe(true);
      expect(seeded).not.toMatchObject({ x: 120, y: 340 });
    });

    it('leaves a fielded node to the override engine', () => {
      const withNodes = fixedLayout([declaredNodes, wideEdges], pinning('a', 120, 340));

      expect(nodeAt(withNodes, 'a')).toMatchObject({ x: 120, y: 340 });
    });
  });

  describe('getZoomAction', () => {
    const withZoom = (context: RelationsChartContext): RelationsChartContext => ({
      ...context,
      options: { ...context.options, relationsZoom: true },
    });

    it('draws no buttons until zoom is switched on', () => {
      expect(relationsChartModule.getZoomAction?.(ctx([nodesFrame, edgesFrame]))).toBeUndefined();
    });

    it('names the roam action after the render variant', () => {
      expect(relationsChartModule.getZoomAction?.(withZoom(ctx([nodesFrame, edgesFrame])))).toEqual({
        type: 'graphRoam',
        seriesIndex: 0,
      });
      expect(relationsChartModule.getZoomAction?.(withZoom(sankeyCtx([nodesFrame, edgesFrame])))).toEqual({
        type: 'sankeyRoam',
        seriesIndex: 0,
      });
    });

    it('has nothing to dispatch on a chord, which owns no view', () => {
      expect(relationsChartModule.getZoomAction?.(withZoom(chordCtx([nodesFrame, edgesFrame])))).toBeUndefined();
    });
  });

  describe('getOverrideTargetNames', () => {
    it('reports edges as well as nodes', () => {
      expect(relationsChartModule.getOverrideTargetNames?.(ctx([nodesFrame, edgesFrame]))).toEqual([
        'Gateway',
        'API',
        'e1',
      ]);
    });

    it('is empty when there is no usable graph', () => {
      expect(relationsChartModule.getOverrideTargetNames?.(ctx([]))).toEqual([]);
    });

    it('keeps the untouched edges when the legend hides one node', () => {
      const wideNodes = toDataFrame({
        name: 'nodes',
        fields: [
          { name: 'id', type: FieldType.string, values: ['a', 'b', 'c'] },
          { name: 'mainstat', type: FieldType.number, values: [1, 2, 3] },
        ],
      });
      const wideEdges = toDataFrame({
        name: 'edges',
        fields: [
          { name: 'id', type: FieldType.string, values: ['e1', 'e2'] },
          { name: 'source', type: FieldType.string, values: ['a', 'b'] },
          { name: 'target', type: FieldType.string, values: ['b', 'c'] },
          { name: 'mainstat', type: FieldType.number, values: [5, 6] },
        ],
      });
      const frames = [wideNodes, wideEdges];

      // Exactly what a ctrl-click on legend row `a` persists, for a given universe.
      const hideA = (universe: string[]) =>
        toggleSeriesVisibilityConfig(emptyFieldConfig, 'a', SeriesVisibilityChangeMode.AppendToSelection, universe);
      const render = (fieldConfig: FieldConfigSource) =>
        (relationsChartModule.buildOption(ctx(frames, fieldConfig), base)!.series as Array<Record<string, unknown>>)[0];

      const withEdges = render(hideA(relationsChartModule.getOverrideTargetNames!(ctx(frames))));
      expect((withEdges.data as Array<{ name: string }>).map((node) => node.name)).toEqual(['b', 'c']);
      expect((withEdges.links as Array<{ source: string }>).map((link) => link.source)).toEqual(['b']);

      const nodesOnly = render(hideA(['a', 'b', 'c']));
      expect(nodesOnly.links).toEqual([]);
    });
  });

  describe('getLegendHighlightTargets', () => {
    it('emphasises the hovered node and every link touching it', () => {
      const targets = relationsChartModule.getLegendHighlightTargets?.(ctx([nodesFrame, edgesFrame]), 'Gateway');

      expect(targets).toEqual([
        { dataType: 'node', dataIndex: [0] },
        { dataType: 'edge', dataIndex: [0] },
      ]);
    });

    it('matches a node with no links to just itself', () => {
      const isolated = toDataFrame({
        name: 'nodes',
        fields: [
          { name: 'id', type: FieldType.string, values: ['a', 'b', 'c'] },
          { name: 'title', type: FieldType.string, values: ['Gateway', 'API', 'Orphan'] },
        ],
      });
      const targets = relationsChartModule.getLegendHighlightTargets?.(ctx([isolated, edgesFrame]), 'Orphan');

      expect(targets).toEqual([{ dataType: 'node', dataIndex: [2] }]);
    });

    it('returns nothing for a label that matches no node', () => {
      expect(relationsChartModule.getLegendHighlightTargets?.(ctx([nodesFrame, edgesFrame]), 'nope')).toEqual([]);
    });
  });

  it('declares singleTooltipOnly — a hover is one node or one link', () => {
    expect(relationsChartModule.singleTooltipOnly).toBe(true);
  });
});
