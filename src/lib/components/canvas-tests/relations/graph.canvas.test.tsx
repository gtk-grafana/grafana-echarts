import { FieldColorModeId, FieldType, type Labels, ThresholdsMode, toDataFrame } from '@grafana/data';

import { normalizeCanvasEvents } from 'test/canvas';
import { height, width } from 'test/panel';
import { edgesFrame, nodesFrame, pinnedNodesFrame } from 'test/relations';
import { renderRelations } from 'test/relationsCanvas';

import { GRAPH_EDGES_WIDE, GRAPH_NODES_WIDE } from 'lib/echarts/relations/converters/contract';

describe('relations graph', () => {
  describe('base', () => {
    it('nodes and links at their defaults (four labelled symbols joined by arrowed lines)', async () => {
      const { defaultEvents, seriesEvents } = await renderRelations({ frames: [nodesFrame, edgesFrame] });

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });

    it('an edges-only response (the same four nodes, labelled by id)', async () => {
      const { defaultEvents, seriesEvents } = await renderRelations({ frames: [edgesFrame] });

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });
  });

  describe('layout', () => {
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

    it('node size 40 (every symbol twice the default diameter)', async () => {
      const { defaultEvents, seriesEvents } = await renderRelations({
        frames: [nodesFrame, edgesFrame],
        options: { relationsNodeSize: 40 },
      });

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });

    it('node values on (each name over its own stat)', async () => {
      const { defaultEvents, seriesEvents } = await renderRelations({
        frames: [nodesFrame, edgesFrame],
        options: { relationsShowNodeValues: true },
      });

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });

    it('node labels off (symbols and links, no text)', async () => {
      const { defaultEvents, seriesEvents } = await renderRelations({
        frames: [nodesFrame, edgesFrame],
        options: { relationsShowNodeLabels: false },
      });

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });

    it('node labels off with a hovered node (its label below the symbol in theme text color)', async () => {
      const { defaultEvents, seriesEvents } = await renderRelations({
        frames: [nodesFrame, edgesFrame],
        options: { relationsShowNodeLabels: false },
        beforeCapture: (chart) => chart.dispatchAction({ type: 'highlight', seriesIndex: 0, dataIndex: 0 }),
      });

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });

    // The explicit red color for `db` overrides the palette.
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

  describe('labels', () => {
    /** Build four nodes with labels wider than 120 pixels. */
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

    // Half the default width, so each name is cut roughly twice as early.
    it('label width 60 (names cut at half the default box)', async () => {
      const { defaultEvents, seriesEvents } = await renderRelations({
        frames: [longNodes, edgesFrame],
        options: { relationsLabelWidth: 60 },
      });

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });

    it('break overflow (each name wrapped over several lines, none cut)', async () => {
      const { defaultEvents, seriesEvents } = await renderRelations({
        frames: [longNodes, edgesFrame],
        options: { relationsLabelOverflow: 'break' },
      });

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

    it('arrows off (plain lines, no heads)', async () => {
      const { defaultEvents, seriesEvents } = await renderRelations({
        frames: [nodesFrame, edgesFrame],
        options: { relationsEdgeArrows: false },
      });

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });

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

  describe('thresholds', () => {
    const steps = {
      mode: ThresholdsMode.Absolute,
      steps: [
        { value: -Infinity, color: 'green' },
        { value: 40, color: 'orange' },
        { value: 70, color: 'red' },
      ],
    };

    /** Build one mark with a color gradient. */
    const graded = (name: string, value: number, labels?: Labels) => ({
      name,
      type: FieldType.number,
      values: [value],
      ...(labels ? { labels } : {}),
      config: { color: { mode: FieldColorModeId.Thresholds }, thresholds: steps },
    });

    const gradedNodes = toDataFrame({
      name: 'nodes',
      meta: { type: GRAPH_NODES_WIDE },
      fields: [graded('gateway', 10), graded('api', 50), graded('web', 90), graded('db', 30)],
    });
    const gradedEdges = toDataFrame({
      name: 'edges',
      meta: { type: GRAPH_EDGES_WIDE },
      fields: [
        graded('gateway-->api', 80),
        graded('gateway-->web', 45),
        graded('api-->db', 20),
        graded('web-->db', 75),
      ],
    });

    it('a by-value scheme on every mark (nodes in three bands, each line graded by its own weight)', async () => {
      const { defaultEvents, seriesEvents } = await renderRelations({
        frames: [gradedNodes, gradedEdges],
        options: { relationsLinkColor: 'target', relationsShowEdgeValues: true },
      });

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });
  });
});
