import { type ECBasicOption } from 'echarts/types/dist/shared';
import { type CanvasRenderingContext2DEvent } from 'jest-canvas-mock';
import { type EChartsType, init } from 'lib/echarts/echarts';

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
  /** Draw calls on the grid/axis layer (default `zlevel` 0 canvas). */
  axisEvents: CanvasRenderingContext2DEvent[];
  /** Draw calls on the series layer (the dedicated `SERIES_ZLEVEL` canvas). */
  seriesEvents: CanvasRenderingContext2DEvent[];
}

/** Dedicated `zlevel` the series are lifted onto so they paint to their own canvas. */
export const SERIES_ZLEVEL = 1;

// zrender tags each layer canvas with `data-zr-dom-id="zr_<zlevel>.<zlevel2>"`,
// so a `zr_<zlevel>.`-prefixed selector reliably picks a specific layer.
const AXIS_LAYER_SELECTOR = 'canvas[data-zr-dom-id^="zr_0."]';
const SERIES_LAYER_SELECTOR = `canvas[data-zr-dom-id^="zr_${SERIES_ZLEVEL}."]`;

/** jest-canvas-mock augments the 2D context with an event log we read/reset. */
interface MockCanvasContext {
  __getEvents(): CanvasRenderingContext2DEvent[];
  __clearEvents(): void;
}

const mockContext = (canvas: HTMLCanvasElement): MockCanvasContext =>
  canvas.getContext('2d') as unknown as MockCanvasContext;

/** Wrap each series with the dedicated `zlevel` so it paints to its own canvas. */
const liftSeriesToLayer = (series: unknown): Array<Record<string, unknown>> => {
  const list = Array.isArray(series) ? series : series == null ? [] : [series];
  return list.map((entry) => ({ ...(entry as Record<string, unknown>), zlevel: SERIES_ZLEVEL }));
};

/** Read the axis (`zr_0`) and series (`SERIES_ZLEVEL`) layer canvases from a root. */
export function readLayeredCanvasEvents(root: ParentNode): LayeredCanvasEvents {
  const axis = root.querySelector<HTMLCanvasElement>(AXIS_LAYER_SELECTOR);
  const series = root.querySelector<HTMLCanvasElement>(SERIES_LAYER_SELECTOR);
  if (!axis || !series) {
    throw new Error('expected separate zr_0 (axis) and series-layer canvases; is a series on SERIES_ZLEVEL?');
  }
  // Copy out of the mock's live arrays so a later dispose can't mutate them.
  return { axisEvents: [...mockContext(axis).__getEvents()], seriesEvents: [...mockContext(series).__getEvents()] };
}

/**
 * Render an ECharts option into a real chart instance backed by jest-canvas-mock
 * and return the recorded canvas draw calls, split by layer for snapshotting.
 *
 * jsdom reports a zero-size container, so dimensions are passed to `init` up
 * front (via `opts.width/height`) to give a correct initial layout without the
 * "Can't get DOM width or height" warning. `animation: false` makes the first
 * paint the final frame, so the captured draw calls are deterministic. The
 * series are lifted onto `SERIES_ZLEVEL` so their draw calls are isolated from
 * the grid/axis canvas (see `LayeredCanvasEvents`).
 * https://echarts.apache.org/en/api.html#echarts.init
 * https://echarts.apache.org/en/option.html#animation
 */
export function renderEChartsOptionToCanvasEvents(option: ECBasicOption, size: CanvasSize): LayeredCanvasEvents {
  const dom = document.createElement('div');
  dom.style.width = `${size.width}px`;
  dom.style.height = `${size.height}px`;
  document.body.appendChild(dom);

  const chart = init(dom, undefined, { width: size.width, height: size.height });
  // `notMerge` mirrors Panel.tsx's render path; `animation: false` forces a
  // single deterministic frame instead of an animated transition.
  chart.setOption(
    { ...option, animation: false, series: liftSeriesToLayer((option as { series?: unknown }).series) },
    { notMerge: true }
  );
  return readLayeredCanvasEvents(dom);
}

/**
 * Capture the layered draw calls from an already-rendered chart instance (the
 * integration path, where `<Panel>` owns the option and initial render).
 *
 * The mock's per-canvas event logs are reset first, then the series are merged
 * onto `SERIES_ZLEVEL` with `animation: false` so the resulting single, settled
 * repaint is the only thing recorded — giving clean, deterministic per-layer
 * events without disturbing the component's own render path.
 */
export function captureLayeredCanvasEventsFromChart(chart: EChartsType, root: ParentNode): LayeredCanvasEvents {
  const option = chart.getOption() as { series?: unknown };
  const seriesCount = Array.isArray(option.series) ? option.series.length : option.series == null ? 0 : 1;

  root.querySelectorAll('canvas').forEach((canvas) => mockContext(canvas).__clearEvents());
  chart.setOption({ animation: false, series: Array.from({ length: seriesCount }, () => ({ zlevel: SERIES_ZLEVEL })) });

  return readLayeredCanvasEvents(root);
}
