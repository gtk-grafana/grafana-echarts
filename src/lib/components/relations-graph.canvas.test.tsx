import { FieldType, toDataFrame } from '@grafana/data';
import { normalizeCanvasEvents } from 'test/canvas';
import { height, width } from 'test/panel';
import { edgesFrame, nodesFrame, pinnedNodesFrame } from 'test/relations';
import { renderRelations } from 'test/relationsCanvas';

// Canvas snapshots for the relations family's `graph` variant. Every test here is a
// snapshot test — the baseline *is* the assertion, reviewed as an image. Claims that
// are about a relation between two renders rather than about one picture live in the
// `relations-*.integration.test.tsx` siblings, which commit no baseline.
//
// See `test/relationsCanvas.tsx` for the harness, the pinned layout and the editor
// mode; `test/relations.ts` for the fixtures.

describe('relations graph', () => {
  describe('base', () => {
    // One symbol per node, one line per link, node labels on — the default render the
    // other cases build on.
    it('nodes and links at their defaults (four labelled symbols joined by arrowed lines)', async () => {
      const { defaultEvents, seriesEvents } = await renderRelations({ frames: [nodesFrame, edgesFrame] });

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });

    // Grafana derives nodes from the edges when no nodes frame is supplied, so this
    // must render the same four nodes — labelled by id rather than title.
    it('an edges-only response (the same four nodes, labelled by id)', async () => {
      const { defaultEvents, seriesEvents } = await renderRelations({ frames: [edgesFrame] });

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });
  });

  describe('layout', () => {
    // `fixedx`/`fixedy` on every node selects `layout: 'none'` automatically, so the
    // server-provided coordinates are honored verbatim. `relationsLayout` is unset so
    // the all-pinned heuristic picks `none` rather than the harness default.
    it("fixed coordinates from the data (nodes at the server's x and y, not on a ring)", async () => {
      const { defaultEvents, seriesEvents } = await renderRelations({
        frames: [pinnedNodesFrame, edgesFrame],
        options: { relationsLayout: undefined },
      });

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });
  });

  describe('nodes', () => {
    // `noderadius` overrides the panel-level size per node, so the symbols differ.
    it('noderadius per node (one large symbol, two small, one larger still)', async () => {
      const sizedNodes = toDataFrame({
        name: 'nodes',
        fields: [
          { name: 'id', type: FieldType.string, values: ['gateway', 'api', 'web', 'db'] },
          { name: 'noderadius', type: FieldType.number, values: [30, 12, 12, 44] },
        ],
      });
      const { defaultEvents, seriesEvents } = await renderRelations({ frames: [sizedNodes, edgesFrame] });

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });

    it('node labels off (symbols and links, no text)', async () => {
      const { defaultEvents, seriesEvents } = await renderRelations({
        frames: [nodesFrame, edgesFrame],
        options: { relationsShowNodeLabels: false },
      });

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });

    // A per-node `color` field wins over the palette; `db` is explicitly red.
    it('a color field per node (blue, green, yellow and red symbols)', async () => {
      const coloredNodes = toDataFrame({
        name: 'nodes',
        fields: [
          { name: 'id', type: FieldType.string, values: ['gateway', 'api', 'web', 'db'] },
          { name: 'color', type: FieldType.string, values: ['#1f78c1', '#37872d', '#e0b400', '#c4162a'] },
        ],
      });
      const { defaultEvents, seriesEvents } = await renderRelations({ frames: [coloredNodes, edgesFrame] });

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });
  });

  describe('links', () => {
    // Per-edge `thickness` and `strokedasharray` map to line width and dash type.
    it('thickness and strokedasharray per edge (thin solid, thick dashed, dotted, thickest solid)', async () => {
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
      const { defaultEvents, seriesEvents } = await renderRelations({ frames: [nodesFrame, styledEdges] });

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });

    // Arrowheads are on by default (the base case draws them); this is the opt-out.
    // See `RELATIONS_EDGE_ARROWS_DEFAULT`.
    it('arrows off (plain lines, no heads)', async () => {
      const { defaultEvents, seriesEvents } = await renderRelations({
        frames: [nodesFrame, edgesFrame],
        options: { relationsEdgeArrows: false },
      });

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });

    // Overlap hiding off, because an edge label sits at the link's midpoint and would
    // otherwise be arbitrated against the node labels — the weights are what this pins.
    // Which value survives a collision, and when, is
    // `relations-labels.integration.test.tsx`.
    it("edge values on (a weight drawn at each link's midpoint)", async () => {
      const { defaultEvents, seriesEvents } = await renderRelations({
        frames: [nodesFrame, edgesFrame],
        options: { relationsShowEdgeValues: true, relationsHideOverlappingLabels: false },
      });

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });

    it('curveness 0.3 (links bowed away from the straight line)', async () => {
      const { defaultEvents, seriesEvents } = await renderRelations({
        frames: [nodesFrame, edgesFrame],
        options: { relationsCurveness: 0.3 },
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
     * Both modes are snapshotted from one test, under the `source` / `target` snapshot
     * hints, so the pair reads as one picture with two settings rather than as two
     * unrelated baselines. That they *differ* is asserted first, because two identical
     * baselines would state nothing.
     */
    it("link color by endpoint (each line takes one end's colour)", async () => {
      const source = await renderRelations({
        frames: [nodesFrame, edgesFrame],
        options: { relationsLinkColor: 'source' },
      });
      const target = await renderRelations({
        frames: [nodesFrame, edgesFrame],
        options: { relationsLinkColor: 'target' },
      });

      expect(normalizeCanvasEvents(source.seriesEvents)).not.toEqual(normalizeCanvasEvents(target.seriesEvents));

      expect(normalizeCanvasEvents(source.seriesEvents)).toMatchCanvasSnapshot(
        source.defaultEvents,
        { width, height },
        'source'
      );
      expect(normalizeCanvasEvents(target.seriesEvents)).toMatchCanvasSnapshot(
        target.defaultEvents,
        { width, height },
        'target'
      );
    });

    /**
     * Gradient is the family's *default* link colour, and it can only be **oriented**
     * where the node positions are known — zrender resolves a non-global gradient
     * against the shape's bounding box, so `x: 0 -> x2: 1` runs source-to-target only if
     * the source happens to sit on the left. Under force or circular the positions do
     * not exist until after ECharts has laid the graph out, so the blend degrades to the
     * source colour. See `makeEdgeGradientResolver`.
     *
     * The layout is therefore the condition, not the option, which is why this is the
     * one graph baseline taken under `layout: 'none'` with explicit node colours: the
     * blend has to be visible in the picture to be worth reviewing as one. That the
     * degradation is real — no gradient under circular — is asserted in
     * `relations-layout.integration.test.tsx`, where it costs no baseline.
     */
    it('gradient link color on a fixed layout (each line blends its source colour into its target)', async () => {
      const coloredPinned = toDataFrame({
        name: 'nodes',
        fields: [
          { name: 'id', type: FieldType.string, values: ['gateway', 'api', 'web', 'db'] },
          { name: 'title', type: FieldType.string, values: ['Gateway', 'API', 'Web', 'DB'] },
          { name: 'color', type: FieldType.string, values: ['#1f78c1', '#37872d', '#e0b400', '#c4162a'] },
          { name: 'fixedx', type: FieldType.number, values: [50, 150, 150, 250] },
          { name: 'fixedy', type: FieldType.number, values: [150, 80, 220, 150] },
        ],
      });
      const { defaultEvents, seriesEvents } = await renderRelations({
        frames: [coloredPinned, edgesFrame],
        options: { relationsLayout: undefined, relationsLinkColor: 'gradient' },
      });

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });
  });
});
