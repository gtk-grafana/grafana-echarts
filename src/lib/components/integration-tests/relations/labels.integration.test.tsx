import { render } from '@testing-library/react';
import { type CanvasRenderingContext2DEvent } from 'jest-canvas-mock';

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

import { revealEdgeLabelsFor } from 'lib/echarts/relations/edgeLabels/reveal';

/** Build a crowded graph with 12 nodes. */
const renderCrowdedGraph = (options: Parameters<typeof renderRelations>[0]['options']) =>
  renderRelations({ frames: [crowdedNodesFrame, crowdedEdgesFrame], options });

const drawnOverlappingValues = (events: CanvasRenderingContext2DEvent[]) =>
  labelTexts(events).filter((text) => overlappingValues.includes(text));

describe('relations labels', () => {
  describe('overflow', () => {
    it('a long name is cut at the label width and ends in an ellipsis', async () => {
      const { seriesEvents } = await renderCrowdedGraph({ relationsHideOverlappingLabels: false });

      const drawn = uniqueLabelTexts(seriesEvents);
      expect(drawn).toHaveLength(crowdedIds.length);
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
      // The switch only removes labels.
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

  describe('edge values', () => {
    /** Read labels drawn since the previous call. */
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

      const first = thisPass();
      expect(first).toEqual(['100', '50', '40']);

      for (let pass = 0; pass < 3; pass++) {
        rerender(element());
        expect(thisPass()).toEqual(first);
      }
    });

    it('two weights on the same spot become one', async () => {
      const { seriesEvents } = await renderRelations({
        frames: [overlappingNodesFrame, overlappingEdgesFrame],
        options: { relationsShowEdgeValues: true },
      });

      // One weight is drawn. The overlapping weight is hidden.
      expect(drawnOverlappingValues(seriesEvents)).toHaveLength(1);
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

  describe('fading in', () => {
    /** Label host with its animation state. */
    interface Host {
      disableLabelAnimation?: boolean;
    }
    interface Table {
      count(): number;
      getItemGraphicEl(dataIndex: number): Host | undefined;
    }

    /** Node and edge tables that contain label hosts. */
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
    /** Render and return hidden values and new draw calls. */
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
      const arriveAt = (focus: Parameters<typeof revealEdgeLabelsFor>[1]) => {
        reveal(null);
        return reveal(focus);
      };
      return { hidden: hidden!, reveal, arriveAt };
    };

    it('either node the edge joins brings it back', async () => {
      const { hidden, arriveAt } = await withOneHidden();

      // Both edges connect `a` and `b`. Node `c` is separate.
      expect(arriveAt({ seriesIndex: 0, dataIndex: 0, dataType: 'node' })).toContain(hidden);
      expect(arriveAt({ seriesIndex: 0, dataIndex: 1, dataType: 'node' })).toContain(hidden);
      expect(arriveAt({ seriesIndex: 0, dataIndex: 2, dataType: 'node' })).not.toContain(hidden);
    });

    it('the edge itself brings it back, and no other edge does', async () => {
      const { hidden, arriveAt } = await withOneHidden();

      expect(arriveAt({ seriesIndex: 0, dataIndex: 1, dataType: 'edge' })).toContain(hidden);
      expect(arriveAt({ seriesIndex: 0, dataIndex: 0, dataType: 'edge' })).not.toContain(hidden);
      expect(arriveAt({ seriesIndex: 0, dataIndex: 2, dataType: 'edge' })).not.toContain(hidden);
    });

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
