import { FieldType, toDataFrame } from '@grafana/data';
import { normalizeCanvasEvents } from 'test/canvas';
import { height, width } from 'test/panel';
import { cyclicEdgesFrame, edgesFrame, nodesFrame } from 'test/relations';
import { renderRelations } from 'test/relationsCanvas';

const renderChord = (input: Omit<Parameters<typeof renderRelations>[0], 'variant'>) =>
  renderRelations({
    ...input,
    variant: 'chord',
    // Keep canvas baselines focused on geometry. The integration suite tests gradients.
    options: { relationsLinkColor: 'source', ...input.options },
  });

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

  describe('link color', () => {
    it('target', async () => {
      const { defaultEvents, seriesEvents } = await renderChord({
        frames: [nodesFrame, edgesFrame],
        options: { relationsLinkColor: 'target' },
      });

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });

    it('source', async () => {
      const { defaultEvents, seriesEvents } = await renderChord({
        frames: [nodesFrame, edgesFrame],
        options: { relationsLinkColor: 'source' },
      });

      expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
    });

    it('gradient', async () => {
      const { defaultEvents, seriesEvents } = await renderChord({
        frames: [nodesFrame, edgesFrame],
        options: { relationsLinkColor: 'source' },
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
