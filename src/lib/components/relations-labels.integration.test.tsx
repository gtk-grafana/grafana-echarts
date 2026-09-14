import { render } from '@testing-library/react';
import { type CanvasRenderingContext2DEvent } from 'jest-canvas-mock';
import { revealEdgeLabelsFor } from 'lib/echarts/features/edgeLabelLayout';
import { getChart, readCanvasLayer, SERIES_LAYER_SELECTOR } from 'test/canvas';
import { getComponent, waitForFinished } from 'test/panel';
import {
  crowdedEdgesFrame,
  crowdedIds,
  crowdedNodesFrame,
  edgesFrame,
  nodesFrame,
  overlappingEdgesFrame,
  overlappingNodesFrame,
  overlappingValues,
  ringEdgesFrame,
  ringNodesFrame,
} from 'test/relations';
import { asPipelineWould, canvasOptions, labelTexts, renderRelations, uniqueLabelTexts } from 'test/relationsCanvas';

/**
 * Label arbitration for the relations family: what text is drawn, and which label wins
 * when two want the same pixels.
 *
 * **No baselines here, by construction.** Every claim below is a relation between two
 * renders, or a list of the strings that survived — both of which a stored picture
 * states worse than the assertion does. The four cases that used to be snapshotted
 * (truncation, wrapping, and the two collision cases) committed 29,424 baseline lines
 * between them to assert, in the wrap case, only "no ellipsis anywhere", and in the two
 * collision cases nothing beyond which labels survived. The label list beside the option
 * that produced it is both smaller and a stronger assertion.
 *
 * **The scale is the product's.** Every option below is left at its default, because the
 * harness measures text like a browser does: `jest-setup.js` re-answers `measureText`
 * with per-character em fractions rather than `jest-canvas-mock`'s one pixel per
 * character, so a long name reaches `RELATIONS_LABEL_WIDTH_DEFAULT` (120px) in about the
 * same twenty characters it would on screen and the collisions are the ones a reader
 * would see. Exact pixels still belong in a browser; which labels survive does not.
 */

/** Twelve crowded nodes rendered as a graph, with overlap hiding as the case chooses. */
const renderCrowdedGraph = (options: Parameters<typeof renderRelations>[0]['options']) =>
  renderRelations({ frames: [crowdedNodesFrame, crowdedEdgesFrame], options });

const drawnOverlappingValues = (events: CanvasRenderingContext2DEvent[]) =>
  labelTexts(events).filter((text) => overlappingValues.includes(text));

describe('relations labels', () => {
  describe('overflow', () => {
    /**
     * Long names are ellipsised at the label width rather than allowed to run into the
     * next node. Both on by default — see `RELATIONS_LABEL_OVERFLOW_DEFAULT` and
     * `RELATIONS_LABEL_WIDTH_DEFAULT`, so neither is set here. Overlap hiding is switched
     * off so the claim is about truncation alone.
     */
    it('a long name is cut at the label width and ends in an ellipsis', async () => {
      const { seriesEvents } = await renderCrowdedGraph({ relationsHideOverlappingLabels: false });

      const drawn = uniqueLabelTexts(seriesEvents);
      expect(drawn).toHaveLength(crowdedIds.length);
      // Every name is 58 characters; about twenty of them fit in 120px, plus the ellipsis —
      // and not the same twenty each time, because the glyphs are measured individually.
      expect(drawn.every((text) => text.endsWith('...') && text.length < 30)).toBe(true);
      expect(drawn).toMatchInlineSnapshot(`
        [
          "api-service-primary-...",
          "audit-service-primar...",
          "auth-service-primar...",
          "billing-service-prima...",
          "cache-service-prima...",
          "db-service-primary-...",
          "gateway-service-pri...",
          "notify-service-prima...",
          "queue-service-prim...",
          "report-service-prima...",
          "search-service-prim...",
          "web-service-primary...",
        ]
      `);
    });

    // Wrapping emits one draw per line rather than one per node, and no ellipsis: the
    // whole name is there, broken across lines at the same width.
    it('break mode wraps a long name over several lines instead of cutting it', async () => {
      const { seriesEvents } = await renderCrowdedGraph({
        relationsLabelOverflow: 'break',
        relationsHideOverlappingLabels: false,
      });

      const drawn = uniqueLabelTexts(seriesEvents);
      expect(drawn.some((text) => text.endsWith('...'))).toBe(false);
      // Every node's name survives in pieces, so there are more draws than nodes.
      expect(drawn.length).toBeGreaterThan(crowdedIds.length);
      expect(drawn).toMatchInlineSnapshot(`
        [
          "-eu-west-1-with-a-na",
          "-that-keeps-going",
          "-west-1-with-a-name-t",
          "api-service-primary-eu",
          "ary-eu-west-1-with-a-",
          "audit-service-primary-",
          "auth-service-primary-",
          "billing-service-primary",
          "cache-service-primary",
          "db-service-primary-eu",
          "e-that-keeps-going",
          "eu-west-1-with-a-nam",
          "g",
          "gateway-service-prim",
          "hat-keeps-going",
          "me-that-keeps-going",
          "name-that-keeps-goin",
          "notify-service-primary-",
          "queue-service-primary",
          "report-service-primary",
          "search-service-primar",
          "u-west-1-with-a-name",
          "web-service-primary-e",
          "y-eu-west-1-with-a-na",
        ]
      `);
    });
  });

  describe('overlap', () => {
    /**
     * A label that would collide with one already placed is dropped outright, rather than
     * printed over it. On by default — see `RELATIONS_HIDE_OVERLAPPING_LABELS_DEFAULT`.
     * Stated as the pair of lists so the assertion names *which* label lost, not only
     * that one did.
     */
    it('a node label that would collide with one already drawn is dropped', async () => {
      const hidden = await renderCrowdedGraph({ relationsLabelOverflow: 'none' });
      const overlapping = await renderCrowdedGraph({
        relationsLabelOverflow: 'none',
        relationsHideOverlappingLabels: false,
      });

      const kept = uniqueLabelTexts(hidden.seriesEvents);
      const all = uniqueLabelTexts(overlapping.seriesEvents);
      expect(all).toHaveLength(crowdedIds.length);
      expect(kept.length).toBeLessThan(all.length);
      // Nothing new appears when the switch is on; labels only go away.
      expect(all).toEqual(expect.arrayContaining(kept));
      expect(kept).toMatchInlineSnapshot(`
        [
          "api-service-primary-eu-west-1-with-a-name-that-keeps-going",
          "auth-service-primary-eu-west-1-with-a-name-that-keeps-going",
          "billing-service-primary-eu-west-1-with-a-name-that-keeps-going",
          "gateway-service-primary-eu-west-1-with-a-name-that-keeps-going",
          "search-service-primary-eu-west-1-with-a-name-that-keeps-going",
          "web-service-primary-eu-west-1-with-a-name-that-keeps-going",
        ]
      `);
    });

    /**
     * The chord's version of the same lever, and the reason it has one: `series.chord`
     * has no `avoidLabelOverlap` of its own, but it routes its labels through the shared
     * label-layout stage like every other series, so `hideOverlap` is what arbitrates
     * them. See `getRelationsLabelLayout`.
     *
     * Twelve nodes, four carrying real flow and eight reduced to slivers — the exact
     * shape the option exists for, since the slivers collapse into a narrow wedge and
     * their labels stack on one another. Half of them lose their labels: a chord label is
     * measured at its full width now that the harness answers `measureText` like a browser,
     * so the slivers' names have nowhere to go.
     */
    it('a chord ring of collapsed arcs drops the labels that stack up', async () => {
      const frames = [ringNodesFrame, ringEdgesFrame];

      const hidden = await renderRelations({ frames, variant: 'chord', options: { relationsLabelOverflow: 'none' } });
      const overlapping = await renderRelations({
        frames,
        variant: 'chord',
        options: { relationsLabelOverflow: 'none', relationsHideOverlappingLabels: false },
      });

      const kept = uniqueLabelTexts(hidden.seriesEvents);
      const all = uniqueLabelTexts(overlapping.seriesEvents);
      expect(kept.length).toBeLessThan(all.length);
      expect(all).toEqual(expect.arrayContaining(kept));
      expect(kept).toMatchInlineSnapshot(`
        [
          "a-service-primary-eu-west-1",
          "b-service-primary-eu-west-1",
          "c-service-primary-eu-west-1",
          "d-service-primary-eu-west-1",
          "e-service-primary-eu-west-1",
          "f-service-primary-eu-west-1",
        ]
      `);
    });
  });

  /**
   * **The reported bug**: every refresh drew *more* edge values than the last, with
   * unchanged data.
   *
   * Cause was `labelLayout.hideOverlap` being applied to edge labels as well as node
   * ones. A graph's edge labels are measured before the link geometry has settled, so the
   * first pass hid nearly all of them and each later pass let one more through, up to
   * whatever the settled geometry allowed. They are arbitrated by the family instead —
   * measured on the settled geometry, and yielding to the node labels rather than
   * outranking them. See `getRelationsLabelLayout` and `registerEdgeLabelLayout`.
   *
   * Counted per pass (draw calls accumulate across the harness's passes, hence the slice)
   * with overlap hiding left **on**, since that is the default and the condition for the
   * bug.
   */
  describe('edge values', () => {
    /** A reader of only what has been drawn since the last time it was asked. */
    const perPass = (container: HTMLElement, keep: (texts: string[]) => string[]) => {
      let counted = 0;
      return () => {
        const all = labelTexts(readCanvasLayer(container, SERIES_LAYER_SELECTOR));
        const fresh = all.slice(counted);
        counted = all.length;
        return keep(fresh);
      };
    };

    it('the same weights are drawn on every render', async () => {
      const options = canvasOptions({ relationsShowEdgeValues: true });
      const element = () =>
        getComponent(asPipelineWould([nodesFrame, edgesFrame]), 'graph', options, undefined, undefined, 'relations');
      const { container, rerender } = render(element());

      const weights = ['100', '50', '90', '40'];
      const thisPass = perPass(container, (texts) => texts.filter((text) => weights.includes(text)));

      // Three of the four: `90` (api → db) lands under a node name at real label widths
      // and yields to it, which is the arbitration the `overlap` cases above pin. What
      // this case is about is that the *same* ones come back every pass — the bug let one
      // more through each time.
      const first = thisPass();
      expect(first).toEqual(['100', '50', '40']);

      for (let pass = 0; pass < 3; pass++) {
        rerender(element());
        expect(thisPass()).toEqual(first);
      }
    });

    /**
     * **The reported bug**: "Hide overlapping labels" reached node labels and left the
     * edge values piled on top of each other.
     *
     * Stated on **two links between the same pair of nodes**, which land on exactly the
     * same spot and so collide whatever the text measures — see `overlappingEdgesFrame`.
     */
    it('two weights on the same spot become one', async () => {
      const { seriesEvents } = await renderRelations({
        frames: [overlappingNodesFrame, overlappingEdgesFrame],
        options: { relationsShowEdgeValues: true },
      });

      // One value per render pass, and the harness renders twice.
      expect(drawnOverlappingValues(seriesEvents)).toHaveLength(2);
      expect(new Set(drawnOverlappingValues(seriesEvents)).size).toBe(1);
      // The nodes keep their names: an edge value never takes a label down with it.
      expect(labelTexts(seriesEvents)).toEqual(expect.arrayContaining(['a', 'b']));
    });

    it('both are drawn when overlap hiding is switched off', async () => {
      const { seriesEvents } = await renderRelations({
        frames: [overlappingNodesFrame, overlappingEdgesFrame],
        options: { relationsShowEdgeValues: true, relationsHideOverlappingLabels: false },
      });

      expect(new Set(drawnOverlappingValues(seriesEvents))).toEqual(new Set(overlappingValues));
    });

    // The property the exclusion was protecting: the same decision on every pass, rather
    // than one more label surviving each time.
    it('the same one is dropped on every render', async () => {
      const options = canvasOptions({ relationsShowEdgeValues: true });
      const element = () =>
        getComponent(
          asPipelineWould([overlappingNodesFrame, overlappingEdgesFrame]),
          'graph',
          options,
          undefined,
          undefined,
          'relations'
        );
      const { container, rerender } = render(element());

      const thisPass = perPass(container, (texts) => texts.filter((text) => overlappingValues.includes(text)));

      const first = thisPass();
      expect(first).toHaveLength(1);

      for (let pass = 0; pass < 3; pass++) {
        rerender(element());
        expect(thisPass()).toEqual(first);
      }
    });
  });

  /**
   * A dropped value has to come back when the reader asks for that edge — by hovering or
   * pinning the edge itself, **or either node it joins**, since a node's edge values are
   * what hovering it is asking about.
   *
   * Driven by calling the reveal with the indices directly rather than by moving a mouse:
   * what is being claimed is which marks answer for which label, and an edge's stroke is a
   * 2px target that a synthesized hover has to *aim* at. The cursor half is measured in a
   * browser, where the aim is real. See `revealEdgeLabelsFor`.
   */
  /**
   * The fade `LabelManager` puts on a label it has no remembered layout for — right on a
   * first render, wrong on every rebuild after it. A `graph` never hits it (it diffs and
   * updates its elements in place), but `SankeyView.render` rebuilds every shape, so its
   * edge values were fading back in from zero on each pass; measured stepping the time
   * slider, ramping `0.001 → 1` over ~120 frames per step. See `registerEdgeLabelFadeIn`.
   *
   * Asserted on the flag rather than on the pixels: the fade is frames of an animation, and
   * the canvas harness paints a settled chart. `disableLabelAnimation` is the whole
   * mechanism — `_animateLabels` returns on it before it reaches either branch.
   */
  describe('fading in', () => {
    /** The element a label hangs off, with the flag that decides whether it animates. */
    interface Host {
      disableLabelAnimation?: boolean;
    }
    interface Table {
      count(): number;
      getItemGraphicEl(dataIndex: number): Host | undefined;
    }

    /** A series' node and edge tables, which is where the label hosts live. */
    const tablesOf = (chart: unknown): { data: Table; edgeData: Table } =>
      (chart as { getModel(): { getSeriesByIndex(index: number): { getGraph(): { data: Table; edgeData: Table } } } })
        .getModel()
        .getSeriesByIndex(0)
        .getGraph();

    const hostsOf = (table: Table): Host[] =>
      Array.from({ length: table.count() }, (_, index) => table.getItemGraphicEl(index)).filter(
        (host): host is Host => host != null
      );

    it.each(['graph', 'sankey'] as const)('edge values on a %s never fade in', async (variant) => {
      const { container } = await renderRelations({
        frames: [nodesFrame, edgesFrame],
        variant,
        options: { relationsShowEdgeValues: true },
      });
      const hosts = hostsOf(tablesOf(getChart(container).chart).edgeData);

      expect(hosts.length).toBeGreaterThan(0);
      expect(hosts.every((host) => host.disableLabelAnimation === true)).toBe(true);
    });

    // Node names are left alone: they do not hit the branch, and the fade on a genuine
    // first render is the one case it is for.
    it('node labels keep their animation', async () => {
      const { container } = await renderRelations({
        frames: [nodesFrame, edgesFrame],
        options: { relationsShowEdgeValues: true },
      });
      const hosts = hostsOf(tablesOf(getChart(container).chart).data);

      expect(hosts.length).toBeGreaterThan(0);
      expect(hosts.some((host) => host.disableLabelAnimation === true)).toBe(false);
    });
  });

  describe('revealing a hidden edge value', () => {
    /** Render, then report the hidden value and a reader of what is drawn from now on. */
    const withOneHidden = async () => {
      const { container } = render(
        getComponent(
          asPipelineWould([overlappingNodesFrame, overlappingEdgesFrame]),
          'graph',
          canvasOptions({ relationsShowEdgeValues: true }),
          undefined,
          undefined,
          'relations'
        )
      );
      const { chartInstanceDom, chart } = getChart(container);
      await waitForFinished(chart);

      const painted = readCanvasLayer(chartInstanceDom, SERIES_LAYER_SELECTOR);
      const shown = new Set(drawnOverlappingValues(painted));
      const hidden = overlappingValues.find((value) => !shown.has(value));
      expect(hidden).toBeDefined();

      let counted = painted.length;
      const drawnSince = () => {
        const all = readCanvasLayer(chartInstanceDom, SERIES_LAYER_SELECTOR);
        const fresh = drawnOverlappingValues(all.slice(counted));
        counted = all.length;
        return fresh;
      };
      const reveal = (focus: Parameters<typeof revealEdgeLabelsFor>[1]) => {
        revealEdgeLabelsFor(chart!.getZr(), focus);
        chart!.getZr().flush();
        return drawnSince();
      };
      // Each reading is a transition from nothing focused, which is how a reader arrives
      // at a mark — and necessary, because a reveal that asks for the state already on
      // screen deliberately repaints nothing, so there would be nothing to read.
      const arriveAt = (focus: Parameters<typeof revealEdgeLabelsFor>[1]) => {
        reveal(null);
        return reveal(focus);
      };
      return { hidden: hidden!, reveal, arriveAt };
    };

    it('either node the edge joins brings it back', async () => {
      const { hidden, arriveAt } = await withOneHidden();

      // `a` and `b` are the endpoints of both colliding edges; `c` is the third node.
      expect(arriveAt({ seriesIndex: 0, dataIndex: 0, dataType: 'node' })).toContain(hidden);
      expect(arriveAt({ seriesIndex: 0, dataIndex: 1, dataType: 'node' })).toContain(hidden);
      expect(arriveAt({ seriesIndex: 0, dataIndex: 2, dataType: 'node' })).not.toContain(hidden);
    });

    it('the edge itself brings it back, and no other edge does', async () => {
      const { hidden, arriveAt } = await withOneHidden();

      // The second of the two links between `a` and `b` is the one that lost; the first
      // kept its value, and the third edge is the one to `c`.
      expect(arriveAt({ seriesIndex: 0, dataIndex: 1, dataType: 'edge' })).toContain(hidden);
      expect(arriveAt({ seriesIndex: 0, dataIndex: 0, dataType: 'edge' })).not.toContain(hidden);
      expect(arriveAt({ seriesIndex: 0, dataIndex: 2, dataType: 'edge' })).not.toContain(hidden);
    });

    // Nothing focused is the same question as a mark with no hidden values behind it, and
    // the answer has to be the label going away again rather than accumulating on screen.
    it('leaving the mark takes it away again', async () => {
      const { hidden, reveal } = await withOneHidden();

      expect(reveal({ seriesIndex: 0, dataIndex: 0, dataType: 'node' })).toContain(hidden);
      const afterLeaving = reveal(null);
      expect(afterLeaving).not.toContain(hidden);
      // Guard against reading an empty repaint as success: the rest was still drawn.
      expect(afterLeaving.length).toBeGreaterThan(0);
    });
  });
});
