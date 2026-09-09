import { type FieldConfigSource } from '@grafana/data';
import { normalizeCanvasEvents } from 'test/canvas';
import { height, width } from 'test/panel';
import { edgesFrame, nodesFrame } from 'test/relations';
import { renderRelations } from 'test/relationsCanvas';

// Canvas snapshots for field overrides on the relations family. A mark is a *field*
// under the wide contract — one node is one field, one edge is one field — so an
// ordinary `byName` override addresses exactly one node or one link, which is the whole
// point of the contract and something the row form could not express at all. See
// data-plane/graph-wide.md.
//
// Every test here is a snapshot test. The control that says why the derived-node
// pre-pass has to run *above* the panel — the same override, inert without it — is
// `relations-derived-nodes.integration.test.tsx`, which needs two renders and no
// baseline.

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

describe('relations overrides', () => {
  describe('nodes', () => {
    // A byName fixed-color override recolors one node, matching the legend picker.
    it('a byName color override (DB drawn red, the other three on the palette)', async () => {
      const fieldConfig: FieldConfigSource = {
        defaults: {},
        overrides: [
          {
            matcher: { id: 'byName', options: 'DB' },
            properties: [{ id: 'color', value: { mode: 'fixed', fixedColor: 'red' } }],
          },
        ],
      };
      const { defaultEvents, seriesEvents } = await renderRelations({ frames: [nodesFrame, edgesFrame], fieldConfig });

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });

    /**
     * A node no frame declares — inferred from an edge's endpoints — drawn as a mark the
     * override engine can reach. `converters/deriveNodes.ts` declares it as a field above
     * the panel, which is what the harness's pipeline prefix runs; see
     * ../../../docs/relations-derived-nodes.md.
     *
     * The fixture is `edgesFrame` alone, so **every** node in this render is derived:
     * there is no nodes frame anywhere in the response, and `db` is a name only the
     * edges' `target` column ever mentions.
     */
    it('a byName override on a node only the edges imply (db red, larger, and renamed Database)', async () => {
      const { defaultEvents, seriesEvents } = await renderRelations({ frames: [edgesFrame], fieldConfig: overrideDb });

      // The snapshot is only worth reading if the override moved something, so say so
      // here rather than trusting a reviewer to spot it in 22 kB of draw calls.
      const plain = await renderRelations({ frames: [edgesFrame] });
      expect(normalizeCanvasEvents(seriesEvents)).not.toEqual(normalizeCanvasEvents(plain.seriesEvents));

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });
  });

  describe('edges', () => {
    // An edge is a field under the wide contract, so "Hide in area" can name one. `e1`
    // is gateway->api, so the node symbols are untouched and exactly one line goes
    // missing.
    it('a byName hideFrom override (gateway to api missing, three lines left)', async () => {
      const fieldConfig: FieldConfigSource = {
        defaults: {},
        overrides: [
          {
            matcher: { id: 'byName', options: 'e1' },
            properties: [{ id: 'custom.hideFrom', value: { viz: true, legend: false, tooltip: false } }],
          },
        ],
      };
      const { defaultEvents, seriesEvents } = await renderRelations({ frames: [nodesFrame, edgesFrame], fieldConfig });

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });

    // Per-edge `custom.curveness` beats the panel-level "Link curveness": `e1` bows hard
    // while the other three stay on the panel value.
    it('a byName curveness override (gateway to api bowed hard, the rest nearly straight)', async () => {
      const fieldConfig: FieldConfigSource = {
        defaults: {},
        overrides: [
          {
            matcher: { id: 'byName', options: 'e1' },
            properties: [{ id: 'custom.curveness', value: 0.6 }],
          },
        ],
      };
      const { defaultEvents, seriesEvents } = await renderRelations({
        frames: [nodesFrame, edgesFrame],
        options: { relationsCurveness: 0.1 },
        fieldConfig,
      });

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });
  });
});
