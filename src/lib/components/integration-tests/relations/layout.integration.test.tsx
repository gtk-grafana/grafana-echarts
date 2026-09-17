import { type DataFrame, FieldType, toDataFrame } from '@grafana/data';
import { render, waitFor } from '@testing-library/react';
import { type CanvasRenderingContext2DEvent } from 'jest-canvas-mock';
import { relationsChartModule } from 'lib/echarts/relations/chartModule';
import { init } from 'lib/echarts/echarts';
import { ENABLE_TIME_BRUSH_ACTION } from 'lib/echarts/timeBrush';
import { Children, cloneElement, type ReactElement } from 'react';
import { clearMockedCanvasEvents, getChart, normalizeCanvasEvents, SERIES_LAYER_SELECTOR } from 'test/canvas';
import { getComponent, getSeriesCanvasEvents } from 'test/panel';
import { crowdedEdgesFrame, crowdedNodesFrame, edgesFrame, nodesFrame, slackEdgesFrame } from 'test/relations';
import { asPipelineWould, canvasOptions, labelTexts, renderRelations } from 'test/relationsCanvas';

interface RenderedNodeBounds {
  centerX: number;
  centerY: number;
  radiusX: number;
  radiusY: number;
}

interface GraphNodeData {
  count(): number;
  getItemLayout(index: number): readonly [number, number];
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

/** Copy the live force-node coordinates so later mutations cannot change the baseline. */
const graphNodeLayouts = (chart: unknown): Array<readonly [number, number]> => {
  const data = (
    chart as {
      getModel(): { getSeriesByIndex(index: number): { getGraph(): { data: GraphNodeData } } };
    }
  )
    .getModel()
    .getSeriesByIndex(0)
    .getGraph().data;

  return Array.from({ length: data.count() }, (_, index) => {
    const [x, y] = data.getItemLayout(index);
    return [x, y] as const;
  });
};

/** Recreate Grafana's frame and field wrappers without replacing their values. */
const withPresentationWrappers = (frames: DataFrame[]): DataFrame[] =>
  frames.map((frame) => ({
    ...frame,
    fields: frame.fields.map((field) => ({ ...field, config: { ...field.config } })),
  }));

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
  return nodeBounds(seriesEvents);
};

describe('relations layout', () => {
  describe('force', () => {
    it('releases brush state when a full replacement switches to a roaming graph', () => {
      const element = document.createElement('div');
      Object.assign(element.style, { width: '400px', height: '300px' });
      document.body.appendChild(element);
      const chart = init(element);

      try {
        chart.setOption(
          {
            brush: { xAxisIndex: 0, brushMode: 'single' },
            grid: {},
            xAxis: { type: 'time' },
            yAxis: {},
            series: [{ type: 'line', data: [[0, 1]] }],
          },
          { notMerge: true }
        );
        chart.dispatchAction(ENABLE_TIME_BRUSH_ACTION);
        chart.setOption(
          {
            series: [
              {
                type: 'graph',
                roam: true,
                data: [{ id: 'a' }, { id: 'b' }],
                links: [{ source: 'a', target: 'b' }],
              },
            ],
          },
          { notMerge: true }
        );

        chart.dispatchAction({ type: 'graphRoam', seriesIndex: 0, zoom: 1.5, originX: 200, originY: 150 });

        expect(chart.getOption()).toHaveProperty('brush', []);
        const zoom = (
          chart as unknown as { getModel(): { getSeriesByIndex(index: number): { get(key: string): unknown } } }
        )
          .getModel()
          .getSeriesByIndex(0)
          .get('zoom');
        expect(zoom).toBe(1.5);
      } finally {
        chart.dispose();
        element.remove();
      }
    });

    it.each([
      ['small', [nodesFrame, edgesFrame], 4],
      ['crowded', [crowdedNodesFrame, crowdedEdgesFrame], 12],
      ['disconnected', [disconnectedNodesFrame, disconnectedEdgesFrame], 6],
    ] as const)('draws every %s fixture node with finite geometry', async (_name, frames, expectedNodes) => {
      for (const [width, height] of [
        [400, 300],
        [640, 360],
      ] as const) {
        const nodes = await renderForceGraph([...frames], width, height);

        expect(nodes).toHaveLength(expectedNodes);
        for (const node of nodes) {
          expect(Object.values(node).every(Number.isFinite)).toBe(true);
        }
      }
    });

    it('keeps one mounted graph inside the final rectangle after a resize burst', async () => {
      const frames = asPipelineWould([crowdedNodesFrame, crowdedEdgesFrame]);
      const options = canvasOptions({
        relationsLayout: 'force',
        relationsNodeSize: 24,
        relationsShowNodeLabels: false,
      });
      const initial = getComponent(frames, 'graph', options, undefined, { width: 400, height: 300 }, 'relations');
      const panel = Children.only(initial.props.children) as ReactElement<{ width: number; height: number }>;
      const atSize = (width: number, height: number) =>
        cloneElement(initial, { style: { width, height } }, cloneElement(panel, { width, height }));
      const { container, rerender } = render(atSize(400, 300));
      await getSeriesCanvasEvents(container);
      const chart = getChart(container).chart!;
      const setOption = jest.spyOn(chart, 'setOption');

      rerender(atSize(520, 340));
      rerender(atSize(640, 420));
      rerender(atSize(800, 500));

      expect(setOption).toHaveBeenCalledTimes(3);
      for (const [option, opts] of setOption.mock.calls) {
        expect(option).toEqual({
          series: [{ type: 'graph', force: { layoutAnimation: true, friction: 0.05, initLayout: 'none' } }],
        });
        expect(opts).toBeUndefined();
      }

      const seriesCanvas = container.querySelector<HTMLCanvasElement>(SERIES_LAYER_SELECTOR);
      expect(seriesCanvas).not.toBeNull();
      const seriesContext = seriesCanvas!.getContext('2d')!;
      clearMockedCanvasEvents(seriesContext);

      await waitFor(() => expect(setOption).toHaveBeenCalledTimes(4));
      const fullOptionCalls = setOption.mock.calls.filter(([, opts]) => opts?.notMerge === true);
      const settledCalls = setOption.mock.calls.filter(
        ([option, opts]) =>
          opts == null &&
          (option as { series?: Array<{ force?: { friction?: number } }> }).series?.[0].force?.friction === 0.2
      );

      expect(fullOptionCalls).toHaveLength(0);
      expect(settledCalls).toHaveLength(1);
      expect(settledCalls[0][0]).toMatchObject({
        series: [{ type: 'graph', force: { initLayout: 'none', friction: 0.2, layoutAnimation: true } }],
      });
      expect(chart.getWidth()).toBe(800);
      expect(chart.getHeight()).toBeLessThanOrEqual(500);

      // Paint queued display-list work without changing the chart size or layout.
      chart.getZr().flush();

      const seriesEvents = seriesContext.__getEvents();
      const nodes = nodeBounds(seriesEvents).slice(-12);
      const plotWidth = chart.getWidth();
      const plotHeight = chart.getHeight();
      expect(nodes).toHaveLength(12);
      for (const node of nodes) {
        expect(node.centerX - node.radiusX).toBeGreaterThanOrEqual(0);
        expect(node.centerX + node.radiusX).toBeLessThanOrEqual(plotWidth);
        expect(node.centerY - node.radiusY).toBeGreaterThanOrEqual(0);
        expect(node.centerY + node.radiusY).toBeLessThanOrEqual(plotHeight);
      }
    });

    it('keeps a mounted preview frozen until a field values object changes', async () => {
      const suggestionWidth = 350;
      const suggestionHeight = 219;
      const frames = asPipelineWould([crowdedNodesFrame, crowdedEdgesFrame]);
      const card = (update: number, nextFrames: DataFrame[] = frames) => {
        const component = getComponent(
          withPresentationWrappers(nextFrames),
          'graph',
          canvasOptions({
            isPreview: true,
            relationsLayout: 'force',
            relationsNodeSize: 16 + update,
            relationsRepulsion: 80 + update,
            relationsShowNodeLabels: update % 2 === 0,
          }),
          undefined,
          {
            width: suggestionWidth,
            height: suggestionHeight,
            renderCounter: update,
            title: `Suggestion ${update}`,
            transparent: update % 2 === 0,
            onChangeTimeRange: jest.fn(),
            onFieldConfigChange: jest.fn(),
            onOptionsChange: jest.fn(),
            replaceVariables: (value) => `${value}`,
          },
          'relations'
        );

        return cloneElement(component, {
          className: update % 2 === 0 ? 'suggestion-card-even' : 'suggestion-card-odd',
          style: {
            width: suggestionWidth + update * 7,
            height: suggestionHeight + update * 3,
            padding: update % 3,
          },
        });
      };

      const { container, rerender } = render(card(0));
      await getSeriesCanvasEvents(container);
      const chart = getChart(container).chart!;
      const initialLayouts = graphNodeLayouts(chart);
      const buildOption = jest.spyOn(relationsChartModule, 'buildOption');
      const setOption = jest.spyOn(chart, 'setOption');
      const resize = jest.spyOn(chart, 'resize');

      for (let update = 1; update <= 20; update++) {
        rerender(card(update));
      }

      expect(getChart(container).chart).toBe(chart);
      expect(buildOption).not.toHaveBeenCalled();
      expect(setOption).not.toHaveBeenCalled();
      expect(resize).not.toHaveBeenCalled();
      expect(graphNodeLayouts(chart)).toEqual(initialLayouts);

      const changedFrames = frames.map((frame, frameIndex) => ({
        ...frame,
        fields: frame.fields.map((field, fieldIndex) =>
          frameIndex === 0 && fieldIndex === 0 ? { ...field, values: Array.from(field.values) } : field
        ),
      }));
      rerender(card(21, changedFrames));

      await waitFor(() => expect(setOption).toHaveBeenCalledTimes(1));
      expect(getChart(container).chart).toBe(chart);
      expect(buildOption).toHaveBeenCalledTimes(1);
      expect(setOption).toHaveBeenCalledWith(expect.objectContaining({ series: expect.any(Array) }), {
        notMerge: true,
      });
      expect(resize).not.toHaveBeenCalled();
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
