import {
  type DataFrame,
  dateTime,
  EventBusSrv,
  FieldType,
  LoadingState,
  type PanelData,
  type PanelProps,
  type TimeRange,
  toDataFrame,
} from '@grafana/data';
import { LegendDisplayMode, TooltipDisplayMode } from '@grafana/schema';
import { render, waitFor } from '@testing-library/react';
import { getInstanceByDom } from 'lib/echarts/echarts';
import { seriesTypePath } from 'editor/constants';
import { type SeriesType } from 'editor/types';
import { removeCanvasTransforms } from 'jest-canvas-mock-compare';
import React from 'react';
import { type PanelOptions } from 'types';
import { Panel } from './Panel';

// Integration test: render the real <Panel /> (React glue + ECharts init +
// buildPanelChartOption) into a jest-canvas-mock canvas and snapshot the emitted
// draw calls. This exercises the full component path. The capture is gated on
// ECharts' `finished` event, so it reflects the settled post-animation frame
// (deterministic) rather than a mid-animation one.

const width = 400;
const height = 300;

const timeRange: TimeRange = {
  from: dateTime(0),
  to: dateTime(4),
  raw: { from: 'now-4ms', to: 'now' },
};

const getComponent = (frames: DataFrame[], seriesType: SeriesType) => {
  const options: PanelOptions = {
    [seriesTypePath]: seriesType,
    legend: { showLegend: true, displayMode: LegendDisplayMode.List, placement: 'bottom', calcs: [] },
    tooltip: { mode: TooltipDisplayMode.Single },
  };

  const data: PanelData = {
    state: LoadingState.Done,
    series: frames,
    timeRange,
  };

  const props = {
    options,
    data,
    width,
    height,
    timeZone: 'utc',
    timeRange,
    id: 1,
    eventBus: new EventBusSrv(),
    fieldConfig: { defaults: {}, overrides: [] },
  } as unknown as PanelProps<PanelOptions>;

  return <Panel {...props} />;
};

jest.setTimeout(1000);
describe('Panel canvas renders', () => {
  beforeAll(() => {
    // jest.spyOn(element, 'clientHeight', 'get').mockImplementation(() => height);
  })
  afterAll(() => {
    // jest.useFakeTimers()
  })

  describe('cartesian', () => {
    describe('time series', () => {
      const frame = toDataFrame({
        fields: [
          { name: 'time', type: FieldType.time, values: [1, 2, 3] },
          { name: 'cpu', type: FieldType.number, values: [10, 20, 30], config: { displayName: 'cpu' } },
        ],
      });

      it('renders a time-axis line chart to the canvas', async () => {
        const { container } = render(getComponent([frame], 'line'));

        // ECharts stamps the DOM node it was bound to with `_echarts_instance_`, so
        // we can recover the instance the Panel created (it isn't exposed otherwise).
        const chartDom = await waitFor(() => {
          const dom = container.querySelector<HTMLElement>('[_echarts_instance_]');
          expect(dom).not.toBeNull();
          return dom!;
        });
        const chart = getInstanceByDom(chartDom);
        expect(chart).toBeDefined();

        // Gate the capture on ECharts' `finished` event, which fires once rendering
        // AND the entry animation have settled. Since the Panel keeps animation on
        // (~1s), it is still pending when we attach here, so the event fires after.
        // https://echarts.apache.org/en/api.html#events.finished
        let chartAxisReady = false;
        let rendered = false;
        chart!.on('rendered', () => {
          rendered = true;
        });
        // chart!.on('')

        await waitFor(() => expect(rendered).toEqual(true));

        const ctx = container.querySelector('canvas')!.getContext('2d');
        expect(ctx).not.toBeNull();
        expect(removeCanvasTransforms(ctx!.__getEvents())).toMatchCanvasSnapshot([], { width, height });

      });
    })
  })
});
