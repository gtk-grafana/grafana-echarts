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

// Cross-platform float determinism for canvas snapshots.
//
// ECharts lays out arc/pie and axis geometry with trig (`Math.sin`/`Math.cos`),
// whose results are only defined to be *close* to the true value: the last
// unit-in-the-last-place can differ between V8 builds and CPU architectures
// (e.g. local Node 24 vs the CI-pinned Node 22). JavaScript then serializes two
// doubles that are 1 ULP apart to different shortest round-trip strings
// (`65.34554082152242` vs `65.34554082152243`), so a raw-float snapshot flakes
// even though the drawing is pixel-identical.
//
// Quantizing every coordinate to a fixed sub-pixel precision collapses that
// noise: 1e-6 px sits ~7 orders of magnitude above the ~1e-13 float noise floor
// yet ~6 orders below a meaningful pixel, so genuine geometry regressions still
// surface while ULP jitter never does.
export const CANVAS_SNAPSHOT_PRECISION = 6;

const ROUND_FACTOR = 10 ** CANVAS_SNAPSHOT_PRECISION;

const roundNumber = (value: number): number => {
  if (!Number.isFinite(value)) {
    return value; // leave NaN / ±Infinity untouched
  }
  const rounded = Math.round(value * ROUND_FACTOR) / ROUND_FACTOR;
  return rounded === 0 ? 0 : rounded; // normalize -0 to +0 for stable serialization
};

const roundDeep = (value: unknown): unknown => {
  if (typeof value === 'number') {
    return roundNumber(value);
  }
  if (Array.isArray(value)) {
    return value.map(roundDeep);
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, roundDeep(inner)]));
  }
  return value;
};

/**
 * Deep-clone `events`, rounding every finite number (coordinates, transform
 * matrix entries, nested `props.path` segments) to {@link CANVAS_SNAPSHOT_PRECISION}
 * decimal places so committed snapshots stay stable across platforms. Strings
 * (colors, gradients) and non-finite values pass through unchanged. The input is
 * never mutated — the same event objects are also handed to the compare viewer
 * as unrounded context.
 */
export const roundCanvasEvents = <T>(events: T): T => roundDeep(events) as T;

export function clearMockedCanvasEvents(ctx: CanvasRenderingContext2D) {
  ctx.__clearDrawCalls();
  ctx.__clearEvents();
  ctx.__clearPath();
}
