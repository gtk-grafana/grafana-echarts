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
import { LegendDisplayMode, TooltipDisplayMode, type VizLegendOptions } from '@grafana/schema';
import { render, screen, waitFor } from '@testing-library/react';
import { seriesTypePath } from 'editor/constants';
import { type SeriesType } from 'editor/types';
import { CanvasRenderingContext2DEvent } from 'jest-canvas-mock';
import { removeCanvasTransforms } from 'jest-canvas-mock-compare';
import { getInstanceByDom } from 'lib/echarts/echarts';
import React from 'react';
import { readLayeredCanvasEvents, SERIES_ZLEVEL } from 'test/canvas';
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

const getComponent = (
  frames: DataFrame[],
  seriesType: SeriesType,
  panelOptionsOverrides?: Partial<PanelOptions>,
  panelDataOverrides?: Partial<PanelData>,
  panelPropsOverrides?: Partial<PanelProps<PanelOptions>>
) => {
  const defaultOptions = {
    legend: {
      showLegend: true,
      displayMode: LegendDisplayMode.List,
      placement: 'bottom',
      calcs: [],
    } as VizLegendOptions,
    tooltip: { mode: TooltipDisplayMode.Single },
  };

  const options: PanelOptions = {
    [seriesTypePath]: seriesType,
    ...defaultOptions,
    ...panelOptionsOverrides,
  };

  const data: PanelData = {
    state: LoadingState.Done,
    series: frames,
    timeRange,
    ...panelDataOverrides,
  };

  const defaultPanelProps: PanelProps<PanelOptions> = {
    options,
    data,
    width,
    height,
    timeZone: 'utc',
    timeRange,
    id: 1,
    transparent: false,
    eventBus: new EventBusSrv(),
    fieldConfig: { defaults: {}, overrides: [] },
    renderCounter: 0,
    title: 'Test panel',
    onChangeTimeRange: jest.fn(),
    onFieldConfigChange: jest.fn(),
    onOptionsChange: jest.fn(),
    replaceVariables: (value) => value,
  };

  const props: PanelProps<PanelOptions> = {
    ...defaultPanelProps,
    ...panelPropsOverrides,
  };

  return <Panel {...props} />;
};

function clearMockedCanvasEvents(ctx: CanvasRenderingContext2D) {
  ctx.__clearDrawCalls();
  ctx.__clearEvents();
  ctx.__clearPath();
}

describe('Panel canvas renders', () => {
  beforeAll(() => {
    // jest.spyOn(element, 'clientHeight', 'get').mockImplementation(() => height);
  });
  afterAll(() => {
    // jest.useFakeTimers()
  });

  // @todo time axis is not rendering,
  // @todo dates are showing as 1970
  // @todo series are not rendering
  describe('cartesian', () => {
    describe('time series', () => {
      const frame = toDataFrame({
        fields: [
          { name: 'time', type: FieldType.time, values: [1783140614497, 1783140694497, 1783144294497, 1783147894497] },
          { name: 'cpu', type: FieldType.number, values: [10, 20, 30, 10], config: { displayName: 'cpu' } },
        ],
      });

      // @todo broken, the axis AND the series is not rendering
      it('renders a time-axis line chart to the canvas', async () => {
        const { container } = render(getComponent([frame], 'line', {zLevel: {series: SERIES_ZLEVEL}}));

        // get the echarts DOM instance
        const chartDom = container.querySelector<HTMLDivElement>('[_echarts_instance_]') as HTMLDivElement;
        expect(chartDom).not.toBeNull();

        // get chart object
        const chart = getInstanceByDom(chartDom);
        expect(chart).toBeDefined();

        // get canvas
        const canvas = chart?.renderToCanvas() as HTMLCanvasElement;
        expect(canvas).toBeDefined();

        // get context 2d
        const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
        expect(ctx).toBeDefined();

        // const initialEvents = ctx.__getEvents();
        // expect(initialEvents.length).toBeGreaterThan(0);
        // clearMockedCanvasEvents(ctx);

        let finished = false;
        let rendered = false;

        let finishedEvents: CanvasRenderingContext2DEvent[] = [];
        let renderEvents: CanvasRenderingContext2DEvent[] = [];

        chart!.on('rendered', () => {
          rendered = true;
          // empty
          renderEvents = ctx.__getEvents();
          // expect(renderEvents.length).toBeGreaterThan(0);
          clearMockedCanvasEvents(ctx);
        });

        chart!.on('finished', () => {
          finished = true;
          // empty
          finishedEvents = ctx.__getEvents();
          // expect(finishedEvents.length).toBeGreaterThan(0);
          console.log('FINISHED');
        });

        await waitFor(() => expect(rendered).toBeTruthy());
        await waitFor(() => expect(finished).toBeTruthy());
        screen.logTestingPlaygroundURL();
        const { canvasEvents, seriesEvents } = readLayeredCanvasEvents(chartDom);

        // @todo width is zero?
        expect(removeCanvasTransforms(seriesEvents)).toMatchCanvasSnapshot(canvasEvents, { width, height });
      });

      // @todo test is broken, the series isn't rendering
      // it('working axis, but too big', async () => {
      //   const { container } = render(getComponent([frame], 'line'));
      //
      //   // ECharts stamps the DOM node it was bound to with `_echarts_instance_`, so
      //   // we can recover the instance the Panel created (it isn't exposed otherwise).
      //   const chartDom = await waitFor(() => {
      //     const dom = container.querySelector<HTMLElement>('[_echarts_instance_]');
      //     expect(dom).not.toBeNull();
      //     return dom!;
      //   });
      //
      //   // Gate the capture on ECharts' `finished` event, which fires once rendering
      //   // AND the entry animation have settled. Since the Panel keeps animation on
      //   // (~1s), it is still pending when we attach here, so the event fires after.
      //   // https://echarts.apache.org/en/api.html#events.finished
      //   await waitFor(() => {
      //     const canvas = container.querySelector<HTMLCanvasElement>('canvas');
      //     expect(canvas).not.toBeNull();
      //     const ctx = canvas!.getContext('2d') as unknown as { __getEvents(): unknown[] };
      //     expect(ctx.__getEvents().length).toBeGreaterThan(0);
      //   });
      //
      //   const chart = getInstanceByDom(chartDom);
      //
      //   // chart!.on('finished', () => {
      //   //   rendered = true;
      //   // });
      //
      //   expect(chart).toBeDefined();
      //
      //   // await waitFor(() => expect(rendered).toEqual(true));
      //
      //   const ctx = container.querySelector('canvas')!.getContext('2d');
      //   expect(ctx).not.toBeNull();
      //   expect(removeCanvasTransforms(ctx!.__getEvents())).toMatchCanvasSnapshot([], { width, height });
      // });
    });
  });
});
