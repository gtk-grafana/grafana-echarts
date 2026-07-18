import {
  applyFieldOverrides,
  createTheme,
  type DataFrame,
  dateTime,
  EventBusSrv,
  FieldColorModeId,
  LoadingState,
  type PanelData,
  type PanelProps,
  type TimeRange,
} from '@grafana/data';
import { LegendDisplayMode, TooltipDisplayMode, type VizLegendOptions, type VizTooltipOptions } from '@grafana/schema';
import { waitFor } from '@testing-library/react';
import { type EChartsType } from 'echarts';
import { seriesTypePath } from 'editor/constants';
import { type SeriesType } from 'editor/types';
import { Panel } from 'lib/components/Panel';
import { type ChartFamily } from 'lib/echarts/charts/autoSeriesType';
import React from 'react';
import {
  DEFAULT_LAYER_SELECTOR,
  getChart,
  readAxisCanvasEvents,
  readCanvasLayer,
  readLayeredCanvasEvents,
  SERIES_LAYER_SELECTOR,
  setupECharts,
} from 'test/canvas';
import { type PanelOptions } from 'types';

// Shared harness for the canvas integration tests: render the real <Panel />
// (React glue + ECharts init + buildPanelChartOption) into a jest-canvas-mock
// canvas and read back the layered draw calls. See `test/canvas.ts` for how the
// series/axis/default layers are split by zlevel.

export const width = 400;
export const height = 300;

export const theme = createTheme();

export const defaultTimeRange: TimeRange = {
  from: dateTime(1783137094497),
  to: dateTime(1783147894497),
  raw: { from: 'now-3h', to: 'now' },
};

// Set the color palette. Note you can't set defaults in `applyFieldOverrides` and expect it to do its job in tests,
// `applyFieldOverrides` copies defaults onto fields via the standard field-config registry.
// Since grafana doesn't expose any way to mock the registry in plugins we're left with manually doing the work of applyFieldOverrides without any of the benefit
// @todo create an issue for core Grafana to support registry mocking
export const applyGrafanaFieldDefaults = (frames: DataFrame[]): DataFrame[] =>
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
export const getComponent = (
  frames: DataFrame[],
  seriesType: SeriesType,
  panelOptionsOverrides?: Partial<PanelOptions>,
  panelDataOverrides?: Partial<PanelData>,
  panelPropsOverrides?: Partial<PanelProps<PanelOptions>>,
  family: ChartFamily = 'cartesian'
) => {
  const defaultOptions = {
    legend: {
      showLegend: true,
      displayMode: LegendDisplayMode.List,
      placement: 'bottom',
      calcs: [],
    } as VizLegendOptions,
    width,
    tooltip: { mode: TooltipDisplayMode.Single } as VizTooltipOptions,
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
      <Panel {...props} family={family} />
    </div>
  );
};

/**
 * Waits for the chart 'finished' event after render and animations are complete.
 */
export const waitForFinished = async (chart: EChartsType | undefined) => {
  let finished = false;

  chart!.on('finished', () => {
    finished = true;
  });

  await waitFor(() => expect(finished).toBeTruthy());
};

/** Render-settled series and default (grid/axis) layer draw calls. */
export const getCanvasEvents = async (container: HTMLElement) => {
  const { chartInstanceDom, chart } = setupECharts(container);
  await waitForFinished(chart);
  const { defaultEvents, seriesEvents } = readLayeredCanvasEvents(chartInstanceDom);
  return { defaultEvents, seriesEvents };
};

/**
 * Render-settled series-layer draw calls, read tolerantly. Axis-less charts
 * (pie, hierarchy) paint nothing on the default grid layer, so zrender never
 * creates that canvas; only the series layer is required. Reads both layers
 * without asserting either exists (unlike `getCanvasEvents`).
 */
export const getSeriesCanvasEvents = async (container: HTMLElement) => {
  const { chartInstanceDom, chart } = getChart(container);
  await waitForFinished(chart);
  const defaultEvents = readCanvasLayer(chartInstanceDom, DEFAULT_LAYER_SELECTOR);
  const seriesEvents = readCanvasLayer(chartInstanceDom, SERIES_LAYER_SELECTOR);
  return { defaultEvents, seriesEvents };
};

/**
 * Render-settled draw calls including the dedicated axis layer. Requires the
 * panel to be rendered with `zLevel.axis` set (see `AXIS_ZLEVEL`).
 */
export const getAxisCanvasEvents = async (container: HTMLElement) => {
  // The axis is on its own zlevel, which can leave the default (grid) layer with
  // nothing to paint, so read layers tolerantly instead of asserting each canvas.
  const { chartInstanceDom, chart } = getChart(container);
  await waitForFinished(chart);
  const defaultEvents = readCanvasLayer(chartInstanceDom, DEFAULT_LAYER_SELECTOR);
  const seriesEvents = readCanvasLayer(chartInstanceDom, SERIES_LAYER_SELECTOR);
  const axisEvents = readAxisCanvasEvents(chartInstanceDom);
  return { defaultEvents, seriesEvents, axisEvents };
};
