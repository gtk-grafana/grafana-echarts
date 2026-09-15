import { FieldType, toDataFrame } from '@grafana/data';
import { normalizeCanvasEvents } from 'test/canvas';
import { edgesFrame, nodesFrame, slackEdgesFrame } from 'test/relations';
import { labelTexts, renderRelations } from 'test/relationsCanvas';

describe('relations layout', () => {
  describe('force', () => {
    it('two renders of the same frames draw identical calls', async () => {
      const options = { relationsLayout: 'force' as const };
      const first = await renderRelations({ frames: [nodesFrame, edgesFrame], options });
      const second = await renderRelations({ frames: [nodesFrame, edgesFrame], options });

      expect(normalizeCanvasEvents(second.seriesEvents)).toEqual(normalizeCanvasEvents(first.seriesEvents));
      // Guard against the assertion passing on two empty layers.
      expect(first.seriesEvents.length).toBeGreaterThan(0);
    });

    it('two renders of an edges-only response draw identical calls', async () => {
      const options = { relationsLayout: 'force' as const };
      const first = await renderRelations({ frames: [edgesFrame], options });
      const second = await renderRelations({ frames: [edgesFrame], options });

      expect(normalizeCanvasEvents(second.seriesEvents)).toEqual(normalizeCanvasEvents(first.seriesEvents));
      expect(first.seriesEvents.length).toBeGreaterThan(0);
    });
  });

  describe('sankey node alignment', () => {
    const renderAligned = async (options: Record<string, unknown> = {}) => {
      const { seriesEvents } = await renderRelations({
        frames: [slackEdgesFrame],
        variant: 'sankey',
        options,
      });
      return JSON.stringify(normalizeCanvasEvents(seriesEvents));
    };

    /** Compare two identical renders. */
    it('draws the same picture twice for one setting', async () => {
      const [first, second] = [await renderAligned(), await renderAligned()];

      expect(second).toEqual(first);
      expect(first.length).toBeGreaterThan(0);
    });

    // `left` keeps `cache` in column 1. `justify` moves it to the last column.
    it('draws a different picture for left than for justify', async () => {
      const left = await renderAligned({ relationsSankeyNodeAlign: 'left' });
      const justify = await renderAligned({ relationsSankeyNodeAlign: 'justify' });

      expect(left).not.toEqual(justify);
    });

    it('defaults to left, so an unset panel matches an explicit left', async () => {
      const unset = await renderAligned();
      const left = await renderAligned({ relationsSankeyNodeAlign: 'left' });
      const justify = await renderAligned({ relationsSankeyNodeAlign: 'justify' });

      expect(unset).toEqual(left);
      expect(unset).not.toEqual(justify);
    });
  });

  describe('fixed', () => {
    it('every node is drawn even when the data pins nothing', async () => {
      const { seriesEvents } = await renderRelations({
        frames: [nodesFrame, edgesFrame],
        options: { relationsLayout: 'none' },
      });

      expect(labelTexts(seriesEvents)).toEqual(expect.arrayContaining(['Gateway', 'API', 'Web', 'DB']));
    });

    it('pinned and unpinned nodes are drawn together', async () => {
      const halfPinned = toDataFrame({
        name: 'nodes',
        fields: [
          { name: 'id', type: FieldType.string, values: ['gateway', 'api', 'web', 'db'] },
          { name: 'title', type: FieldType.string, values: ['Gateway', 'API', 'Web', 'DB'] },
          { name: 'fixedx', type: FieldType.number, values: [50, 150, null, null] },
          { name: 'fixedy', type: FieldType.number, values: [150, 80, null, null] },
        ],
      });
      const { seriesEvents } = await renderRelations({
        frames: [halfPinned, edgesFrame],
        options: { relationsLayout: 'none' },
      });

      expect(labelTexts(seriesEvents)).toEqual(expect.arrayContaining(['Gateway', 'API', 'Web', 'DB']));
    });

    it('a gradient link colour is emitted only where the layout knows the positions', async () => {
      const gradientCalls = async (relationsLayout: 'none' | 'circular') => {
        const { seriesEvents } = await renderRelations({
          frames: [nodesFrame, edgesFrame],
          options: { relationsLayout, relationsLinkColor: 'gradient' },
        });
        return seriesEvents.filter((event) => event.type === 'createLinearGradient').length;
      };

      expect(await gradientCalls('none')).toBeGreaterThan(0);
      expect(await gradientCalls('circular')).toBe(0);
    });
  });
});
