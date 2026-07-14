import { type EChartsType } from 'echarts';
import { type CanvasRenderingContext2DEvent } from 'jest-canvas-mock';
import { getInstanceByDom } from 'lib/echarts/echarts';

/**
 * ECharts draw calls split by the zrender layer that produced them.
 *
 * zrender paints each `zlevel` onto its own `<canvas>` (except in single-canvas
 * mode, which ECharts does not use when initialised on a `<div>`). By forcing
 * the series onto a dedicated `zlevel`, the noisy grid/axis draw calls and the
 * series draw calls land on separate canvases and can be captured independently.
 * https://echarts.apache.org/en/option.html#series-line.zlevel
 */
export interface LayeredCanvasEvents {
  /** Draw calls on the grid/axis layer (default `zlevel` 0 canvas). */
  defaultEvents: CanvasRenderingContext2DEvent[];

  /** Draw calls on the series layer (the dedicated `SERIES_ZLEVEL` canvas). */
  seriesEvents: CanvasRenderingContext2DEvent[];
}

// Default canvas contains everything that wasn't split into a dedicated zlevel
export const DEFAULT_ZLEVEL = 0;
// Dedicated axis layer: setting `zLevel.axis` moves the y-axis (lines, ticks,
// labels, split lines) onto its own canvas so it can be snapshotted in isolation
// from the grid and series, keeping the committed snapshot small.
export const AXIS_ZLEVEL = 2;
export const SERIES_ZLEVEL = 3;

// zrender tags each layer canvas with `data-zr-dom-id="zr_<zlevel>.<zlevel2>"`,
export const SERIES_LAYER_SELECTOR = `canvas[data-zr-dom-id^="zr_${SERIES_ZLEVEL}."]`;
export const DEFAULT_LAYER_SELECTOR = `canvas[data-zr-dom-id^="zr_${DEFAULT_ZLEVEL}."]`;
export const AXIS_LAYER_SELECTOR = `canvas[data-zr-dom-id^="zr_${AXIS_ZLEVEL}."]`;

/** Get the layered canvas events. */
export function readLayeredCanvasEvents(root: ParentNode): LayeredCanvasEvents {
  const seriesCanvas = root.querySelector<HTMLCanvasElement>(SERIES_LAYER_SELECTOR);
  const defaultCanvas = root.querySelector<HTMLCanvasElement>(DEFAULT_LAYER_SELECTOR);

  if (!defaultCanvas || !seriesCanvas) {
    throw new Error('Canvas and series DOM nodes are required!');
  }

  return {
    defaultEvents: defaultCanvas.getContext('2d')!.__getEvents(),
    seriesEvents: seriesCanvas.getContext('2d')!.__getEvents(),
  };
}

/**
 * Draw calls for a single layer, or an empty array when that layer's canvas
 * doesn't exist. zrender only creates a canvas for a zlevel that paints
 * something, so a layer can be absent (e.g. the default layer when the axis is
 * moved to its own zlevel, or the axis layer when every axis is hidden).
 */
export function readCanvasLayer(root: ParentNode, selector: string): CanvasRenderingContext2DEvent[] {
  const canvas = root.querySelector<HTMLCanvasElement>(selector);
  return canvas ? canvas.getContext('2d')!.__getEvents() : [];
}

/** Draw calls on the dedicated axis layer (see `AXIS_ZLEVEL`). */
export function readAxisCanvasEvents(root: ParentNode): CanvasRenderingContext2DEvent[] {
  return readCanvasLayer(root, AXIS_LAYER_SELECTOR);
}

/**
 * Resolve the ECharts instance for a rendered panel without asserting any layer
 * canvases exist (unlike `setupECharts`), so callers can read layers tolerantly.
 */
export function getChart(container: HTMLElement): { chartInstanceDom: HTMLDivElement; chart: EChartsType | undefined } {
  const chartInstanceDom = container.querySelector<HTMLDivElement>('[_echarts_instance_]') as HTMLDivElement;
  const chart = getInstanceByDom(chartInstanceDom) as EChartsType | undefined;
  expect(chart).toBeDefined();
  return { chartInstanceDom, chart };
}

/**
 * Handles getting the canvases split by zLevel from the rendered DOM
 */
export const setupECharts = (container: HTMLElement) => {
  // get the echarts DOM instance
  const chartInstanceDom = container.querySelector<HTMLDivElement>('[_echarts_instance_]') as HTMLDivElement;
  const seriesDom = container.querySelector<HTMLCanvasElement>(SERIES_LAYER_SELECTOR) as HTMLCanvasElement;
  const canvasDom = container.querySelector<HTMLCanvasElement>(DEFAULT_LAYER_SELECTOR) as HTMLCanvasElement;
  expect(seriesDom).not.toBeNull();
  expect(canvasDom).not.toBeNull();

  // get chart object
  const chart = getInstanceByDom(chartInstanceDom) as EChartsType | undefined;
  expect(chart).toBeDefined();

  // get context 2d
  const seriesCtx = seriesDom.getContext('2d') as CanvasRenderingContext2D;
  const canvasCtx = canvasDom.getContext('2d') as CanvasRenderingContext2D;

  expect(seriesCtx).toBeDefined();
  expect(canvasCtx).toBeDefined();

  return { chartInstanceDom, chart };
};

export const removeCanvasClear = (events: CanvasRenderingContext2DEvent[]) =>
  events.filter((e) => e.type !== 'clearRect');

export function clearMockedCanvasEvents(ctx: CanvasRenderingContext2D) {
  ctx.__clearDrawCalls();
  ctx.__clearEvents();
  ctx.__clearPath();
}
