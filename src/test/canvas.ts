import { type CanvasRenderingContext2DEvent } from 'jest-canvas-mock';

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
export const SERIES_ZLEVEL = 3;

// zrender tags each layer canvas with `data-zr-dom-id="zr_<zlevel>.<zlevel2>"`,
export const SERIES_LAYER_SELECTOR = `canvas[data-zr-dom-id^="zr_${SERIES_ZLEVEL}."]`;
export const DEFAULT_LAYER_SELECTOR = `canvas[data-zr-dom-id^="zr_${DEFAULT_ZLEVEL}."]`;

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

export const removeCanvasClear = (events: CanvasRenderingContext2DEvent[]) =>
  events.filter((e) => e.type !== 'clearRect');

export function clearMockedCanvasEvents(ctx: CanvasRenderingContext2D) {
  ctx.__clearDrawCalls();
  ctx.__clearEvents();
  ctx.__clearPath();
}
