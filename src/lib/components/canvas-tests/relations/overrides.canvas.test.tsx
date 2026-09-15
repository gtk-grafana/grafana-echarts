import { type FieldConfigSource } from '@grafana/data';

import { normalizeCanvasEvents } from 'test/canvas';
import { height, width } from 'test/panel';
import { edgesFrame, nodesFrame } from 'test/relations';
import { renderRelations } from 'test/relationsCanvas';

import { type EChartsRelationsFieldConfig } from 'editor/relations/types';

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

    it('a byName override on a node only the edges imply (db red, larger, and renamed Database)', async () => {
      const { defaultEvents, seriesEvents } = await renderRelations({ frames: [edgesFrame], fieldConfig: overrideDb });

      const plain = await renderRelations({ frames: [edgesFrame] });
      expect(normalizeCanvasEvents(seriesEvents)).not.toEqual(normalizeCanvasEvents(plain.seriesEvents));

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });

    it('a byName hideFrom override on a node (web gone, and both links that touched it)', async () => {
      const fieldConfig: FieldConfigSource = {
        defaults: {},
        overrides: [
          {
            matcher: { id: 'byName', options: 'web' },
            properties: [{ id: 'custom.hideFrom', value: { viz: true, legend: false, tooltip: false } }],
          },
        ],
      };
      const { defaultEvents, seriesEvents } = await renderRelations({ frames: [nodesFrame, edgesFrame], fieldConfig });

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });
  });

  describe('edges', () => {
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

    it('a byName curveness override (gateway to api bowed hard, the rest nearly straight)', async () => {
      const fieldConfig: FieldConfigSource<Partial<EChartsRelationsFieldConfig>> = {
        defaults: {},
        overrides: [
          {
            matcher: { id: 'byName', options: 'e1' },
            properties: [{ id: 'custom.curveness', value: 1.6 }],
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
