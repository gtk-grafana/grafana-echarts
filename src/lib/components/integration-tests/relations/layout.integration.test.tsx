import { FieldType, toDataFrame } from '@grafana/data';
import { normalizeCanvasEvents } from 'test/canvas';
import { edgesFrame, nodesFrame, slackEdgesFrame } from 'test/relations';
import { labelTexts, renderRelations } from 'test/relationsCanvas';

/**
 * How the relations variants place their marks: that a force layout is *reproducible*, that
 * Fixed draws every node whether or not the data pinned it, and that the one thing
 * downstream of a known position — an oriented edge gradient — appears exactly where
 * positions exist.
 *
 * **No baselines here, by construction.** Each claim is about a relation between two
 * renders (or about the absence of a draw call), and a stored picture would pin the
 * simulation's arithmetic across ECharts versions for no benefit. The layouts that *do*
 * carry a reviewable picture — Fixed with server coordinates, and the gradient it makes
 * orientable — are snapshotted in `canvas-tests/relations/graph.canvas.test.tsx`.
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

  /**
   * **Sankey node alignment, and the comparison idiom it needs.**
   *
   * Alignment only decides where a node with *slack* lands, so the claim is necessarily a
   * relation between two renders rather than one picture — which is why it lives here and
   * not beside the baseline in `sankey.canvas.test.tsx`. `slackEdgesFrame` is the fixture
   * that can express it at all.
   *
   * Compared through `JSON.stringify`, deliberately. The obvious `not.toEqual` is
   * **vacuous on a sankey**: its ribbons carry gradient objects, so two renders are never
   * `toEqual` whatever their geometry, and such a guard passes even when both sides are
   * byte-identical. That is not hypothetical — it is what let the family's `nodeAlign`
   * default change from `justify` to `left` without any test noticing, even though a
   * `not.toEqual` guard was sitting right next to the affected baseline.
   */
  describe('sankey node alignment', () => {
    const renderAligned = async (options: Record<string, unknown> = {}) => {
      const { seriesEvents } = await renderRelations({
        frames: [slackEdgesFrame],
        variant: 'sankey',
        options,
      });
      return JSON.stringify(normalizeCanvasEvents(seriesEvents));
    };

    /** The control for the idiom itself: two identical renders must agree. */
    it('draws the same picture twice for one setting', async () => {
      const [first, second] = [await renderAligned(), await renderAligned()];

      expect(second).toEqual(first);
      expect(first.length).toBeGreaterThan(0);
    });

    // `left` keeps `cache` in column 1; `justify` pushes it to the last column.
    it('draws a different picture for left than for justify', async () => {
      const left = await renderAligned({ relationsSankeyNodeAlign: 'left' });
      const justify = await renderAligned({ relationsSankeyNodeAlign: 'justify' });

      expect(left).not.toEqual(justify);
    });

    /**
     * **The family default is `left`, not ECharts' `justify`.** So `getSankeyNodeAlign`
     * always emits the key rather than omitting it at the default, which is the one place
     * this family departs from the omit-at-the-ECharts-default rule the rest of the sankey
     * options follow. Asserted on the rendered picture, so it cannot pass on the resolver
     * alone.
     */
    it('defaults to left, so an unset panel matches an explicit left', async () => {
      const unset = await renderAligned();
      const left = await renderAligned({ relationsSankeyNodeAlign: 'left' });
      const justify = await renderAligned({ relationsSankeyNodeAlign: 'justify' });

      expect(unset).toEqual(left);
      expect(unset).not.toEqual(justify);
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
     * This is the assertion the family's gradient baseline cannot make. Snapshotted under
     * the harness's pinned `circular` layout the degradation applies, so a "gradient"
     * baseline is byte-identical to the base render *and* to the `source`-mode one, and
     * would keep passing if gradients stopped working entirely. The picture is in
     * `canvas-tests/relations/graph.canvas.test.tsx`; the mechanism is here.
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
