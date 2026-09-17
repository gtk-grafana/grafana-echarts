import { FieldType, toDataFrame } from '@grafana/data';
import { act, fireEvent, screen } from '@testing-library/react';
import { relationsChartModule } from 'lib/echarts/relations/chartModule';
import { type EChartGraphSeriesOption, type RelationsChartContext } from 'lib/echarts/charts/types';

import { getChart, readCanvasLayer, SERIES_LAYER_SELECTOR } from 'test/canvas';
import { waitForFinished } from 'test/panel';
import { linkItems, relationsContext, relationsOptions } from 'test/relations';
import { labelTexts, renderRelations } from 'test/relationsCanvas';
import { TIME_SLIDER_HEIGHT } from 'lib/components/ChartTimeSlider';

import { GRAPH_EDGES_WIDE } from 'lib/echarts/relations/converters/contract';

const T0 = 1700000000000;
const STEP = 300000;

/** Build one ranged edge frame on a shared row grid. */
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

/** Build a graph without a row dimension. */
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

    it('offers none on instant data', () => {
      expect(relationsChartModule.getTimeline?.(context([instantEdges()]))).toBeNull();
    });
  });

  it('builds a different graph at an earlier timestamp than the reducer draws', () => {
    const reduced = weights(context([rangedEdges()]));
    const earliest = weights(context([rangedEdges()], { selectedTime: T0 }));
    const newest = weights(context([rangedEdges()], { selectedTime: T0 + 2 * STEP }));

    expect(reduced).toEqual([2, 20]);
    expect(earliest).toEqual([1, 10]);
    expect(newest).toEqual([3, 30]);
  });

  it('reads each mark at the selected row', () => {
    expect(weights(context([rangedEdges()], { selectedTime: T0 + STEP }))).toEqual([2, 20]);
  });

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

  it('leaves the chart full height when there is no timeline', async () => {
    const withOption = await renderRelations({
      frames: [instantEdges()],
      options: { relationsTimeSlider: true },
    });
    const plain = await renderRelations({ frames: [instantEdges()] });

    expect(screen.queryByTestId('chart-time-slider')).not.toBeInTheDocument();
    expect(getChart(withOption.container).chart?.getHeight()).toBe(getChart(plain.container).chart?.getHeight());
  });

  it('repaints the chart when the slider is moved', async () => {
    const { container } = await renderRelations({
      frames: [rangedEdges()],
      options: { isPreview: true, relationsTimeSlider: true, relationsShowEdgeValues: true },
    });
    const { chart } = getChart(container);

    const painted = () => labelTexts(readCanvasLayer(getChart(container).chartInstanceDom, SERIES_LAYER_SELECTOR));
    // The newest stop is where an unscrubbed panel starts, so `3`/`30` are on screen.
    expect(painted()).toEqual(expect.arrayContaining(['3', '30']));

    fireEvent.keyDown(screen.getByRole('slider', { name: 'Selected time' }), { key: 'Home', keyCode: 36 });
    await act(async () => {
      await waitForFinished(chart);
    });

    expect(painted()).toEqual(expect.arrayContaining(['1', '10']));
  });

  it('builds the legend from the selected row as well', () => {
    const ctx = context([rangedEdges()], { selectedTime: T0 });

    expect(relationsChartModule.buildLegendItems(ctx, []).map((item) => item.label)).toEqual(['gateway', 'api', 'db']);
  });
});
