import { createTheme, type DataFrame, type FieldConfigSource, FieldType, toDataFrame } from '@grafana/data';
import { relationsChartModule } from 'lib/echarts/charts/relations';
import { type RelationsChartContext } from 'lib/echarts/charts/types';
import { SeriesVisibilityChangeMode } from '@grafana/ui';
import { legacyToWide } from 'lib/echarts/converters/legacyToWide';
import { changeSeriesColorConfig, toggleSeriesVisibilityConfig } from 'lib/grafana/fields/seriesConfig';
import { applyTestFieldConfig } from 'test/fieldConfig';
import { type PanelOptions } from 'types';

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

/** A cyclic edge set (A->B->A), the shape that throws out of ECharts' sankey layout. */
const cyclicEdgesFrame = toDataFrame({
  name: 'edges',
  fields: [
    { name: 'id', type: FieldType.string, values: ['e1', 'e2'] },
    { name: 'source', type: FieldType.string, values: ['a', 'b'] },
    { name: 'target', type: FieldType.string, values: ['b', 'a'] },
    { name: 'mainstat', type: FieldType.number, values: [5, 3] },
  ],
});

/**
 * Fixtures are written in Grafana's row form, because that is what a datasource emits,
 * and put through the two passes the host runs above the panel: the conversion the
 * plugin registers on itself (`modules/relations/dataTransformations.ts`), then the
 * field-override pass. Running both here keeps the fixtures readable *and* exercises
 * the real path, rather than hand-writing wide frames the pipeline would never produce.
 *
 * The override pass is load-bearing now rather than incidental. The family reads
 * `custom.hideFrom.viz` off each mark's own field, so an override that is only present
 * in `fieldConfig` — never applied to the frames — describes a state the panel can
 * never be in, and a test built on one would pass against a render that ignored it.
 */
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

    it('returns null when there is no edges frame, so the panel shows no-data', () => {
      expect(relationsChartModule.buildOption(ctx([nodesFrame]), base)).toBeNull();
      expect(relationsChartModule.buildOption(ctx([]), base)).toBeNull();
    });

    // The variant is picked from `ctx.seriesType`, the way the hierarchy module picks
    // treemap vs sunburst — one module, one converter, two layouts.
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

    // Without the cycle policy this edge set throws out of `sankeyLayout.ts` in a
    // production build, blanking the panel.
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

    // Chord has no DAG restriction, so unlike sankey it keeps every link and adds no
    // dropped-link note.
    it('keeps the cycle for the chord variant and adds no note', () => {
      const option = relationsChartModule.buildOption(chordCtx([nodesFrame, cyclicEdgesFrame]), base);
      const series = option!.series as Array<Record<string, unknown>>;

      expect(series[0].links).toHaveLength(2);
      expect(option).not.toHaveProperty('title');
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

  /**
   * The legend's colour picker needs no family-specific path any more. It writes the
   * ordinary `byName` fixed-colour override every panel writes (`changeSeriesColorConfig`,
   * driven here rather than hand-written), Grafana's override engine applies it to the
   * node's own field, and the family reads the answer back as `field.display(value).color`.
   *
   * The old route — `getSeriesColorOverride`, matching the legend label against
   * `fieldConfig` inside the converter — was deleted when the family pivoted to the
   * field-based wide contract, and the reason this test exists is that nothing else would
   * notice if it came back: a re-implementation would look identical from the outside
   * until an override used `byRegexp`, or the theme had to resolve the colour name.
   */
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
      // `dark-red` arrives as the theme's hex because the display processor resolved
      // it upstream — the family never sees the colour name.
      expect(gateway).toEqual(['Gateway', '#C4162A']);
      expect(api).toEqual(['API', nodeColors(emptyFieldConfig)[1][1]]);
    });

    it('shows the picked colour on the legend swatch too', () => {
      const picked = changeSeriesColorConfig(emptyFieldConfig, 'Gateway', 'dark-red');

      const items = relationsChartModule.buildLegendItems(ctx([nodesFrame, edgesFrame], picked), []);

      expect(items.map((item) => item.color)).toEqual(nodeColors(picked).map(([, color]) => color));
    });

    /**
     * The picker addresses a node by the label the legend shows, which is the field's
     * `displayName` (`title` in the row form) rather than its name. Grafana's `byName`
     * matcher accepts either, so this works — but only because the legend label and
     * `getOverrideTargetNames` agree on which of the two they use.
     */
    it('matches on the display name the legend shows, not the field name', () => {
      const byFieldName = changeSeriesColorConfig(emptyFieldConfig, 'a', 'dark-red');

      expect(nodeColors(byFieldName)[0]).toEqual(['Gateway', '#C4162A']);
    });
  });

  // A mark is a field, so Grafana's override engine applies `custom.hideFrom` to it
  // and the family reads the flag off the mark. `ctx` runs the real override pass, so
  // these exercise the engine rather than a hand-matched name list.
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

    // Palette colors are positional, so filtering the list would otherwise shift
    // every node after the hidden one onto its neighbour's color.
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

  /**
   * Per-mark hiding, which the field contract makes expressible for the first time —
   * an edge is a field, so "Hide in area" can name one.
   *
   * Three nodes and two edges, so there is always an edge that does *not* touch the
   * mark under test. The two-node fixture above cannot tell "hid the right thing"
   * from "hid everything".
   */
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

    /** A hand-written "Hide in area" override, the per-mark writer. */
    const hiding = (name: string): FieldConfigSource => ({
      defaults: {},
      overrides: [
        {
          matcher: { id: 'byName', options: name },
          properties: [{ id: 'custom.hideFrom', value: { viz: true, legend: false, tooltip: false } }],
        },
      ],
    });

    const seriesOf = (frames: DataFrame[], fieldConfig?: FieldConfigSource) =>
      (relationsChartModule.buildOption(ctx(frames, fieldConfig), base)!.series as Array<Record<string, unknown>>)[0];

    const namesOf = (series: Record<string, unknown>) =>
      (series.data as Array<{ name: string }>).map((node) => node.name);
    const edgesOf = (series: Record<string, unknown>) =>
      (series.links as Array<{ source: string; target: string }>).map((link) => `${link.source}->${link.target}`);

    // A `custom.hideFrom` override on one edge's field removes exactly that edge —
    // named, gone — and nothing else moves.
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

    /**
     * A node the nodes frame declared is a mark in its own right, so it stays even
     * with no edge left to it. A node *derived* from an edge is not — it exists only
     * because that edge named it, so hiding the edge takes the node with it rather
     * than leaving an unexplained dot.
     */
    it('keeps a declared node with no visible links, but drops a derived one', () => {
      expect(namesOf(seriesOf([wideNodes, wideEdges], hiding('e1')))).toContain('a');

      const derived = seriesOf([wideEdges], hiding('e1'));
      expect(edgesOf(derived)).toEqual(['b->c']);
      expect(namesOf(derived)).toEqual(['b', 'c']);
    });
  });

  /**
   * **Where a dragged node's position is remembered when there is no field to remember it on.**
   *
   * `custom.fixedX`/`fixedY` are ordinary per-mark config, so Grafana's override engine applies
   * them to a node that *is* a field. A node derived from an edge's endpoints is not — which is
   * every node of an edges-only response on a host that cannot run the `deriveNodes` pre-pass,
   * i.e. the default — so the coordinate never arrived and dragging could not be kept. The
   * position is read by name for exactly those marks; the same escape hatch as the legend's
   * colour and visibility reads.
   */
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

    // The other node is still unpinned, so it keeps its seeded ring position rather than
    // inheriting the pinned one.
    it('leaves the nodes no override names where the seed put them', () => {
      const seeded = nodeAt(fixedLayout([wideEdges], pinning('a', 120, 340)), 'b');

      expect(Number.isFinite(seeded?.x)).toBe(true);
      expect(seeded).not.toMatchObject({ x: 120, y: 340 });
    });

    // A node that *is* a field has already been answered by the override engine, so the by-name
    // read must not be a second, competing source of truth for it.
    it('leaves a fielded node to the override engine', () => {
      const withNodes = fixedLayout([declaredNodes, wideEdges], pinning('a', 120, 340));

      expect(nodeAt(withNodes, 'a')).toMatchObject({ x: 120, y: 340 });
    });
  });

  /**
   * The legend's visibility override is an *exclude* matcher — "hide everything
   * except these" — so the kept list has to name every field the engine can reach,
   * not just the rows the legend drew. Edges are fields now, and they are not in the
   * legend, so leaving them out erases every link in the panel the moment one node is
   * hidden. See `ChartModule.getOverrideTargetNames`.
   */
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

    // Not a preference: `ChordSeries` pins `coordinateSystem: 'none'` and declares no
    // `roam`, so there is no view to scale and no action registered for it.
    it('has nothing to dispatch on a chord, which owns no view', () => {
      expect(relationsChartModule.getZoomAction?.(withZoom(chordCtx([nodesFrame, edgesFrame])))).toBeUndefined();
    });

    // A dashboard saved with the superseded single "Zoom and pan" switch keeps both.
    it('honours the superseded relationsRoam switch', () => {
      const context = ctx([nodesFrame, edgesFrame]);
      const legacy = { ...context, options: { ...context.options, relationsRoam: true } };

      expect(relationsChartModule.getZoomAction?.(legacy)).toEqual({ type: 'graphRoam', seriesIndex: 0 });
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

    // The bug this exists to prevent, driven through the real writer: hide one node
    // of three and the untouched edge must survive.
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

      // And the failure mode being prevented: a universe of legend rows alone leaves
      // every edge field out of the kept list, so the engine hides all of them and
      // `b->c` disappears along with the node nobody asked to hide.
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
