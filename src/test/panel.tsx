import {
  createTheme,
  type DataFrame,
  dateTime,
  EventBusSrv,
  type FieldConfigSource,
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
import { applyTestFieldConfig } from 'test/fieldConfig';
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

const emptyFieldConfig: FieldConfigSource = { defaults: {}, overrides: [] };

/**
 * `fieldConfig` (defaults + byName/byType overrides) applied to the frames the same way
 * real Grafana does before the panel renders, so a byName color override lands on the
 * matching field's config and display processor. See `test/fieldConfig.ts` for why the
 * property registry has to be supplied by hand.
 */
export const applyGrafanaFieldDefaults = (
  frames: DataFrame[],
  fieldConfig: FieldConfigSource = emptyFieldConfig
): DataFrame[] => applyTestFieldConfig(frames, fieldConfig, theme);

/**
 * Returns the Panel component with overrideable default props
 */
export const getComponent = (
  frames: DataFrame[],
  seriesType: SeriesType,
  panelOptionsOverrides?: Partial<PanelOptions>,
  panelDataOverrides?: Partial<PanelData>,
  panelPropsOverrides?: Partial<PanelProps<PanelOptions>>,
  family: ChartFamily = 'cartesian',
  // Field config (defaults + byName/byType overrides) applied to the frames and
  // passed to the panel, so overrides (e.g. a byName fixed color) reach the
  // converter exactly as they do in real Grafana.
  fieldConfig: FieldConfigSource = emptyFieldConfig
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
    series: applyGrafanaFieldDefaults(frames, fieldConfig),
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
    fieldConfig,
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

/**
 * Discard everything drawn so far and record exactly one clean repaint.
 *
 * A panel paints at least twice on mount: `useChartOption` draws, then `useChartResize`
 * pushes the box `VizLayout` allocated into `chart.resize(…)`, which re-lays-out and
 * repaints unconditionally. Charts with a deferred view add more — the parallel
 * coordinates view draws under a grid clip path and drops it on a `setTimeout`
 * (ParallelView `createGridClipShape`), and themeRiver does the same with animation on.
 * jest-canvas-mock accumulates draw calls and never resets on `clearRect`, so a capture
 * at the `finished` event holds every one of those paints end to end — two copies of the
 * same picture, or a pre-settle layout alongside the settled one where they disagree.
 *
 * So: drain the deferred repaints, drop what has accumulated, then force one full repaint
 * at the size the chart already reports — passing the instance's own dimensions rather
 * than re-measuring the DOM means the geometry cannot shift — and flush it synchronously.
 *
 * https://echarts.apache.org/en/api.html#echartsInstance.resize
 */
const recordOnePaint = (chartInstanceDom: HTMLElement, chart: EChartsType | undefined) => {
  chart?.getZr().flush();
  for (const canvas of chartInstanceDom.querySelectorAll('canvas')) {
    const ctx = canvas.getContext('2d');
    expect(ctx).not.toBeNull();
    if (ctx === null) {
      throw new Error('Narrow the canvas type');
    }
    ctx.__clearEvents?.();
    ctx.__clearDrawCalls?.();
  }
  chart?.resize({ width: chart.getWidth(), height: chart.getHeight() });
  chart?.getZr().flush();
};

/** One render pass of the series and default (grid/axis) layers. */
export const getCanvasEvents = async (container: HTMLElement) => {
  const { chartInstanceDom, chart } = setupECharts(container);
  await waitForFinished(chart);
  recordOnePaint(chartInstanceDom, chart);
  const { defaultEvents, seriesEvents } = readLayeredCanvasEvents(chartInstanceDom);
  return { defaultEvents, seriesEvents };
};

/**
 * One render pass of the series layer, read tolerantly. Axis-less charts
 * (pie, hierarchy) paint nothing on the default grid layer, so zrender never
 * creates that canvas; only the series layer is required. Reads both layers
 * without asserting either exists (unlike `getCanvasEvents`).
 */
export const getSeriesCanvasEvents = async (container: HTMLElement) => {
  const { chartInstanceDom, chart } = getChart(container);
  await waitForFinished(chart);
  recordOnePaint(chartInstanceDom, chart);
  const defaultEvents = readCanvasLayer(chartInstanceDom, DEFAULT_LAYER_SELECTOR);
  const seriesEvents = readCanvasLayer(chartInstanceDom, SERIES_LAYER_SELECTOR);
  return { defaultEvents, seriesEvents };
};

/**
 * One render pass including the dedicated axis layer. Requires the panel to be
 * rendered with `zLevel.axis` set (see `AXIS_ZLEVEL`).
 */
export const getAxisCanvasEvents = async (container: HTMLElement) => {
  // The axis is on its own zlevel, which can leave the default (grid) layer with
  // nothing to paint, so read layers tolerantly instead of asserting each canvas.
  const { chartInstanceDom, chart } = getChart(container);
  await waitForFinished(chart);
  recordOnePaint(chartInstanceDom, chart);
  const defaultEvents = readCanvasLayer(chartInstanceDom, DEFAULT_LAYER_SELECTOR);
  const seriesEvents = readCanvasLayer(chartInstanceDom, SERIES_LAYER_SELECTOR);
  const axisEvents = readAxisCanvasEvents(chartInstanceDom);
  return { defaultEvents, seriesEvents, axisEvents };
};
