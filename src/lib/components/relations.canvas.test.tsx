import { type FieldConfigSource, FieldType, toDataFrame } from '@grafana/data';
import { render } from '@testing-library/react';
import { normalizeCanvasEvents, SERIES_ZLEVEL } from 'test/canvas';
import { getComponent, getSeriesCanvasEvents, height, width } from 'test/panel';
import { type PanelOptions } from 'types';

// Relations (graph) canvas snapshots, mirroring `part-to-whole.canvas.test.tsx`.
// The graph series is axis-less — it creates its own `View` coordinate system and
// paints nothing on the default grid layer — so only the series layer is read, via
// the tolerant `getSeriesCanvasEvents` (like pie/funnel/hierarchy).
//
// **Layouts are pinned deliberately.** `layout: 'force'` runs a physics simulation
// whose node positions depend on iteration count and timing, so it cannot produce a
// stable snapshot even with animation disabled. Every case below therefore uses
// `circular` (deterministic ring placement) or `none` with `fixedx`/`fixedy`
// coordinates from the data. Force-layout *option mapping* is covered by unit tests
// in `lib/echarts/options/graph.test.ts` instead.
//
// Rendered in Advanced editor mode so the advanced options these tests exercise
// (edge arrows, curveness, link color, adjacency focus) are respected as-is; in
// Default mode `applyEditorModeDefaults` resets every advanced option — including
// forcing `animation.enabled` back to its default, which would clobber the
// `animation: { enabled: false }` these snapshots rely on for determinism.
const canvasOptions = (extra: Partial<PanelOptions> = {}): Partial<PanelOptions> => ({
  zLevel: { series: SERIES_ZLEVEL },
  animation: { enabled: false },
  editorMode: 'advanced',
  relationsLayout: 'circular',
  ...extra,
});

const renderGraph = async (
  frames: Parameters<typeof getComponent>[0],
  options: Partial<PanelOptions> = {},
  fieldConfig?: FieldConfigSource
) => {
  const { container } = render(
    getComponent(frames, 'graph', canvasOptions(options), undefined, undefined, 'relations', fieldConfig)
  );
  return getSeriesCanvasEvents(container);
};

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

    it('draws arrowheads at the target end (Advanced)', async () => {
      const { defaultEvents, seriesEvents } = await renderGraph([nodesFrame, edgesFrame], {
        relationsEdgeArrows: true,
      });

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
  });

  describe('field config', () => {
    // A byName fixed-color override recolors one node, matching the legend picker.
    it('honors a byName color override', async () => {
      const fieldConfig: FieldConfigSource = {
        defaults: {},
        overrides: [
          {
            matcher: { id: 'byName', options: 'DB' },
            properties: [{ id: 'color', value: { mode: 'fixed', fixedColor: 'purple' } }],
          },
        ],
      };
      const { defaultEvents, seriesEvents } = await renderGraph([nodesFrame, edgesFrame], {}, fieldConfig);

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });
  });
});
