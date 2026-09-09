import { render } from '@testing-library/react';
import { type EChartsType } from 'echarts';
import { getChart, readCanvasLayer, SERIES_LAYER_SELECTOR } from 'test/canvas';
import { getComponent, height, waitForFinished, width } from 'test/panel';
import { edgesFrame, nodesFrame } from 'test/relations';
import { asPipelineWould, canvasOptions, labelPositions } from 'test/relationsCanvas';

/**
 * Zoom and pan on the relations family, driven through the roam action rather than the
 * mouse. Both claims are about what a *second* paint does relative to the first, so
 * neither has a picture to store.
 */
describe('relations interaction', () => {
  /**
   * Zoom is the panel's own buttons, not ECharts' scroll wheel, and this is the claim
   * that rests on: the roam **action** scales the view even though `roam` is `false`.
   *
   * It holds because the action is registered independently of the controller
   * (`registerRoamActionSimply`) and resolves the series' view coordinate system directly
   * (`getOwnRoamViewCoordSys`), where `roam` only decides whether the *mouse* is bound.
   * If that ever stopped being true the buttons would silently do nothing, so it is
   * asserted on the pixels rather than on the option.
   */
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

      // Pan is off, so the wheel is not bound — which is the point of the buttons.
      const series = (chart!.getOption() as { series: Array<{ roam?: unknown }> }).series[0];
      expect(series.roam).toBe(false);

      const before = readCanvasLayer(chartInstanceDom, SERIES_LAYER_SELECTOR).length;
      chart!.dispatchAction({ type: 'graphRoam', seriesIndex: 0, zoom: 1.5, originX: width / 2, originY: height / 2 });
      chart!.getZr().flush();
      const after = readCanvasLayer(chartInstanceDom, SERIES_LAYER_SELECTOR);

      // jest-canvas-mock accumulates draw calls, so the repaint shows up as more of them.
      // The transform is what actually moved: a scaled view writes a new `setTransform`.
      expect(after.length).toBeGreaterThan(before);
      const scales = after
        .filter((event) => event.type === 'setTransform')
        .map((event) => (event.props as { a?: number }).a);
      expect(scales.some((scale) => scale != null && Math.abs(scale - 1) > 1e-6)).toBe(true);
    });
  });

  /**
   * **The reported bug**: panning a graph left every edge value behind, hanging in the
   * middle of the panel while the links it labelled slid out from under it.
   *
   * A pan is a transform on the series group, so "moved with the graph" is the whole
   * claim, and it is stated as the strictest form of it: *every* label drawn — node names
   * and edge values alike — lands exactly one pan vector from where it was. Measured
   * before the fix, the node names moved by (40, 25) and the edge values by (0, 0). See
   * `registerLocalLabelAnchors` for why they were pinned to the canvas.
   *
   * Overlap hiding is left at its default (**on**), because that is the condition: it is
   * what puts the labels through `labelLayout` in the first place.
   */
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

      // Draw calls accumulate, so the pan's repaint is the tail; the pass before it is
      // the one to compare against, which is the tail of what was painted by then.
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
      // Guard against agreeing on an empty graph, or on one drawn with no edge values.
      expect(moved.map(({ text }) => text)).toEqual(expect.arrayContaining(['100', '50', '90', '40']));
    });

    // The zoom buttons re-run the label layout stage on their own (`updateLabelLayout`),
    // without an update around it — a second way to reach the same detachment, and the
    // reason the repair hooks that stage rather than the end of an update.
    it('the labels stay attached across a zoom', async () => {
      const { still, moved } = await panGraph((chart) =>
        chart.dispatchAction({ type: 'graphRoam', seriesIndex: 0, zoom: 2, originX: 0, originY: 0 })
      );

      expect(moved).toEqual(
        still.map(({ text, x, y }) => ({ text, x: expect.closeTo(x + pan.dx, 6), y: expect.closeTo(y + pan.dy, 6) }))
      );
      expect(moved.map(({ text }) => text)).toEqual(expect.arrayContaining(['100', '50', '90', '40']));
    });
  });
});
