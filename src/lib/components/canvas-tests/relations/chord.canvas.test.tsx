import { FieldType, toDataFrame } from '@grafana/data';
import { normalizeCanvasEvents } from 'test/canvas';
import { height, width } from 'test/panel';
import { cyclicEdgesFrame, edgesFrame, nodesFrame } from 'test/relations';
import { renderRelations } from 'test/relationsCanvas';

// Canvas snapshots for the relations family's `chord` variant. Like sankey it
// self-layouts deterministically, so no layout is pinned; unlike sankey it accepts
// cycles and self-loops directly.
//
// Every test here is a snapshot test; the label-arbitration claims that compare two
// renders live in `integration-tests/relations/labels.integration.test.tsx`.

const renderChord = (input: Omit<Parameters<typeof renderRelations>[0], 'variant'>) =>
  renderRelations({ ...input, variant: 'chord' });

describe('relations chord', () => {
  describe('base', () => {
    it('the same nodes and links as a ring of arcs (four arcs, chords weighted by value)', async () => {
      const { defaultEvents, seriesEvents } = await renderChord({ frames: [nodesFrame, edgesFrame] });

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });

    it('an edges-only response (the same ring, labelled by id)', async () => {
      const { defaultEvents, seriesEvents } = await renderChord({ frames: [edgesFrame] });

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });

    // The counterpart to the sankey cycle case: chord has no DAG restriction, so the
    // same edge set renders with **every** link intact and no dropped-link note.
    it('a cyclic edge set (every link drawn, none dropped)', async () => {
      const { defaultEvents, seriesEvents } = await renderChord({ frames: [nodesFrame, cyclicEdgesFrame] });

      expect(seriesEvents.length).toBeGreaterThan(0);
      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });
  });

  describe('ring', () => {
    it('start angle 0 and counter-clockwise (the ring rotated and reversed)', async () => {
      const { defaultEvents, seriesEvents } = await renderChord({
        frames: [nodesFrame, edgesFrame],
        options: { relationsChordStartAngle: 0, relationsChordClockwise: false },
      });

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });

    it('pad angle 12 (wide gaps between arcs)', async () => {
      const { defaultEvents, seriesEvents } = await renderChord({
        frames: [nodesFrame, edgesFrame],
        options: { relationsChordPadAngle: 12 },
      });

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });

    /**
     * The floor under an arc's sweep, which is what keeps a node carrying almost no flow
     * from collapsing into a line the reader cannot hover. `edgesFrame`'s weights are all
     * within 3x of each other and reach the floor nowhere, so this needs its own lopsided
     * fixture: `trickle` carries 0.5 against three edges of 100, which at the default
     * `CHORD_MIN_ANGLE_DEFAULT` of 0 draws as a sliver.
     *
     * Compared against the same frames at the default, because "the sliver grew" is the
     * whole claim and a ring of arcs states it in a picture far better than in numbers.
     */
    it('minimum arc angle 30 (a sliver widened to a readable wedge)', async () => {
      const lopsidedEdges = toDataFrame({
        name: 'edges',
        fields: [
          { name: 'id', type: FieldType.string, values: ['e1', 'e2', 'e3', 'e4'] },
          { name: 'source', type: FieldType.string, values: ['gateway', 'gateway', 'api', 'api'] },
          { name: 'target', type: FieldType.string, values: ['api', 'web', 'web', 'trickle'] },
          { name: 'mainstat', type: FieldType.number, values: [100, 100, 100, 0.5] },
        ],
      });
      const { defaultEvents, seriesEvents } = await renderChord({
        frames: [lopsidedEdges],
        options: { relationsChordMinAngle: 30 },
      });

      const unfloored = await renderChord({ frames: [lopsidedEdges] });
      expect(normalizeCanvasEvents(seriesEvents)).not.toEqual(normalizeCanvasEvents(unfloored.seriesEvents));

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });
  });

  describe('labels', () => {
    it('node labels off (arcs and chords, no text)', async () => {
      const { defaultEvents, seriesEvents } = await renderChord({
        frames: [nodesFrame, edgesFrame],
        options: { relationsShowNodeLabels: false },
      });

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });
  });
});
