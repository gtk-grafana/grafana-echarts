import { FieldType, toDataFrame } from '@grafana/data';
import { normalizeCanvasEvents } from 'test/canvas';
import { height, width } from 'test/panel';
import { cyclicEdgesFrame, edgesFrame, nodesFrame, slackEdgesFrame } from 'test/relations';
import { renderRelations } from 'test/relationsCanvas';

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

    it('a cyclic edge set (the back-edge dropped, the other four drawn)', async () => {
      const { defaultEvents, seriesEvents } = await renderSankey({ frames: [nodesFrame, cyclicEdgesFrame] });

      expect(seriesEvents.length).toBeGreaterThan(0);
      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });
  });

  describe('orientation', () => {
    it('vertical flow (bars in rows, each label below its bar)', async () => {
      const { defaultEvents, seriesEvents } = await renderSankey({
        frames: [nodesFrame, edgesFrame],
        options: { relationsSankeyOrient: 'vertical' },
      });

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });

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

    it('node align left (a leaf kept in its earliest column, not pushed to the last)', async () => {
      const { defaultEvents, seriesEvents } = await renderSankey({
        frames: [slackEdgesFrame],
        options: { relationsSankeyNodeAlign: 'left' },
      });

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });

    it('ribbon curveness 0 (straight-sided ribbons between the columns)', async () => {
      const { defaultEvents, seriesEvents } = await renderSankey({
        frames: [nodesFrame, edgesFrame],
        options: { relationsSankeyCurveness: 0 },
      });

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });
  });
});
