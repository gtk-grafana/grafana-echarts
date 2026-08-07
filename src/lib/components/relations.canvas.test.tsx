import { type FieldConfigSource, FieldType, toDataFrame } from '@grafana/data';
import { render } from '@testing-library/react';
import { type CanvasRenderingContext2DEvent } from 'jest-canvas-mock';
import { deriveNodes } from 'lib/echarts/converters/deriveNodes';
import { legacyToWide } from 'lib/echarts/converters/legacyToWide';
import { getChart, normalizeCanvasEvents, readCanvasLayer, SERIES_LAYER_SELECTOR, SERIES_ZLEVEL } from 'test/canvas';
import { getComponent, getSeriesCanvasEvents, height, waitForFinished, width } from 'test/panel';
import { type PanelOptions } from 'types';

// Relations (graph) canvas snapshots, mirroring `part-to-whole.canvas.test.tsx`.
// The graph series is axis-less — it creates its own `View` coordinate system and
// paints nothing on the default grid layer — so only the series layer is read, via
// the tolerant `getSeriesCanvasEvents` (like pie/funnel/hierarchy).
//
// **Most layouts are pinned deliberately.** `layout: 'circular'` (deterministic ring
// placement) or `none` with `fixedx`/`fixedy` from the data keeps a snapshot readable
// as "these nodes, these links" rather than as an artefact of the simulation. The
// force layout is now reproducible too — see the `force layout` block, which is the
// test for that — but its coordinates carry no meaning, so it is not snapshotted.
//
// Rendered in Advanced editor mode so the advanced options these tests exercise
// (edge arrows, curveness, link color, edge values) are respected as-is; in Default
// mode `applyEditorModeDefaults` resets every advanced option. `animation: { enabled:
// false }` is explicit because the relations family defaults it *on*, and a snapshot
// taken mid-animation is not a snapshot of anything.
const canvasOptions = (extra: Partial<PanelOptions> = {}): Partial<PanelOptions> => ({
  zLevel: { series: SERIES_ZLEVEL },
  animation: { enabled: false },
  editorMode: 'advanced',
  relationsLayout: 'circular',
  ...extra,
});

/**
 * Fixtures are written in Grafana's row form, because that is what a datasource emits,
 * and converted the way the host does: by the transformations the plugin registers on
 * itself, which run above the panel (`modules/relations/dataTransformations.ts`). The
 * panel itself reads only the field-based contract, so every render here goes through
 * the same conversion the real pipeline performs.
 *
 * **Both halves of the prefix, in the host's order.** `legacyToWide` reshapes, then
 * `deriveNodes` declares any node the response only implied — which for an edges-only
 * fixture is all of them. Adding the second half changed no snapshot in this file, which
 * is the guarantee it is built around: the pre-pass adds configurability, not marks, so a
 * dashboard looks the same on a host that cannot run it.
 */
const asPipelineWould = (frames: Parameters<typeof getComponent>[0]): Parameters<typeof getComponent>[0] =>
  deriveNodes(legacyToWide(frames));

/**
 * The text of every label actually painted, so a label test can assert what was drawn
 * rather than only pin it. Draw calls accumulate across the harness's two render passes
 * (see todo/canvas-snapshot-double-render.md), which is fine for both uses here: the
 * *content* of a truncated label, and a *comparison* of two renders counted the same way.
 */
const labelTexts = (events: CanvasRenderingContext2DEvent[]): string[] =>
  events.filter((event) => event.type === 'fillText').map((event) => String(event.props.text));

/**
 * `prefix` is the pipeline prefix to run the fixture through, and only the derived-node
 * cases pass one: they compare a render against the same render with the *other* prefix,
 * which is how "the pre-pass changes nothing visible" and "the override is inert without
 * it" are stated as claims rather than as two snapshot files.
 */
const renderGraph = async (
  frames: Parameters<typeof getComponent>[0],
  options: Partial<PanelOptions> = {},
  fieldConfig?: FieldConfigSource,
  prefix: (frames: Parameters<typeof getComponent>[0]) => Parameters<typeof getComponent>[0] = asPipelineWould
) => {
  const { container } = render(
    getComponent(prefix(frames), 'graph', canvasOptions(options), undefined, undefined, 'relations', fieldConfig)
  );
  return getSeriesCanvasEvents(container);
};

// The sankey variant needs no layout pinning: it self-layouts into columns from the
// link weights, with no physics simulation, so its geometry is already deterministic.
// `relationsLayout` is left off since it is a graph-only option.
const renderSankey = async (
  frames: Parameters<typeof getComponent>[0],
  options: Partial<PanelOptions> = {},
  fieldConfig?: FieldConfigSource
) => {
  const { container } = render(
    getComponent(
      asPipelineWould(frames),
      'sankey',
      { ...canvasOptions(options), relationsLayout: undefined },
      undefined,
      undefined,
      'relations',
      fieldConfig
    )
  );
  return getSeriesCanvasEvents(container);
};

// Chord self-layouts into a ring from the link weights, so like sankey it needs no
// layout pinning and `relationsLayout` (graph-only) is left off.
const renderChord = async (
  frames: Parameters<typeof getComponent>[0],
  options: Partial<PanelOptions> = {},
  fieldConfig?: FieldConfigSource
) => {
  const { container } = render(
    getComponent(
      asPipelineWould(frames),
      'chord',
      { ...canvasOptions(options), relationsLayout: undefined },
      undefined,
      undefined,
      'relations',
      fieldConfig
    )
  );
  return getSeriesCanvasEvents(container);
};

/**
 * Zoom is the panel's own buttons, not ECharts' scroll wheel, and this is the claim
 * that rests on: the roam **action** scales the view even though `roam` is `false`.
 *
 * It holds because the action is registered independently of the controller
 * (`registerRoamActionSimply`) and resolves the series' view coordinate system directly
 * (`getOwnRoamViewCoordSys`), where `roam` only decides whether the *mouse* is bound. If
 * that ever stopped being true the buttons would silently do nothing, so it is asserted
 * on the pixels rather than on the option.
 */
describe('relations zoom buttons', () => {
  const nodes = toDataFrame({
    name: 'nodes',
    fields: [
      { name: 'id', type: FieldType.string, values: ['a', 'b', 'c'] },
      { name: 'mainstat', type: FieldType.number, values: [10, 20, 30] },
    ],
  });
  const edges = toDataFrame({
    name: 'edges',
    fields: [
      { name: 'id', type: FieldType.string, values: ['e1', 'e2'] },
      { name: 'source', type: FieldType.string, values: ['a', 'b'] },
      { name: 'target', type: FieldType.string, values: ['b', 'c'] },
      { name: 'mainstat', type: FieldType.number, values: [1, 2] },
    ],
  });

  it('scales the view from the roam action while scroll-to-zoom stays off', async () => {
    const { container } = render(
      getComponent(
        asPipelineWould([nodes, edges]),
        'graph',
        canvasOptions({ relationsZoom: true }),
        undefined,
        undefined,
        'relations'
      )
    );
    const { chartInstanceDom, chart } = getChart(container);
    await waitForFinished(chart);

    // Pan is off, so the wheel is not bound — which is the point of the buttons.
    const series = (chart!.getOption() as { series: Array<{ roam?: unknown }> }).series[0];
    expect(series.roam).toBe(false);

    const before = readCanvasLayer(chartInstanceDom, SERIES_LAYER_SELECTOR).length;
    chart!.dispatchAction({ type: 'graphRoam', seriesIndex: 0, zoom: 1.5, originX: width / 2, originY: height / 2 });
    chart!.getZr().flush();
    const after = readCanvasLayer(chartInstanceDom, SERIES_LAYER_SELECTOR);

    // jest-canvas-mock accumulates draw calls, so the repaint shows up as more of them.
    // The transform is what actually moved: a scaled view writes a new `setTransform`.
    expect(after.length).toBeGreaterThan(before);
    const scales = after
      .filter((event) => event.type === 'setTransform')
      .map((event) => (event.props as { a?: number }).a);
    expect(scales.some((scale) => scale != null && Math.abs(scale - 1) > 1e-6)).toBe(true);
  });
});

describe('relations (graph) canvas renders', () => {
  // A small service graph: gateway fans out to api and web, both of which call db.
  const nodesFrame = toDataFrame({
    name: 'nodes',
    fields: [
      { name: 'id', type: FieldType.string, values: ['gateway', 'api', 'web', 'db'] },
      { name: 'title', type: FieldType.string, values: ['Gateway', 'API', 'Web', 'DB'] },
      { name: 'mainstat', type: FieldType.number, values: [120, 80, 60, 200] },
    ],
  });

  const edgesFrame = toDataFrame({
    name: 'edges',
    fields: [
      { name: 'id', type: FieldType.string, values: ['e1', 'e2', 'e3', 'e4'] },
      { name: 'source', type: FieldType.string, values: ['gateway', 'gateway', 'api', 'web'] },
      { name: 'target', type: FieldType.string, values: ['api', 'web', 'db', 'db'] },
      { name: 'mainstat', type: FieldType.number, values: [100, 50, 90, 40] },
    ],
  });

  describe('base', () => {
    // One symbol per node, one line per link, node labels on — the default render
    // the other cases build on.
    it('draws a node per row and a link per edge', async () => {
      const { defaultEvents, seriesEvents } = await renderGraph([nodesFrame, edgesFrame]);

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });

    // Grafana derives nodes from the edges when no nodes frame is supplied, so this
    // must render the same four nodes — labelled by id rather than title.
    it('renders an edges-only response', async () => {
      const { defaultEvents, seriesEvents } = await renderGraph([edgesFrame]);

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });
  });

  /**
   * The force layout is **reproducible**, which it was not: `forceHelper` seeds every
   * node at `Math.random()` inside the view rect when the item carries no `x`/`y`, so
   * the same frames drew a different graph on every render and the panel appeared to
   * shuffle its nodes on each refresh. `force.initLayout: 'circular'` seeds them on a
   * ring in data order instead — see `RELATIONS_FORCE_INIT_LAYOUT`.
   *
   * Asserted as "two renders agree" rather than against a stored snapshot: what is
   * being claimed is reproducibility, not any particular set of coordinates, and a
   * baseline would additionally pin the simulation's arithmetic across ECharts
   * versions for no benefit.
   */
  describe('force layout', () => {
    it('draws the same graph twice from the same frames', async () => {
      const first = await renderGraph([nodesFrame, edgesFrame], { relationsLayout: 'force' });
      const second = await renderGraph([nodesFrame, edgesFrame], { relationsLayout: 'force' });

      expect(normalizeCanvasEvents(second.seriesEvents)).toEqual(normalizeCanvasEvents(first.seriesEvents));
      // Guard against the assertion passing on two empty layers.
      expect(first.seriesEvents.length).toBeGreaterThan(0);
    });

    // The same claim for an edges-only response, where every node is derived and
    // therefore carries no stat — the case `initLayout: 'circular'` distributes evenly
    // (`sum` is 0, so every node gets an equal slice) rather than by value.
    it('draws the same derived-node graph twice', async () => {
      const first = await renderGraph([edgesFrame], { relationsLayout: 'force' });
      const second = await renderGraph([edgesFrame], { relationsLayout: 'force' });

      expect(normalizeCanvasEvents(second.seriesEvents)).toEqual(normalizeCanvasEvents(first.seriesEvents));
      expect(first.seriesEvents.length).toBeGreaterThan(0);
    });
  });

  describe('layout', () => {
    // `fixedx`/`fixedy` on every node selects `layout: 'none'` automatically, so the
    // server-provided coordinates are honored verbatim.
    it('honors fixed coordinates from the data', async () => {
      const pinnedNodes = toDataFrame({
        name: 'nodes',
        fields: [
          { name: 'id', type: FieldType.string, values: ['gateway', 'api', 'web', 'db'] },
          { name: 'title', type: FieldType.string, values: ['Gateway', 'API', 'Web', 'DB'] },
          { name: 'mainstat', type: FieldType.number, values: [120, 80, 60, 200] },
          { name: 'fixedx', type: FieldType.number, values: [50, 150, 150, 250] },
          { name: 'fixedy', type: FieldType.number, values: [150, 80, 220, 150] },
        ],
      });
      // Unset so the all-pinned heuristic picks `none` rather than the harness default.
      const { defaultEvents, seriesEvents } = await renderGraph([pinnedNodes, edgesFrame], {
        relationsLayout: undefined,
      });

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });
  });

  describe('nodes', () => {
    // `noderadius` overrides the panel-level size per node, so the symbols differ.
    it('sizes nodes from noderadius', async () => {
      const sizedNodes = toDataFrame({
        name: 'nodes',
        fields: [
          { name: 'id', type: FieldType.string, values: ['gateway', 'api', 'web', 'db'] },
          { name: 'noderadius', type: FieldType.number, values: [30, 12, 12, 44] },
        ],
      });
      const { defaultEvents, seriesEvents } = await renderGraph([sizedNodes, edgesFrame]);

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });

    it('hides node labels when switched off', async () => {
      const { defaultEvents, seriesEvents } = await renderGraph([nodesFrame, edgesFrame], {
        relationsShowNodeLabels: false,
      });

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });

    /**
     * Long names are ellipsised at the label width rather than allowed to run into the
     * next node, and a label that would still collide with one already placed is dropped
     * outright. Both are on by default — see `RELATIONS_LABEL_OVERFLOW_DEFAULT` and
     * `RELATIONS_HIDE_OVERLAPPING_LABELS_DEFAULT`.
     *
     * **Both are asserted on the drawn text, not only snapshotted**, and the widths are
     * scaled to the harness rather than left at the defaults. `jest-canvas-mock`'s
     * `TextMetrics` reports `width = text.length` — one pixel per character — so at the
     * real 120px default a 30-character name measures 30 and nothing ever truncates or
     * collides. The mechanism is identical either way; only the scale differs, so the
     * fixtures pick widths that reach it. See `crowdedLabelOptions`.
     */
    // Twelve nodes on a 400x300 ring, each named long enough that neighbouring label
    // boxes genuinely intersect under the harness metric.
    const crowdedIds = [
      'gateway',
      'api',
      'web',
      'db',
      'cache',
      'queue',
      'search',
      'auth',
      'billing',
      'notify',
      'audit',
      'report',
    ];
    const crowdedNodes = toDataFrame({
      name: 'nodes',
      fields: [
        { name: 'id', type: FieldType.string, values: crowdedIds },
        {
          name: 'title',
          type: FieldType.string,
          values: crowdedIds.map((id) => `${id}-service-primary-eu-west-1-with-a-name-that-keeps-going`),
        },
        { name: 'mainstat', type: FieldType.number, values: crowdedIds.map((_, index) => 20 + index * 15) },
      ],
    });

    const crowdedEdges = toDataFrame({
      name: 'edges',
      fields: [
        { name: 'id', type: FieldType.string, values: crowdedIds.slice(1).map((_, index) => `e${index}`) },
        { name: 'source', type: FieldType.string, values: crowdedIds.slice(0, -1) },
        { name: 'target', type: FieldType.string, values: crowdedIds.slice(1) },
        { name: 'mainstat', type: FieldType.number, values: crowdedIds.slice(1).map((_, index) => 10 + index * 5) },
      ],
    });

    it('truncates a long label at the label width', async () => {
      const { defaultEvents, seriesEvents } = await renderGraph([crowdedNodes, crowdedEdges], {
        // 14 "px" = 14 characters under the harness metric; overlap hiding off so the
        // claim is about truncation alone.
        relationsLabelWidth: 14,
        relationsHideOverlappingLabels: false,
      });

      const drawn = labelTexts(seriesEvents);
      expect(drawn.length).toBeGreaterThan(0);
      expect(drawn.every((text) => text.endsWith('...') && text.length <= 14)).toBe(true);

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });

    it('wraps a long label instead of truncating it', async () => {
      const { defaultEvents, seriesEvents } = await renderGraph([crowdedNodes, crowdedEdges], {
        relationsLabelOverflow: 'break',
        relationsLabelWidth: 14,
        relationsHideOverlappingLabels: false,
      });

      // Wrapping emits one draw per line rather than one per node, and no ellipsis.
      expect(labelTexts(seriesEvents).some((text) => text.endsWith('...'))).toBe(false);

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });

    it('drops a label that would collide with one already drawn', async () => {
      const hidden = await renderGraph([crowdedNodes, crowdedEdges], { relationsLabelOverflow: 'none' });
      const overlapping = await renderGraph([crowdedNodes, crowdedEdges], {
        relationsLabelOverflow: 'none',
        relationsHideOverlappingLabels: false,
      });

      expect(labelTexts(hidden.seriesEvents).length).toBeLessThan(labelTexts(overlapping.seriesEvents).length);

      expect(normalizeCanvasEvents(hidden.seriesEvents)).toMatchCanvasSnapshot(hidden.defaultEvents, {
        width,
        height,
      });
    });

    // A per-node `color` field wins over the palette; `db` is explicitly red.
    it('colors nodes from the color field', async () => {
      const coloredNodes = toDataFrame({
        name: 'nodes',
        fields: [
          { name: 'id', type: FieldType.string, values: ['gateway', 'api', 'web', 'db'] },
          { name: 'color', type: FieldType.string, values: ['#1f78c1', '#37872d', '#e0b400', '#c4162a'] },
        ],
      });
      const { defaultEvents, seriesEvents } = await renderGraph([coloredNodes, edgesFrame]);

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });
  });

  describe('links', () => {
    // Per-edge `thickness` and `strokedasharray` map to line width and dash type.
    it('styles links from thickness and strokedasharray', async () => {
      const styledEdges = toDataFrame({
        name: 'edges',
        fields: [
          { name: 'id', type: FieldType.string, values: ['e1', 'e2', 'e3', 'e4'] },
          { name: 'source', type: FieldType.string, values: ['gateway', 'gateway', 'api', 'web'] },
          { name: 'target', type: FieldType.string, values: ['api', 'web', 'db', 'db'] },
          { name: 'thickness', type: FieldType.number, values: [1, 4, 2, 6] },
          { name: 'strokedasharray', type: FieldType.string, values: ['', '5 5', '1 3', ''] },
        ],
      });
      const { defaultEvents, seriesEvents } = await renderGraph([nodesFrame, styledEdges]);

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });

    // Arrowheads are on by default now (the base case above draws them); this is the
    // opt-out. See `RELATIONS_EDGE_ARROWS_DEFAULT`.
    it('omits arrowheads when switched off (Advanced)', async () => {
      const { defaultEvents, seriesEvents } = await renderGraph([nodesFrame, edgesFrame], {
        relationsEdgeArrows: false,
      });

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });

    // Overlap hiding off, because an edge label sits at the link's midpoint and would
    // otherwise be arbitrated against the node labels — the weights are what this pins.
    it('draws each edge weight on the link (Advanced)', async () => {
      const { defaultEvents, seriesEvents } = await renderGraph([nodesFrame, edgesFrame], {
        relationsShowEdgeValues: true,
        relationsHideOverlappingLabels: false,
      });

      expect(labelTexts(seriesEvents)).toEqual(expect.arrayContaining(['100', '50', '90', '40']));

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });

    it('curves links (Advanced)', async () => {
      const { defaultEvents, seriesEvents } = await renderGraph([nodesFrame, edgesFrame], {
        relationsCurveness: 0.3,
      });

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });

    it('blends link color between endpoints in gradient mode (Advanced)', async () => {
      const { defaultEvents, seriesEvents } = await renderGraph([nodesFrame, edgesFrame], {
        relationsLinkColor: 'gradient',
      });

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });

    /**
     * **The reported bug.** "Link color" did nothing at all on a graph: ECharts'
     * `edgeVisual` swaps the `'source'` / `'target'` keywords for the endpoint node's
     * fill at `PRIORITY.VISUAL.CHART` (3000), but the task that applies each node's own
     * `itemStyle.color` runs at `CHART_DATA_CUSTOM` (4500) — so the swap read a colour
     * the nodes did not have yet and every edge came out the same palette blue,
     * whichever mode was picked. The colours are resolved in the panel now; see
     * `resolveLinkColor`.
     *
     * Stated as "the two modes differ" before either is snapshotted, because that is
     * the claim the snapshots cannot make on their own.
     */
    it('colors links from the endpoint the mode names (Advanced)', async () => {
      const source = await renderGraph([nodesFrame, edgesFrame], { relationsLinkColor: 'source' });
      const target = await renderGraph([nodesFrame, edgesFrame], { relationsLinkColor: 'target' });

      expect(normalizeCanvasEvents(source.seriesEvents)).not.toEqual(normalizeCanvasEvents(target.seriesEvents));

      expect(normalizeCanvasEvents(source.seriesEvents)).toMatchCanvasSnapshot(source.defaultEvents, {
        width,
        height,
      });
      expect(normalizeCanvasEvents(target.seriesEvents)).toMatchCanvasSnapshot(target.defaultEvents, {
        width,
        height,
      });
    });
  });

  describe('field config', () => {
    // A byName fixed-color override recolors one node, matching the legend picker.
    it('honors a byName color override', async () => {
      const fieldConfig: FieldConfigSource = {
        defaults: {},
        overrides: [
          {
            matcher: { id: 'byName', options: 'DB' },
            properties: [{ id: 'color', value: { mode: 'fixed', fixedColor: 'red' } }],
          },
        ],
      };
      const { defaultEvents, seriesEvents } = await renderGraph([nodesFrame, edgesFrame], {}, fieldConfig);

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });

    // An edge is a field under the wide contract, so "Hide in area" can name one —
    // something the row form could not express at all. `e1` is gateway->api, so the
    // node symbols are untouched and exactly one line goes missing.
    it('hides a single edge named by a byName override', async () => {
      const fieldConfig: FieldConfigSource = {
        defaults: {},
        overrides: [
          {
            matcher: { id: 'byName', options: 'e1' },
            properties: [{ id: 'custom.hideFrom', value: { viz: true, legend: false, tooltip: false } }],
          },
        ],
      };
      const { defaultEvents, seriesEvents } = await renderGraph([nodesFrame, edgesFrame], {}, fieldConfig);

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });

    // Per-edge `custom.curveness` beats the panel-level "Link curveness": `e1` bows
    // hard while the other three stay on the panel value.
    it('curves a single edge named by a byName override', async () => {
      const fieldConfig: FieldConfigSource = {
        defaults: {},
        overrides: [
          {
            matcher: { id: 'byName', options: 'e1' },
            properties: [{ id: 'custom.curveness', value: 0.6 }],
          },
        ],
      };
      const { defaultEvents, seriesEvents } = await renderGraph(
        [nodesFrame, edgesFrame],
        { relationsCurveness: 0.1 },
        fieldConfig
      );

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });
  });

  /**
   * A node no frame declares — inferred from an edge's endpoints — drawn as a mark the
   * override engine can reach. `converters/deriveNodes.ts` declares it as a field above the
   * panel, which is what `asPipelineWould` runs here; see
   * ../../../docs/relations-derived-nodes.md.
   *
   * The fixture is `edgesFrame` alone, so **every** node in these renders is derived: there
   * is no nodes frame anywhere in the response, and `db` is a name only the edges' `target`
   * column ever mentions.
   */
  describe('derived nodes', () => {
    /** Colour, size and label, all three on a node the response never declared. */
    const overrideDb: FieldConfigSource = {
      defaults: {},
      overrides: [
        {
          matcher: { id: 'byName', options: 'db' },
          properties: [
            { id: 'color', value: { mode: 'fixed', fixedColor: 'red' } },
            { id: 'custom.nodeRadius', value: 34 },
            { id: 'displayName', value: 'Database' },
          ],
        },
      ],
    };

    it('honors a byName override on a node only the edges imply', async () => {
      const { defaultEvents, seriesEvents } = await renderGraph([edgesFrame], {}, overrideDb);

      // The snapshot is only worth reading if the override moved something, so say so
      // here rather than trusting a reviewer to spot it in 22 kB of draw calls.
      const plain = await renderGraph([edgesFrame]);
      expect(normalizeCanvasEvents(seriesEvents)).not.toEqual(normalizeCanvasEvents(plain.seriesEvents));

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });

    /**
     * The control, and the reason the pre-pass exists: without it the same override has
     * nothing to match, because the node is invented inside the panel and the override
     * engine has already run. Asserted against the un-overridden render rather than as a
     * second snapshot — "identical to no override at all" is the claim.
     */
    it('leaves that same override inert when the pre-pass has not run', async () => {
      const overridden = await renderGraph([edgesFrame], {}, overrideDb, legacyToWide);
      const plain = await renderGraph([edgesFrame], {}, undefined, legacyToWide);

      expect(normalizeCanvasEvents(overridden.seriesEvents)).toEqual(normalizeCanvasEvents(plain.seriesEvents));
    });

    /**
     * The no-visual-change guarantee, checked on the pixels rather than on the model: the
     * two derivations produce the same nodes in the same order, so the same palette colours
     * land on the same symbols whether or not the host ran the pass.
     */
    it('draws the same graph with the pre-pass as without it', async () => {
      const withPass = await renderGraph([edgesFrame]);
      const withoutPass = await renderGraph([edgesFrame], {}, undefined, legacyToWide);

      expect(normalizeCanvasEvents(withPass.seriesEvents)).toEqual(normalizeCanvasEvents(withoutPass.seriesEvents));
    });

    /**
     * The stat slot is empty now, so "Show node values" adds no second line. It used to
     * print the node's degree — a link count wearing a measurement's clothes.
     */
    it('adds no value line under a derived node when node values are on', async () => {
      const { defaultEvents, seriesEvents } = await renderGraph([edgesFrame], { relationsShowNodeValues: true });

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });
  });

  // The sankey render variant over the same frames — one converter, two layouts.
  describe('sankey variant', () => {
    it('lays the same nodes and links out as flow ribbons', async () => {
      const { defaultEvents, seriesEvents } = await renderSankey([nodesFrame, edgesFrame]);

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });

    it('renders an edges-only response', async () => {
      const { defaultEvents, seriesEvents } = await renderSankey([edgesFrame]);

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });

    // **The single most important case in this file.** Without the converter's cycle
    // policy, `sankeyLayout.ts` throws here — in production too, since the throw is
    // not `__DEV__`-guarded — and the panel renders blank rather than degraded. A
    // non-empty series layer is the proof that it does not.
    //
    // Weights differ from the acyclic fixture deliberately: with matching weights the
    // surviving 4 links would be identical to the base case, and the snapshot would
    // duplicate it instead of pinning this render.
    it('renders a cyclic edge set instead of throwing', async () => {
      const cyclicEdges = toDataFrame({
        name: 'edges',
        fields: [
          { name: 'id', type: FieldType.string, values: ['e1', 'e2', 'e3', 'e4', 'e5'] },
          { name: 'source', type: FieldType.string, values: ['gateway', 'gateway', 'api', 'web', 'db'] },
          { name: 'target', type: FieldType.string, values: ['api', 'web', 'db', 'db', 'gateway'] },
          // `db -> gateway` closes the cycle and is the link expected to be dropped.
          { name: 'mainstat', type: FieldType.number, values: [70, 30, 65, 25, 15] },
        ],
      });
      const { defaultEvents, seriesEvents } = await renderSankey([nodesFrame, cyclicEdges]);

      expect(seriesEvents.length).toBeGreaterThan(0);
      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });

    /**
     * Vertical flow, where the node labels used to be drawn **over the next node's
     * fill**: ECharts places a sankey label `'right'` in both orientations, and
     * vertically the bars run along the row `nodeGap` (8px) apart, so a label 5px to
     * the right of one lands on its neighbour — unreadable against a saturated colour,
     * and colliding with that neighbour's own label. They sit below the bar now, in the
     * ribbon gap. See `getSankeyLabelPosition`.
     */
    it('lays out vertically when the flow direction is switched', async () => {
      const { defaultEvents, seriesEvents } = await renderSankey([nodesFrame, edgesFrame], {
        relationsSankeyOrient: 'vertical',
      });

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });

    // Long names in the vertical orientation, which is where the collision was worst:
    // truncation plus the below-the-bar position have to hold together.
    it('keeps long labels legible on a vertical flow', async () => {
      const longNodes = toDataFrame({
        name: 'nodes',
        fields: [
          { name: 'id', type: FieldType.string, values: ['gateway', 'api', 'web', 'db'] },
          {
            name: 'title',
            type: FieldType.string,
            values: [
              'edge-gateway-ingress-eu-west-1',
              'checkout-api-service-primary',
              'storefront-web-frontend-v2',
              'orders-postgres-primary-db',
            ],
          },
          { name: 'mainstat', type: FieldType.number, values: [120, 80, 60, 200] },
        ],
      });
      const { defaultEvents, seriesEvents } = await renderSankey([longNodes, edgesFrame], {
        relationsSankeyOrient: 'vertical',
      });

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });

    it('draws each ribbon weight on the ribbon (Advanced)', async () => {
      const { defaultEvents, seriesEvents } = await renderSankey([nodesFrame, edgesFrame], {
        relationsShowEdgeValues: true,
        relationsHideOverlappingLabels: false,
      });

      expect(labelTexts(seriesEvents)).toEqual(expect.arrayContaining(['100', '50', '90', '40']));

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });

    it('hides node labels when switched off', async () => {
      const { defaultEvents, seriesEvents } = await renderSankey([nodesFrame, edgesFrame], {
        relationsShowNodeLabels: false,
      });

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });

    // Node geometry is series-level for a sankey, not per-node as with `noderadius`.
    it('sizes node bars from node width and gap (Advanced)', async () => {
      const { defaultEvents, seriesEvents } = await renderSankey([nodesFrame, edgesFrame], {
        relationsSankeyNodeWidth: 32,
        relationsSankeyNodeGap: 20,
      });

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });

    it('raises ribbon opacity (Advanced)', async () => {
      const { defaultEvents, seriesEvents } = await renderSankey([nodesFrame, edgesFrame], {
        relationsSankeyLinkOpacity: 0.7,
      });

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });
  });

  // The chord render variant. Like sankey it self-layouts deterministically, so no
  // pinning is needed; unlike sankey it accepts cycles and self-loops directly.
  describe('chord variant', () => {
    it('lays the same nodes and links out as a ring of arcs', async () => {
      const { defaultEvents, seriesEvents } = await renderChord([nodesFrame, edgesFrame]);

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });

    it('renders an edges-only response', async () => {
      const { defaultEvents, seriesEvents } = await renderChord([edgesFrame]);

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });

    // The counterpart to the sankey cycle case: chord has no DAG restriction, so the
    // cyclic edge set renders with **every** link intact and no dropped-link note.
    it('renders a cyclic edge set with no links dropped', async () => {
      const cyclicEdges = toDataFrame({
        name: 'edges',
        fields: [
          { name: 'id', type: FieldType.string, values: ['e1', 'e2', 'e3', 'e4', 'e5'] },
          { name: 'source', type: FieldType.string, values: ['gateway', 'gateway', 'api', 'web', 'db'] },
          { name: 'target', type: FieldType.string, values: ['api', 'web', 'db', 'db', 'gateway'] },
          { name: 'mainstat', type: FieldType.number, values: [70, 30, 65, 25, 15] },
        ],
      });
      const { defaultEvents, seriesEvents } = await renderChord([nodesFrame, cyclicEdges]);

      expect(seriesEvents.length).toBeGreaterThan(0);
      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });

    it('hides node labels when switched off', async () => {
      const { defaultEvents, seriesEvents } = await renderChord([nodesFrame, edgesFrame], {
        relationsShowNodeLabels: false,
      });

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });

    it('rotates and reverses the ring (Advanced)', async () => {
      const { defaultEvents, seriesEvents } = await renderChord([nodesFrame, edgesFrame], {
        relationsChordStartAngle: 0,
        relationsChordClockwise: false,
      });

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });

    it('widens the gap between node arcs (Advanced)', async () => {
      const { defaultEvents, seriesEvents } = await renderChord([nodesFrame, edgesFrame], {
        relationsChordPadAngle: 12,
      });

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });

    /**
     * The chord's version of the pie's `avoidLabelOverlap`, which `series.chord` does
     * **not** have: a ring of many small arcs puts several labels at nearly the same
     * angle, so they pile into an unreadable smear. `series.chord` routes its labels
     * through the shared label-layout stage like every other series, so `hideOverlap` is
     * the lever. See `getRelationsLabelLayout`.
     *
     * Twelve nodes, four carrying real flow and eight reduced to slivers — the exact
     * shape the option exists for, since the slivers collapse into a narrow wedge and
     * their labels stack on one another.
     *
     * **One label is dropped here, and many more would be in a browser.** The harness's
     * `TextMetrics` reports one pixel per character (see `crowdedNodes`), so a chord
     * label is a quarter of its real width and only the most collapsed pair actually
     * intersects. The assertion is therefore "fewer, with the switch on" rather than a
     * count; the option-level wiring is pinned in `options/chord.test.ts`.
     */
    const ringIds = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l'];
    const manySmallEdges = toDataFrame({
      name: 'edges',
      fields: [
        { name: 'id', type: FieldType.string, values: ringIds.map((_, index) => `e${index}`) },
        { name: 'source', type: FieldType.string, values: ringIds },
        { name: 'target', type: FieldType.string, values: [...ringIds.slice(1), ringIds[0]] },
        { name: 'mainstat', type: FieldType.number, values: ringIds.map((_, index) => (index < 4 ? 200 : 1)) },
      ],
    });
    const ringNodes = toDataFrame({
      name: 'nodes',
      fields: [
        { name: 'id', type: FieldType.string, values: ringIds },
        {
          name: 'title',
          type: FieldType.string,
          values: ringIds.map((id) => `${id}-service-primary-eu-west-1`),
        },
      ],
    });

    it('drops labels that collide on a ring of small arcs', async () => {
      const hidden = await renderChord([ringNodes, manySmallEdges], { relationsLabelOverflow: 'none' });
      const overlapping = await renderChord([ringNodes, manySmallEdges], {
        relationsLabelOverflow: 'none',
        relationsHideOverlappingLabels: false,
      });

      expect(labelTexts(hidden.seriesEvents).length).toBeLessThan(labelTexts(overlapping.seriesEvents).length);

      expect(normalizeCanvasEvents(hidden.seriesEvents)).toMatchCanvasSnapshot(hidden.defaultEvents, {
        width,
        height,
      });
    });
  });
});
