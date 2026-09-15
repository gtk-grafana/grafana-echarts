import { type FieldConfigSource } from '@grafana/data';

import { normalizeCanvasEvents } from 'test/canvas';
import { height, width } from 'test/panel';
import { edgesFrame, nodesFrame } from 'test/relations';
import { renderRelations } from 'test/relationsCanvas';

/** Use a bright color so its absence is clear in the canvas baseline. */
const fixedEdgeColor = '#ff00ff';

const edgeOverride: FieldConfigSource = {
  defaults: {},
  overrides: [
    {
      matcher: { id: 'byName', options: 'e1' },
      properties: [{ id: 'color', value: { mode: 'fixed', fixedColor: fixedEdgeColor } }],
    },
  ],
};

describe('relations chord color', () => {
  it('BUGGY BEHAVIOR: a fixed magenta edge color (the e1 ribbon does not use its requested fill)', async () => {
    const { defaultEvents, seriesEvents } = await renderRelations({
      frames: [nodesFrame, edgesFrame],
      variant: 'chord',
      fieldConfig: edgeOverride,
    });

    expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
  });
});
