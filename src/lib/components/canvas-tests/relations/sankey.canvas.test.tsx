import { FieldType, toDataFrame } from '@grafana/data';
import { normalizeCanvasEvents } from 'test/canvas';
import { height, width } from 'test/panel';
import { cyclicEdgesFrame, edgesFrame, nodesFrame, slackEdgesFrame } from 'test/relations';
import { renderRelations } from 'test/relationsCanvas';

// Canvas snapshots for the relations family's `sankey` variant — the same converter
// and the same frames as the graph, laid out as flow ribbons. It self-layouts into
// columns from the link weights, with no physics simulation, so its geometry is
// already deterministic and no layout is pinned.
//
// Every test here is a snapshot test; the relations claims that compare two renders
// live in the `relations-*.integration.test.tsx` siblings.

const renderSankey = (input: Omit<Parameters<typeof renderRelations>[0], 'variant'>) =>
  renderRelations({ ...input, variant: 'sankey' });

describe('relations sankey', () => {
  describe('base', () => {
    it('the same nodes and links as flow ribbons (four bars in columns, ribbons weighted by value)', async () => {
      const { defaultEvents, seriesEvents } = await renderSankey({ frames: [nodesFrame, edgesFrame] });

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });

    it('an edges-only response (the same columns, labelled by id)', async () => {
      const { defaultEvents, seriesEvents } = await renderSankey({ frames: [edgesFrame] });

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });

    // **The single most important case in this file.** Without the converter's cycle
    // policy, `sankeyLayout.ts` throws here — in production too, since the throw is not
    // `__DEV__`-guarded — and the panel renders blank rather than degraded. A non-empty
    // series layer is the proof that it does not; `db -> gateway` closes the cycle and
    // is the link expected to be dropped.
    it('a cyclic edge set (the back-edge dropped, the other four drawn)', async () => {
      const { defaultEvents, seriesEvents } = await renderSankey({ frames: [nodesFrame, cyclicEdgesFrame] });

      expect(seriesEvents.length).toBeGreaterThan(0);
      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });
  });

  describe('orientation', () => {
    /**
     * Vertical flow, where the labels sit **below** their bar, in the ribbon gap.
     * ECharts places a sankey label `'right'` in both orientations, and vertically the
     * bars run along the row `nodeGap` (8px) apart — so a label 5px to the right of one
     * lands on its neighbour's fill, unreadable against a saturated colour and colliding
     * with that neighbour's own label. See `getSankeyLabelPosition`.
     */
    it('vertical flow (bars in rows, each label below its bar)', async () => {
      const { defaultEvents, seriesEvents } = await renderSankey({
        frames: [nodesFrame, edgesFrame],
        options: { relationsSankeyOrient: 'vertical' },
      });

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });

    // Long names in the vertical orientation, which is where the collision was worst:
    // truncation plus the below-the-bar position have to hold together.
    it('long names on a vertical flow (each truncated, none over the next bar)', async () => {
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
      const { defaultEvents, seriesEvents } = await renderSankey({
        frames: [longNodes, edgesFrame],
        options: { relationsSankeyOrient: 'vertical' },
      });

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });
  });

  describe('labels', () => {
    it('edge values on (a weight drawn on each ribbon)', async () => {
      const { defaultEvents, seriesEvents } = await renderSankey({
        frames: [nodesFrame, edgesFrame],
        options: { relationsShowEdgeValues: true, relationsHideOverlappingLabels: false },
      });

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });

    it('node labels off (bars and ribbons, no text)', async () => {
      const { defaultEvents, seriesEvents } = await renderSankey({
        frames: [nodesFrame, edgesFrame],
        options: { relationsShowNodeLabels: false },
      });

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });
  });

  describe('geometry', () => {
    // Node geometry is series-level for a sankey, not per-node as with `noderadius`.
    it('node width 32 and gap 20 (wider bars, further apart)', async () => {
      const { defaultEvents, seriesEvents } = await renderSankey({
        frames: [nodesFrame, edgesFrame],
        options: { relationsSankeyNodeWidth: 32, relationsSankeyNodeGap: 20 },
      });

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });

    it('ribbon opacity 0.7 (ribbons nearly solid over the background)', async () => {
      const { defaultEvents, seriesEvents } = await renderSankey({
        frames: [nodesFrame, edgesFrame],
        options: { relationsSankeyLinkOpacity: 0.7 },
      });

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });

    /**
     * Node alignment decides which column a node with *slack* lands in: `left` (the
     * family default) keeps a terminal node in its earliest possible column, `justify`
     * pushes it to the last one.
     *
     * **Not `nodesFrame`**, deliberately. Its four nodes form a diamond in which every
     * node's earliest column is already its justified one, so the two settings draw
     * identical pictures and a baseline taken on it would pin nothing. `cache` here is the
     * node with slack — a leaf hanging off `gateway` while the chain runs two more columns.
     *
     * The *contrast* between the two settings is asserted in
     * `integration-tests/relations/layout.integration.test.tsx`, not here. A `not.toEqual`
     * beside this baseline would be **vacuous**: a sankey's ribbons carry gradient objects,
     * so two renders are never `toEqual` whatever their geometry, and the guard would pass
     * no matter what. It also does not belong in a canvas suite — see the
     * one-kind-of-test-per-file rule in AGENTS.md.
     */
    it('node align left (a leaf kept in its earliest column, not pushed to the last)', async () => {
      const { defaultEvents, seriesEvents } = await renderSankey({
        frames: [slackEdgesFrame],
        options: { relationsSankeyNodeAlign: 'left' },
      });

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });

    /**
     * A ribbon is drawn as a pair of bezier edges whose control points are placed by
     * this value; at 0 the two columns are joined by straight sides instead. Pinned
     * because it is one of the two options in the family that moves a *curve* — the
     * other is the graph's own curveness — and a curve is what an assertion states
     * worst and a baseline best.
     */
    it('ribbon curveness 0 (straight-sided ribbons between the columns)', async () => {
      const { defaultEvents, seriesEvents } = await renderSankey({
        frames: [nodesFrame, edgesFrame],
        options: { relationsSankeyCurveness: 0 },
      });

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });
  });
});
