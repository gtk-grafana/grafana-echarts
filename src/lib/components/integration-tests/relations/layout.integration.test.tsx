import { FieldType, toDataFrame } from '@grafana/data';
import { render } from '@testing-library/react';
import { type CanvasRenderingContext2DEvent } from 'jest-canvas-mock';
import { getChart, normalizeCanvasEvents } from 'test/canvas';
import { getComponent, getSeriesCanvasEvents } from 'test/panel';
import { crowdedEdgesFrame, crowdedNodesFrame, edgesFrame, nodesFrame, slackEdgesFrame } from 'test/relations';
import { asPipelineWould, canvasOptions, labelTexts, renderRelations } from 'test/relationsCanvas';

interface RenderedNodeBounds {
  centerX: number;
  centerY: number;
  radiusX: number;
  radiusY: number;
}

const disconnectedNodesFrame = toDataFrame({
  name: 'nodes',
  fields: [
    { name: 'id', type: FieldType.string, values: ['a', 'b', 'c', 'd', 'e', 'f'] },
    { name: 'title', type: FieldType.string, values: ['A', 'B', 'C', 'D', 'E', 'F'] },
    { name: 'mainstat', type: FieldType.number, values: [1, 2, 3, 4, 5, 6] },
  ],
});

const disconnectedEdgesFrame = toDataFrame({
  name: 'edges',
  fields: [
    { name: 'id', type: FieldType.string, values: ['one'] },
    { name: 'source', type: FieldType.string, values: ['a'] },
    { name: 'target', type: FieldType.string, values: ['b'] },
    { name: 'mainstat', type: FieldType.number, values: [1] },
  ],
});

/** Read each graph node's center and radius in plot pixels. */
const nodeBounds = (events: CanvasRenderingContext2DEvent[]): RenderedNodeBounds[] =>
  events.flatMap((event) => {
    if (event.type !== 'arc') {
      return [];
    }
    const { x, y, radius } = event.props as unknown as { x: number; y: number; radius: number };
    const [a, b, c, d, e, f] = (event as unknown as { transform: number[] }).transform;
    return [
      {
        centerX: a * x + c * y + e,
        centerY: b * x + d * y + f,
        radiusX: radius * Math.hypot(a, c),
        radiusY: radius * Math.hypot(b, d),
      },
    ];
  });

const renderForceGraph = async (frames: Parameters<typeof asPipelineWould>[0], width: number, height: number) => {
  const options = canvasOptions({
    relationsLayout: 'force',
    relationsNodeSize: 24,
    relationsShowNodeLabels: false,
  });
  const { container } = render(
    getComponent(asPipelineWould(frames), 'graph', options, undefined, { width, height }, 'relations')
  );
  const { seriesEvents } = await getSeriesCanvasEvents(container);
  const chart = getChart(container).chart!;
  return { chart, nodes: nodeBounds(seriesEvents) };
};

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

    it.each([
      ['small', [nodesFrame, edgesFrame]],
      ['crowded', [crowdedNodesFrame, crowdedEdgesFrame]],
      ['disconnected', [disconnectedNodesFrame, disconnectedEdgesFrame]],
    ] as const)('keeps every %s graph node inside two panel rectangles', async (_name, frames) => {
      for (const [width, height] of [
        [400, 300],
        [640, 360],
      ] as const) {
        const { chart, nodes } = await renderForceGraph([...frames], width, height);
        const plotWidth = chart.getWidth();
        const plotHeight = chart.getHeight();

        expect(nodes.length).toBeGreaterThan(0);
        for (const node of nodes) {
          expect(node.centerX - node.radiusX).toBeGreaterThanOrEqual(0);
          expect(node.centerX + node.radiusX).toBeLessThanOrEqual(plotWidth);
          expect(node.centerY - node.radiusY).toBeGreaterThanOrEqual(0);
          expect(node.centerY + node.radiusY).toBeLessThanOrEqual(plotHeight);
        }
      }
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
