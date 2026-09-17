import { FieldType, toDataFrame } from '@grafana/data';
import { render } from '@testing-library/react';
import { type EChartsType } from 'echarts';
import { readLiveRelationsView } from 'lib/echarts/relations/options/view';
import { getChart, readCanvasLayer, SERIES_LAYER_SELECTOR } from 'test/canvas';
import { getComponent, height, waitForFinished, width } from 'test/panel';
import { edgesFrame, nodesFrame } from 'test/relations';
import { asPipelineWould, canvasOptions, labelPositions } from 'test/relationsCanvas';

describe('relations interaction', () => {
  describe.each([
    ['graph', 'graphRoam'],
    ['sankey', 'sankeyRoam'],
  ] as const)('%s viewport retention', (seriesType, roamAction) => {
    it('keeps the live view across resize and changed data', async () => {
      const panelOptions = canvasOptions({ relationsPan: true, relationsZoom: true, relationsRememberView: false });
      const panel = (frames = [nodesFrame, edgesFrame], panelWidth = width, panelHeight = height) =>
        getComponent(
          asPipelineWould(frames),
          seriesType,
          panelOptions,
          undefined,
          { width: panelWidth, height: panelHeight },
          'relations'
        );
      const { container, rerender } = render(panel());
      const { chart } = getChart(container);
      await waitForFinished(chart);

      chart!.dispatchAction({ type: roamAction, seriesIndex: 0, zoom: 1.6, originX: width / 2, originY: height / 2 });
      chart!.dispatchAction({ type: roamAction, seriesIndex: 0, dx: 35, dy: 20 });
      const roamed = readLiveRelationsView(chart!);
      expect(roamed?.zoom).toBeCloseTo(1.6);
      expect(roamed?.center).toEqual([expect.any(Number), expect.any(Number)]);

      rerender(panel(undefined, width + 120, height + 60));
      await waitForFinished(chart);
      expect(readLiveRelationsView(chart!)).toEqual(roamed);

      const changedNodes = toDataFrame({
        name: 'nodes',
        fields: [
          { name: 'id', type: FieldType.string, values: ['gateway', 'api', 'web', 'db'] },
          { name: 'title', type: FieldType.string, values: ['Gateway', 'API', 'Web', 'DB'] },
          { name: 'mainstat', type: FieldType.number, values: [121, 81, 61, 201] },
        ],
      });
      rerender(panel([changedNodes, edgesFrame], width + 120, height + 60));
      await waitForFinished(chart);
      expect(readLiveRelationsView(chart!)).toEqual(roamed);
    });

    it('keeps the live view through a temporary no-data state', async () => {
      const panelOptions = canvasOptions({ relationsPan: true, relationsZoom: true, relationsRememberView: false });
      const panel = (frames = [nodesFrame, edgesFrame]) =>
        getComponent(asPipelineWould(frames), seriesType, panelOptions, undefined, undefined, 'relations');
      const { container, rerender } = render(panel());
      const initial = getChart(container).chart!;
      await waitForFinished(initial);

      initial.dispatchAction({ type: roamAction, seriesIndex: 0, zoom: 1.6, originX: width / 2, originY: height / 2 });
      initial.dispatchAction({ type: roamAction, seriesIndex: 0, dx: 35, dy: 20 });
      const roamed = readLiveRelationsView(initial);
      expect(roamed?.zoom).toBeCloseTo(1.6);
      expect(roamed?.center).toEqual([expect.any(Number), expect.any(Number)]);

      rerender(panel([]));
      expect(initial.isDisposed()).toBe(true);

      rerender(panel());
      const replacement = getChart(container).chart!;
      await waitForFinished(replacement);

      expect(replacement).not.toBe(initial);
      expect(readLiveRelationsView(replacement)).toEqual(roamed);
    });
  });

  describe('zoom', () => {
    it('the roam action scales the view while scroll-to-zoom stays off', async () => {
      const { container } = render(
        getComponent(
          asPipelineWould([nodesFrame, edgesFrame]),
          'graph',
          canvasOptions({ relationsZoom: true }),
          undefined,
          undefined,
          'relations'
        )
      );
      const { chartInstanceDom, chart } = getChart(container);
      await waitForFinished(chart);

      // Pan is off, so the wheel is not bound.
      const series = (chart!.getOption() as { series: Array<{ roam?: unknown }> }).series[0];
      expect(series.roam).toBe(false);

      const before = readCanvasLayer(chartInstanceDom, SERIES_LAYER_SELECTOR).length;
      chart!.dispatchAction({ type: 'graphRoam', seriesIndex: 0, zoom: 1.5, originX: width / 2, originY: height / 2 });
      chart!.getZr().flush();
      const after = readCanvasLayer(chartInstanceDom, SERIES_LAYER_SELECTOR);

      expect(after.length).toBeGreaterThan(before);
      const scales = after
        .filter((event) => event.type === 'setTransform')
        .map((event) => (event.props as { a?: number }).a);
      expect(scales.some((scale) => scale != null && Math.abs(scale - 1) > 1e-6)).toBe(true);
    });
  });

  describe('pan', () => {
    const pan = { dx: 40, dy: 25 };

    const panGraph = async (before?: (chart: EChartsType) => void) => {
      const { container } = render(
        getComponent(
          asPipelineWould([nodesFrame, edgesFrame]),
          'graph',
          canvasOptions({ relationsShowEdgeValues: true, relationsPan: true }),
          undefined,
          undefined,
          'relations'
        )
      );
      const { chartInstanceDom, chart } = getChart(container);
      await waitForFinished(chart);
      before?.(chart!);
      chart!.getZr().flush();

      const painted = readCanvasLayer(chartInstanceDom, SERIES_LAYER_SELECTOR);
      chart!.dispatchAction({ type: 'graphRoam', seriesIndex: 0, ...pan });
      chart!.getZr().flush();
      const after = readCanvasLayer(chartInstanceDom, SERIES_LAYER_SELECTOR);

      const moved = labelPositions(after, painted.length);
      const still = labelPositions(painted).slice(-moved.length);
      return { still, moved };
    };

    it('every label moves with the graph it labels', async () => {
      const { still, moved } = await panGraph();

      expect(moved.map(({ text }) => text)).toEqual(still.map(({ text }) => text));
      expect(moved).toEqual(
        still.map(({ text, x, y }) => ({ text, x: expect.closeTo(x + pan.dx, 6), y: expect.closeTo(y + pan.dy, 6) }))
      );
      expect(moved.map(({ text }) => text)).toEqual(
        expect.arrayContaining(['Gateway', 'API', 'Web', 'DB', '100', '50', '40'])
      );
    });

    it('the labels stay attached across a zoom', async () => {
      const { still, moved } = await panGraph((chart) =>
        chart.dispatchAction({ type: 'graphRoam', seriesIndex: 0, zoom: 2, originX: 0, originY: 0 })
      );

      expect(moved).toEqual(
        still.map(({ text, x, y }) => ({ text, x: expect.closeTo(x + pan.dx, 6), y: expect.closeTo(y + pan.dy, 6) }))
      );
      expect(moved.map(({ text }) => text)).toEqual(
        expect.arrayContaining(['Gateway', 'API', 'Web', 'DB', '100', '50', '40'])
      );
    });
  });
});
