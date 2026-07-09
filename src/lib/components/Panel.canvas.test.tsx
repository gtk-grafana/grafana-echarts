import {
  applyFieldOverrides,
  createTheme,
  type DataFrame,
  dateTime,
  EventBusSrv,
  FieldColorModeId,
  FieldType,
  LoadingState,
  type PanelData,
  type PanelProps,
  type TimeRange,
  toDataFrame,
} from '@grafana/data';
import { LegendDisplayMode, TooltipDisplayMode } from '@grafana/schema';
import { render, waitFor } from '@testing-library/react';
import { type EChartsType } from 'echarts';
import { cartesianTimeSeriesTypes, seriesTypePath } from 'editor/constants';
import { type SeriesType } from 'editor/types';
import { removeCanvasTransforms } from 'jest-canvas-mock-compare';
import React from 'react';
import { readLayeredCanvasEvents, removeCanvasClear, SERIES_ZLEVEL, setupECharts } from 'test/canvas';
import { type PanelLegendOptions, type PanelOptions } from 'types';
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

const theme = createTheme();

const defaultTimeRange: TimeRange = {
  from: dateTime(1783137094497),
  to: dateTime(1783147894497),
  raw: { from: 'now-3h', to: 'now' },
};

// Set the color palette. Note you can't set defaults in `applyFieldOverrides` and expect it to do its job in tests,
// `applyFieldOverrides` copies defaults onto fields via the standard field-config registry.
// Since grafana doesn't expose any way to mock the registry in plugins we're left with manually doing the work of applyFieldOverrides without any of the benefit
// @todo create an issue for core Grafana to support registry mocking
const applyGrafanaFieldDefaults = (frames: DataFrame[]): DataFrame[] =>
  applyFieldOverrides({
    data: frames.map((frame) => ({
      ...frame,
      fields: frame.fields.map((field) => ({
        ...field,
        config: {
          ...field.config,
          color: field.config.color ?? { mode: FieldColorModeId.PaletteClassic },
        },
      })),
    })),
    fieldConfig: { defaults: {}, overrides: [] },
    replaceVariables: (value) => value,
    theme,
    timeZone: 'utc',
  });

/**
 * Returns the Panel component with overrideable default props
 */
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
    } as PanelLegendOptions,
    tooltip: { mode: TooltipDisplayMode.Single },
  };

  const options: PanelOptions = {
    [seriesTypePath]: seriesType,
    ...defaultOptions,
    ...panelOptionsOverrides,
  };

  const data: PanelData = {
    state: LoadingState.Done,
    series: applyGrafanaFieldDefaults(frames),
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

/**
 * Waits for the chart 'finished' event after render and animations are complete.
 */
const waitForFinished = async (chart: EChartsType | undefined) => {
  let finished = false;

  chart!.on('finished', () => {
    finished = true;
  });

  await waitFor(() => expect(finished).toBeTruthy());
};

const getCanvasEvents = async (container: HTMLElement) => {
  const { chartInstanceDom, chart } = setupECharts(container);
  await waitForFinished(chart);
  const { defaultEvents, seriesEvents } = readLayeredCanvasEvents(chartInstanceDom);
  return { defaultEvents, seriesEvents };
};
describe('Panel canvas renders', () => {
  describe('cartesian', () => {
    const frame = toDataFrame({
      fields: [
        { name: 'time', type: FieldType.time, values: [1783137094497, 1783140694497, 1783144294497, 1783147894497] },
        { name: 'cpu', type: FieldType.number, values: [10, 20, 30, 10], config: { displayName: 'cpu' } },
      ],
    });

    describe('renders default', () => {
      it.each(cartesianTimeSeriesTypes)('%s series', async (seriesType) => {
        const { container } = render(
          getComponent([frame], seriesType, {
            zLevel: { series: SERIES_ZLEVEL },
            animation: { enabled: false },
          })
        );
        const { defaultEvents, seriesEvents } = await getCanvasEvents(container);

        expect(removeCanvasTransforms(removeCanvasClear(seriesEvents))).toMatchCanvasSnapshot(defaultEvents, {
          width,
          height,
        });
      });
      it('grid', async () => {
        const { container } = render(
          getComponent([frame], 'line', {
            zLevel: { series: SERIES_ZLEVEL },
            animation: { enabled: false },
          })
        );

        const { defaultEvents, seriesEvents } = await getCanvasEvents(container);

        expect(removeCanvasTransforms(removeCanvasClear(defaultEvents))).toMatchCanvasSnapshot(seriesEvents, {
          width,
          height,
        });
      });
    });

    describe('bar', () => {
      const frame = toDataFrame({
        fields: [
          { name: 'category', type: FieldType.string, values: ['Sales', 'Admin', 'IT'] },
          { name: 'Budget', type: FieldType.number, values: [43, 10, 30], config: { displayName: 'Budget' } },
          { name: 'Actual', type: FieldType.number, values: [50, 14, 28], config: { displayName: 'Actual' } },
        ],
      });
      it('stacking', async () => {
        const { container } = render(
          getComponent([frame], 'bar', {
            stackSeries: true,
            zLevel: { series: SERIES_ZLEVEL },
            animation: { enabled: false },
          })
        );

        const { defaultEvents, seriesEvents } = await getCanvasEvents(container);

        expect(removeCanvasTransforms(removeCanvasClear(seriesEvents))).toMatchCanvasSnapshot(defaultEvents, {
          width,
          height,
        });
      });
    });

    describe('candlestick', () => {
      // OHLC frame: fields resolved by name convention into [open, close, low, high].
      const frame = toDataFrame({
        name: 'BTC',
        fields: [
          { name: 'time', type: FieldType.time, values: [1783137094497, 1783140694497, 1783144294497, 1783147894497] },
          { name: 'open', type: FieldType.number, values: [10, 18, 22, 15] },
          { name: 'high', type: FieldType.number, values: [20, 25, 28, 24] },
          { name: 'low', type: FieldType.number, values: [5, 12, 18, 11] },
          { name: 'close', type: FieldType.number, values: [18, 22, 15, 21] },
        ],
      });

      it('renders', async () => {
        const { container } = render(
          getComponent([frame], 'candlestick', {
            zLevel: { series: SERIES_ZLEVEL },
            animation: { enabled: false },
          })
        );

        const { defaultEvents, seriesEvents } = await getCanvasEvents(container);

        expect(removeCanvasTransforms(removeCanvasClear(seriesEvents))).toMatchCanvasSnapshot(defaultEvents, {
          width,
          height,
        });
      });
    });

    describe('boxplot', () => {
      // Five aligned numeric fields over a category axis: [min, Q1, median, Q3, max].
      const frame = toDataFrame({
        name: 'latency',
        fields: [
          { name: 'category', type: FieldType.string, values: ['Sales', 'Admin', 'IT'] },
          { name: 'min', type: FieldType.number, values: [1, 2, 3] },
          { name: 'q1', type: FieldType.number, values: [3, 4, 5] },
          { name: 'median', type: FieldType.number, values: [5, 6, 7] },
          { name: 'q3', type: FieldType.number, values: [7, 8, 9] },
          { name: 'max', type: FieldType.number, values: [9, 10, 11] },
        ],
      });

      it('renders', async () => {
        const { container } = render(
          getComponent([frame], 'boxplot', {
            zLevel: { series: SERIES_ZLEVEL },
            animation: { enabled: false },
          })
        );

        const { defaultEvents, seriesEvents } = await getCanvasEvents(container);

        expect(removeCanvasTransforms(removeCanvasClear(seriesEvents))).toMatchCanvasSnapshot(defaultEvents, {
          width,
          height,
        });
      });
    });
  });
});
