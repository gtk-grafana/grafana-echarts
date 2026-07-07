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
import { render, waitFor } from '@testing-library/react';
import { seriesTypePath } from 'editor/constants';
import { type SeriesType } from 'editor/types';
import { removeCanvasTransforms } from 'jest-canvas-mock-compare';
import { getInstanceByDom } from 'lib/echarts/echarts';
import React from 'react';
import {
  DEFAULT_LAYER_SELECTOR,
  readLayeredCanvasEvents,
  removeCanvasClear,
  SERIES_LAYER_SELECTOR,
  SERIES_ZLEVEL,
} from 'test/canvas';
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

const defaultTimeRange: TimeRange = {
  from: dateTime(1783137094497),
  to: dateTime(1783147894497),
  raw: { from: 'now-3h', to: 'now' },
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
    timeRange: defaultTimeRange,
    ...panelDataOverrides,
  };

  const defaultPanelProps: PanelProps<PanelOptions> = {
    options,
    data,
    width,
    height,
    timeZone: 'utc',
    timeRange: defaultTimeRange,
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

  return (
    <div style={{ height, width }}>
      <Panel {...props} />
    </div>
  );
};

describe('Panel canvas renders', () => {
  describe('cartesian', () => {
    describe('time series', () => {
      const frame = toDataFrame({
        fields: [
          { name: 'time', type: FieldType.time, values: [1783137094497, 1783140694497, 1783144294497, 1783147894497] },
          { name: 'cpu', type: FieldType.number, values: [10, 20, 30, 10], config: { displayName: 'cpu' } },
        ],
      });

      it('renders default line chart', async () => {
        const { container } = render(
          getComponent([frame], 'line', {
            zLevel: { series: SERIES_ZLEVEL },
            animation: { enabled: false },
          })
        );

        // get the echarts DOM instance
        const chartInstanceDom = container.querySelector<HTMLDivElement>('[_echarts_instance_]') as HTMLDivElement;
        const seriesDom = container.querySelector<HTMLCanvasElement>(SERIES_LAYER_SELECTOR) as HTMLCanvasElement;
        const canvasDom = container.querySelector<HTMLCanvasElement>(DEFAULT_LAYER_SELECTOR) as HTMLCanvasElement;
        expect(seriesDom).not.toBeNull();
        expect(canvasDom).not.toBeNull();

        // get chart object
        const chart = getInstanceByDom(chartInstanceDom);
        expect(chart).toBeDefined();

        // get context 2d
        const seriesCtx = seriesDom.getContext('2d') as CanvasRenderingContext2D;
        const canvasCtx = canvasDom.getContext('2d') as CanvasRenderingContext2D;
        expect(seriesCtx).toBeDefined();
        expect(canvasCtx).toBeDefined();

        let finished = false;

        chart!.on('finished', () => {
          finished = true;
        });

        await waitFor(() => expect(finished).toBeTruthy());
        const { defaultEvents, seriesEvents } = readLayeredCanvasEvents(chartInstanceDom);

        expect(removeCanvasTransforms(removeCanvasClear(seriesEvents))).toMatchCanvasSnapshot(defaultEvents, {
          width,
          height,
        });
      });
    });
  });
});
