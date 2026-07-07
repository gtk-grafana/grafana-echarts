import { init } from 'echarts';
import { type ECBasicOption } from 'echarts/types/dist/shared';
import { type CanvasRenderingContext2DEvent } from 'jest-canvas-mock';

/** Canvas dimensions (CSS px) shared by the render helper and the snapshot matcher. */
export interface CanvasSize {
  width: number;
  height: number;
}

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
  gridEvents?: CanvasRenderingContext2DEvent[];
  canvasEvents: CanvasRenderingContext2DEvent[];
  /** Draw calls on the grid/axis layer (default `zlevel` 0 canvas). */
  axisEvents?: CanvasRenderingContext2DEvent[];
  /** Draw calls on the series layer (the dedicated `SERIES_ZLEVEL` canvas). */
  seriesEvents: CanvasRenderingContext2DEvent[];
}

export const SERIES_ZLEVEL = 3;
export const GRID_ZLEVEL = 2;
export const AXIS_ZLEVEL = 1;
// default zLevel
export const CANVAS_ZLEVEL = 0;

// zrender tags each layer canvas with `data-zr-dom-id="zr_<zlevel>.<zlevel2>"`,
export const AXIS_LAYER_SELECTOR = `canvas[data-zr-dom-id^="zr_${AXIS_ZLEVEL}."]`;
export const SERIES_LAYER_SELECTOR = `canvas[data-zr-dom-id^="zr_${SERIES_ZLEVEL}."]`;
// Canvas just means everything else that wasn't split into a dedicated canvas
export const CANVAS_LAYER_SELECTOR = `canvas[data-zr-dom-id^="zr_${CANVAS_ZLEVEL}."]`;
export const GRID_LAYER_SELECTOR = `canvas[data-zr-dom-id^="zr_${GRID_ZLEVEL}."]`;

/** Read the axis (`zr_0`) and series (`SERIES_ZLEVEL`) layer canvases from a root. */
export function readLayeredCanvasEvents(root: ParentNode): LayeredCanvasEvents {
  const axis = root.querySelector<HTMLCanvasElement>(AXIS_LAYER_SELECTOR);
  const series = root.querySelector<HTMLCanvasElement>(SERIES_LAYER_SELECTOR);
  const grid = root.querySelector<HTMLCanvasElement>(GRID_LAYER_SELECTOR);
  // Default zLevel containing everything that doesn't have a specific zLevel override
  const canvas = root.querySelector<HTMLCanvasElement>(CANVAS_LAYER_SELECTOR);

  if(!canvas || !series){
    throw new Error('Canvas and series DOM nodes are required!')
  }

  return {
    canvasEvents: canvas.getContext('2d')!.__getEvents(),
    seriesEvents: series.getContext('2d')!.__getEvents(),
    axisEvents: axis?.getContext('2d')!.__getEvents(),
    gridEvents: grid?.getContext('2d')!.__getEvents(),
  };
}

/**
 * Render an ECharts option into a real chart instance backed by jest-canvas-mock
 * and return the recorded canvas draw calls, split by layer for snapshotting.
 */
export function renderEChartsOptionToCanvasEvents(option: ECBasicOption, size: CanvasSize) {
  const dom = document.createElement('div');
  mockEChartsSize(dom, size);
  document.body.appendChild(dom);

  // https://echarts.apache.org/en/api.html#echarts.init
  const chart = init(dom, undefined, { width: size.width, height: size.height });
  // `notMerge` mirrors Panel render path
  // `animation: false` forces deterministic frame instead of an animated transition.
  chart.setOption(
    {
      ...option,
      //https://echarts.apache.org/en/option.html#animation
      animation: false,
    },
    { notMerge: true }
  );
}

export const removeCanvasClear = (events: CanvasRenderingContext2DEvent[]) => events.filter((e) => e.type !== 'clearRect');

export function clearMockedCanvasEvents(ctx: CanvasRenderingContext2D) {
  ctx.__clearDrawCalls();
  ctx.__clearEvents();
  ctx.__clearPath();
}

export function mockEChartsSize(
  dom: HTMLElement,
  size: CanvasSize
) {
  dom.style.width = `${size.width}px`;
  dom.style.height = `${size.height}px`;
}
