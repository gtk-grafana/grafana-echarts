import { FieldType, toDataFrame } from '@grafana/data';
import { normalizeCanvasEvents } from 'test/canvas';
import { edgesFrame, nodesFrame } from 'test/relations';
import { labelTexts, renderRelations } from 'test/relationsCanvas';

/**
 * How the graph variant places its nodes: that a force layout is *reproducible*, that
 * Fixed draws every node whether or not the data pinned it, and that the one thing
 * downstream of a known position — an oriented edge gradient — appears exactly where
 * positions exist.
 *
 * **No baselines here, by construction.** Each claim is about a relation between two
 * renders (or about the absence of a draw call), and a stored picture would pin the
 * simulation's arithmetic across ECharts versions for no benefit. The layouts that *do*
 * carry a reviewable picture — Fixed with server coordinates, and the gradient it makes
 * orientable — are snapshotted in `relations-graph.canvas.test.tsx`.
 */
describe('relations layout', () => {
  /**
   * The force layout is **reproducible**, which it was not: `forceHelper` seeds every
   * node at `Math.random()` inside the view rect when the item carries no `x`/`y`, so the
   * same frames drew a different graph on every render and the panel appeared to shuffle
   * its nodes on each refresh. `force.initLayout: 'circular'` seeds them on a ring in
   * data order instead — see `RELATIONS_FORCE_INIT_LAYOUT`.
   *
   * Asserted as "two renders agree" rather than against a stored baseline: what is being
   * claimed is reproducibility, not any particular set of coordinates.
   */
  describe('force', () => {
    it('two renders of the same frames draw identical calls', async () => {
      const options = { relationsLayout: 'force' as const };
      const first = await renderRelations({ frames: [nodesFrame, edgesFrame], options });
      const second = await renderRelations({ frames: [nodesFrame, edgesFrame], options });

      expect(normalizeCanvasEvents(second.seriesEvents)).toEqual(normalizeCanvasEvents(first.seriesEvents));
      // Guard against the assertion passing on two empty layers.
      expect(first.seriesEvents.length).toBeGreaterThan(0);
    });

    // The same claim for an edges-only response, where every node is derived and
    // therefore carries no stat — the case `initLayout: 'circular'` distributes evenly
    // (`sum` is 0, so every node gets an equal slice) rather than by value.
    it('two renders of an edges-only response draw identical calls', async () => {
      const options = { relationsLayout: 'force' as const };
      const first = await renderRelations({ frames: [edgesFrame], options });
      const second = await renderRelations({ frames: [edgesFrame], options });

      expect(normalizeCanvasEvents(second.seriesEvents)).toEqual(normalizeCanvasEvents(first.seriesEvents));
      expect(first.seriesEvents.length).toBeGreaterThan(0);
    });
  });

  describe('fixed', () => {
    /**
     * **The reported bug**: selecting Fixed drew nothing at all.
     *
     * `fixedx`/`fixedy` are per-mark overrides, so a fresh panel has none, and ECharts'
     * `simpleLayout` lays a node with no `x` out at `[NaN, NaN]` — no symbol, no label,
     * and no link either, since a link needs both endpoints. Asserted on the drawn labels
     * rather than a baseline: the claim is "it draws the graph", not any particular seed
     * geometry. See `resolveFixedPositions`.
     */
    it('every node is drawn even when the data pins nothing', async () => {
      const { seriesEvents } = await renderRelations({
        frames: [nodesFrame, edgesFrame],
        options: { relationsLayout: 'none' },
      });

      expect(labelTexts(seriesEvents)).toEqual(expect.arrayContaining(['Gateway', 'API', 'Web', 'DB']));
    });

    // Partially-pinned data reaches the same layout the moment the user selects Fixed,
    // and the two halves have to coexist: pinned marks verbatim, the rest seeded.
    it('pinned and unpinned nodes are drawn together', async () => {
      const halfPinned = toDataFrame({
        name: 'nodes',
        fields: [
          { name: 'id', type: FieldType.string, values: ['gateway', 'api', 'web', 'db'] },
          { name: 'title', type: FieldType.string, values: ['Gateway', 'API', 'Web', 'DB'] },
          { name: 'fixedx', type: FieldType.number, values: [50, 150, null, null] },
          { name: 'fixedy', type: FieldType.number, values: [150, 80, null, null] },
        ],
      });
      const { seriesEvents } = await renderRelations({
        frames: [halfPinned, edgesFrame],
        options: { relationsLayout: 'none' },
      });

      expect(labelTexts(seriesEvents)).toEqual(expect.arrayContaining(['Gateway', 'API', 'Web', 'DB']));
    });

    /**
     * **The layout, not the option, is what decides whether links blend.** Gradient is
     * the family's default link colour, and it degrades to the source colour wherever
     * the node positions are unknown: zrender resolves a non-global gradient against the
     * shape's bounding box, so `x: 0 -> x2: 1` runs source-to-target only if the source
     * happens to sit on the left, and under force or circular the positions do not exist
     * until after ECharts has laid the graph out. Orienting there would be a coin flip
     * and half the edges would report their direction backwards, so nothing is emitted.
     * See `makeEdgeGradientResolver`.
     *
     * This is the assertion the family's gradient baseline could not make. It was
     * previously snapshotted under the harness's pinned `circular` layout, where the
     * degradation applies — so the "gradient" baseline was byte-identical to the base
     * render *and* to the `source`-mode one, and would have gone on passing if gradients
     * had stopped working entirely. The picture is in
     * `relations-graph.canvas.test.tsx`; the mechanism is here.
     */
    it('a gradient link colour is emitted only where the layout knows the positions', async () => {
      const gradientCalls = async (relationsLayout: 'none' | 'circular') => {
        const { seriesEvents } = await renderRelations({
          frames: [nodesFrame, edgesFrame],
          options: { relationsLayout, relationsLinkColor: 'gradient' },
        });
        return seriesEvents.filter((event) => event.type === 'createLinearGradient').length;
      };

      expect(await gradientCalls('none')).toBeGreaterThan(0);
      expect(await gradientCalls('circular')).toBe(0);
    });
  });
});
