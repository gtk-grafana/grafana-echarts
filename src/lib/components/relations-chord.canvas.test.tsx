import { normalizeCanvasEvents } from 'test/canvas';
import { height, width } from 'test/panel';
import { cyclicEdgesFrame, edgesFrame, nodesFrame } from 'test/relations';
import { renderRelations } from 'test/relationsCanvas';

// Canvas snapshots for the relations family's `chord` variant. Like sankey it
// self-layouts deterministically, so no layout is pinned; unlike sankey it accepts
// cycles and self-loops directly.
//
// Every test here is a snapshot test; the label-arbitration claims that compare two
// renders live in `relations-labels.integration.test.tsx`.

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
