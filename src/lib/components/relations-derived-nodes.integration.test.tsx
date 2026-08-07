import { type FieldConfigSource } from '@grafana/data';
import { legacyToWide } from 'lib/echarts/converters/legacyToWide';
import { normalizeCanvasEvents } from 'test/canvas';
import { edgesFrame } from 'test/relations';
import { renderRelations } from 'test/relationsCanvas';

/**
 * A node no frame declares — inferred from an edge's endpoints — and what the pre-pass
 * that declares it above the panel does and does not change.
 * See ../../../docs/relations-derived-nodes.md.
 *
 * The fixture is `edgesFrame` alone, so **every** node in these renders is derived:
 * there is no nodes frame anywhere in the response, and `db` is a name only the edges'
 * `target` column ever mentions.
 *
 * **No baselines here, by construction.** Each of the three claims is an identity or a
 * difference between two renders, which is exactly what a stored picture cannot state —
 * the last one was previously snapshotted and its baseline was byte-identical to the
 * plain edges-only render, so 2,494 lines said nothing that `toEqual` does not say in
 * one. The picture that *is* worth reviewing, the override landing on a derived node, is
 * `relations overrides > nodes` in `relations-overrides.canvas.test.tsx`; this file is
 * its matched control.
 */

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

describe('relations derived nodes', () => {
  /**
   * The control, and the reason the pre-pass exists: without it the same override has
   * nothing to match, because the node is invented inside the panel and the override
   * engine has already run. Asserted against the un-overridden render rather than as a
   * second snapshot — "identical to no override at all" is the claim.
   */
  it('the same override is inert when the pre-pass has not run', async () => {
    const overridden = await renderRelations({ frames: [edgesFrame], fieldConfig: overrideDb, prefix: legacyToWide });
    const plain = await renderRelations({ frames: [edgesFrame], prefix: legacyToWide });

    expect(normalizeCanvasEvents(overridden.seriesEvents)).toEqual(normalizeCanvasEvents(plain.seriesEvents));
  });

  /**
   * The no-visual-change guarantee, checked on the pixels rather than on the model: the
   * two derivations produce the same nodes in the same order, so the same palette colours
   * land on the same symbols whether or not the host ran the pass.
   */
  it('the pre-pass draws the same graph as no pre-pass at all', async () => {
    const withPass = await renderRelations({ frames: [edgesFrame] });
    const withoutPass = await renderRelations({ frames: [edgesFrame], prefix: legacyToWide });

    expect(normalizeCanvasEvents(withPass.seriesEvents)).toEqual(normalizeCanvasEvents(withoutPass.seriesEvents));
  });

  /**
   * The stat slot is empty on a derived node, so "Show node values" adds no second line.
   * It used to print the node's degree — a link count wearing a measurement's clothes.
   *
   * "Adds nothing" is an identity, so it is stated as one: the render with the switch on
   * is the render with it off.
   */
  it('no value line is added under a derived node when node values are on', async () => {
    const withValues = await renderRelations({ frames: [edgesFrame], options: { relationsShowNodeValues: true } });
    const plain = await renderRelations({ frames: [edgesFrame] });

    expect(normalizeCanvasEvents(withValues.seriesEvents)).toEqual(normalizeCanvasEvents(plain.seriesEvents));
    // Guard against agreeing on two empty layers: the graph was drawn, labels and all.
    expect(withValues.seriesEvents.length).toBeGreaterThan(0);
  });
});
