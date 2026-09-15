import { type FieldConfigSource } from '@grafana/data';
import { legacyToWide } from 'lib/echarts/relations/converters/legacyToWide';
import { normalizeCanvasEvents } from 'test/canvas';
import { edgesFrame } from 'test/relations';
import { renderRelations } from 'test/relationsCanvas';

/** Build configuration for one derived node. */
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

describe('relations derived nodes', () => {
  it('the same override is inert when the pre-pass has not run', async () => {
    const overridden = await renderRelations({ frames: [edgesFrame], fieldConfig: overrideDb, prefix: legacyToWide });
    const plain = await renderRelations({ frames: [edgesFrame], prefix: legacyToWide });

    expect(normalizeCanvasEvents(overridden.seriesEvents)).toEqual(normalizeCanvasEvents(plain.seriesEvents));
  });

  it('the pre-pass draws the same graph as no pre-pass at all', async () => {
    const withPass = await renderRelations({ frames: [edgesFrame] });
    const withoutPass = await renderRelations({ frames: [edgesFrame], prefix: legacyToWide });

    expect(normalizeCanvasEvents(withPass.seriesEvents)).toEqual(normalizeCanvasEvents(withoutPass.seriesEvents));
  });

  it('no value line is added under a derived node when node values are on', async () => {
    const withValues = await renderRelations({ frames: [edgesFrame], options: { relationsShowNodeValues: true } });
    const plain = await renderRelations({ frames: [edgesFrame] });

    expect(normalizeCanvasEvents(withValues.seriesEvents)).toEqual(normalizeCanvasEvents(plain.seriesEvents));
    // Guard against agreeing on two empty layers: the graph was drawn, labels and all.
    expect(withValues.seriesEvents.length).toBeGreaterThan(0);
  });
});
