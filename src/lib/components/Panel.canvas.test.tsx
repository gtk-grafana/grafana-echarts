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
import { captureLayeredCanvasEventsFromChart } from 'test/canvas';
import { type PanelOptions } from 'types';
import { Panel } from './Panel';

// Integration test: render the real <Panel /> (React glue + ECharts init +
// buildPanelChartOption) into a jest-canvas-mock canvas and snapshot the emitted
// draw calls. This exercises the full component path.
//
// Only the series-layer draw calls are committed; the noisier grid/axis layer is
// passed as viewer-only context (local jest-canvas-mock-compare payload, kept out
// of the repo) so the committed snapshot stays small. The layered capture merges
// the series onto their own zlevel and settles with animation off, so the result
// is deterministic. See `test/canvas.ts`.

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

        // Wait for the Panel's initial paint so the chart has rendered its series
        // and axes at least once before we re-capture them split by layer.
        // https://echarts.apache.org/en/api.html#events.rendered
        let rendered = false;
        chart!.on('finished', () => {
          rendered = true;
        });
        await waitFor(() => expect(rendered).toEqual(true));

        const { seriesEvents, axisEvents } = captureLayeredCanvasEventsFromChart(chart!, container);
        expect(removeCanvasTransforms(seriesEvents)).toMatchCanvasSnapshot(axisEvents, { width, height });
      });
    })
  })
});
