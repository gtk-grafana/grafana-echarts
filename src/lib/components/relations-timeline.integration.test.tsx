import { FieldType, toDataFrame } from '@grafana/data';
import { act, fireEvent, screen } from '@testing-library/react';
import { relationsChartModule } from 'lib/echarts/charts/relations';
import { type EChartGraphSeriesOption, type RelationsChartContext } from 'lib/echarts/charts/types';
import { GRAPH_EDGES_WIDE } from 'lib/echarts/converters/graphWide';
import { getChart, readCanvasLayer, SERIES_LAYER_SELECTOR } from 'test/canvas';
import { waitForFinished } from 'test/panel';
import { linkItems, relationsContext, relationsOptions } from 'test/relations';
import { labelTexts, renderRelations } from 'test/relationsCanvas';
import { TIME_SLIDER_HEIGHT } from './ChartTimeSlider';

/**
 * The time slider end to end through the family module: which timestamps it offers, what the
 * built option carries at one of them, and what it says when there is nothing to step
 * through.
 *
 * Asserted on the **built option** rather than on a picture, because every claim here is a
 * difference between two renders of the same frames, and a stored baseline cannot state a
 * comparison. The picture worth reviewing is the canvas sibling.
 */

const T0 = 1700000000000;
const STEP = 300000;

/** One ranged edges frame on a shared row grid — the pivoted Prometheus shape. */
const rangedEdges = () =>
  toDataFrame({
    name: 'edges',
    meta: { type: GRAPH_EDGES_WIDE },
    fields: [
      { name: 'Time', type: FieldType.time, values: [T0, T0 + STEP, T0 + 2 * STEP] },
      { name: 'gateway-->api', type: FieldType.number, values: [1, 2, 3] },
      { name: 'api-->db', type: FieldType.number, values: [10, 20, 30] },
    ],
  });

/** The same graph with no row dimension — `rowsToFields`, or Tempo's service map. */
const instantEdges = () =>
  toDataFrame({
    name: 'edges',
    meta: { type: GRAPH_EDGES_WIDE },
    fields: [
      { name: 'gateway-->api', type: FieldType.number, values: [3] },
      { name: 'api-->db', type: FieldType.number, values: [30] },
    ],
  });

const context = (frames: Array<ReturnType<typeof rangedEdges>>, extra: Partial<RelationsChartContext> = {}) => ({
  ...relationsContext({ frames, options: relationsOptions({ relationsTimeSlider: true }) }),
  ...extra,
});

const weights = (ctx: RelationsChartContext): Array<number | undefined> => {
  const option = relationsChartModule.buildOption(ctx, { isGrafanaLegend: true }) as EChartGraphSeriesOption;
  const series = Array.isArray(option.series) ? option.series[0] : option.series;
  return linkItems(series as { links?: unknown }).map((link) => link.value);
};

describe('relations time slider', () => {
  describe('getTimeline', () => {
    it('offers every stop the response carries once the option is on', () => {
      expect(relationsChartModule.getTimeline?.(context([rangedEdges()]))).toEqual([T0, T0 + STEP, T0 + 2 * STEP]);
    });

    // The option is the other half: ranged data with the switch off still reduces.
    it('offers none while the option is off', () => {
      const ctx = relationsContext({ frames: [rangedEdges()], options: relationsOptions() });

      expect(relationsChartModule.getTimeline?.(ctx)).toBeNull();
    });

    /**
     * Instant data has nowhere to scrub to. Hiding the strip there is what keeps
     * `tempo-service-map.json` — one row, from `rowsToFields` — rendering as it always
     * has when somebody switches the option on across a dashboard.
     */
    it('offers none on instant data', () => {
      expect(relationsChartModule.getTimeline?.(context([instantEdges()]))).toBeNull();
    });
  });

  /**
   * The reduced reading and the selected-row reading of the same frames, side by side.
   * `lastNotNull` — the family's default — is the newest row, which is why the slider
   * starting at the newest stop changes no picture.
   */
  it('builds a different graph at an earlier timestamp than the reducer draws', () => {
    const reduced = weights(context([rangedEdges()]));
    const earlier = weights(context([rangedEdges()], { selectedTime: T0 }));

    expect(reduced).toEqual([3, 30]);
    expect(earlier).toEqual([1, 10]);
  });

  it('reads each mark at the selected row', () => {
    expect(weights(context([rangedEdges()], { selectedTime: T0 + STEP }))).toEqual([2, 20]);
  });

  /**
   * The topology does not move while scrubbing. A mark with no sample at the selected
   * timestamp reads `null` and draws weightless (`value ?? 1`) rather than vanishing, so
   * the node set and the link set are the same at every stop — which is what makes a
   * scrub legible as one graph changing rather than as several different graphs.
   */
  it('keeps the same nodes and links at every stop', () => {
    const shapeAt = (at: number) => {
      const option = relationsChartModule.buildOption(context([rangedEdges()], { selectedTime: at }), {
        isGrafanaLegend: true,
      }) as EChartGraphSeriesOption;
      const series = Array.isArray(option.series) ? option.series[0] : option.series;
      return {
        nodes: (series as { data?: Array<{ id?: string }> }).data?.map((node) => node.id),
        links: linkItems(series as { links?: unknown }).map((link) => `${link.source}-->${link.target}`),
      };
    };

    expect(shapeAt(T0)).toEqual(shapeAt(T0 + 2 * STEP));
  });

  /**
   * Switching the option on hides the "Calculation" picker (`addRelationsStatOptions`),
   * so a response with no timeline would leave the user with no control at all and
   * nothing saying why. The advisory is that explanation.
   */
  it('advises when the option is on but the data is instant', () => {
    const notices = relationsChartModule.getNotices?.(context([instantEdges()])) ?? [];

    expect(notices).toEqual([{ severity: 'info', text: expect.stringContaining('no timeline to step through') }]);
  });

  it('says nothing when the option is on and there is a timeline', () => {
    expect(relationsChartModule.getNotices?.(context([rangedEdges()]))).toEqual([]);
  });

  it('says nothing about instant data while the option is off', () => {
    const ctx = relationsContext({ frames: [instantEdges()], options: relationsOptions() });

    expect(relationsChartModule.getNotices?.(ctx)).toEqual([]);
  });

  /**
   * The strip takes **layout**, unlike every other piece of panel chrome: `ChartNotices`
   * and `ChartZoomControls` are absolute overlays specifically so they do not shrink the
   * plot, and a slider laid over the chart would sit on top of the marks it is there to
   * change. So the chart is given the remaining height, in pixels — `EChart` writes it as
   * an inline style *and* pushes the same number into ECharts, which cannot read a solved
   * flex box.
   *
   * A difference between two renders, so it is asserted as one rather than snapshotted.
   */
  it('shortens the chart by exactly the strip', async () => {
    const withSlider = await renderRelations({
      frames: [rangedEdges()],
      options: { relationsTimeSlider: true },
    });
    const withoutSlider = await renderRelations({ frames: [rangedEdges()] });

    const heightOf = (container: HTMLElement) => getChart(container).chart?.getHeight();

    expect(heightOf(withSlider.container)).toBe((heightOf(withoutSlider.container) ?? 0) - TIME_SLIDER_HEIGHT);
    // Guard against agreeing on a chart that never sized itself.
    expect(heightOf(withoutSlider.container)).toBeGreaterThan(TIME_SLIDER_HEIGHT);
  });

  // The other half of the same fact: instant data draws no strip, so the plot keeps the
  // whole panel even with the option on.
  it('leaves the chart full height when there is no timeline', async () => {
    const withOption = await renderRelations({
      frames: [instantEdges()],
      options: { relationsTimeSlider: true },
    });
    const plain = await renderRelations({ frames: [instantEdges()] });

    expect(screen.queryByTestId('chart-time-slider')).not.toBeInTheDocument();
    expect(getChart(withOption.container).chart?.getHeight()).toBe(getChart(plain.container).chart?.getHeight());
  });

  /**
   * The whole loop, through the real panel: moving the slider changes the selected
   * timestamp, which rebuilds the option, which repaints the chart. Asserted on the ink,
   * because everything between the keystroke and the canvas is what this feature is.
   *
   * `relationsShowEdgeValues` is on so the weights are *drawn*: a graph link's thickness
   * comes from `custom.lineWidth`, not from its value, so without the labels the two
   * timestamps would paint the same lines.
   */
  it('repaints the chart when the slider is moved', async () => {
    const { container } = await renderRelations({
      frames: [rangedEdges()],
      options: { relationsTimeSlider: true, relationsShowEdgeValues: true },
    });
    const { chart } = getChart(container);

    const painted = () => labelTexts(readCanvasLayer(getChart(container).chartInstanceDom, SERIES_LAYER_SELECTOR));
    // The newest stop is where an unscrubbed panel starts, so `3`/`30` are on screen.
    expect(painted()).toEqual(expect.arrayContaining(['3', '30']));

    // `Home` takes rc-slider to its minimum — the earliest stop. `fireEvent` act-wraps
    // itself; only the settling is awaited inside `act`.
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Selected time' }), { key: 'Home', keyCode: 36 });
    await act(async () => {
      await waitForFinished(chart);
    });

    expect(painted()).toEqual(expect.arrayContaining(['1', '10']));
  });

  /**
   * The legend is built from the same reading, so a node's swatch and a scrubbed graph
   * cannot disagree — `buildLegendItems` takes the selection too, not only the option
   * builder. Colour is the visible half of that on a by-value scheme.
   */
  it('builds the legend from the selected row as well', () => {
    const ctx = context([rangedEdges()], { selectedTime: T0 });

    expect(relationsChartModule.buildLegendItems(ctx, []).map((item) => item.label)).toEqual(['gateway', 'api', 'db']);
  });
});
