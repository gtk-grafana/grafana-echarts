import { type ECBasicOption } from 'echarts/types/dist/shared';
import { type CanvasRenderingContext2DEvent } from 'jest-canvas-mock';
import { init } from 'lib/echarts/echarts';

/** Canvas dimensions (CSS px) shared by the render helper and the snapshot matcher. */
export interface CanvasSize {
  width: number;
  height: number;
}

/**
 * Render an ECharts option into a real chart instance backed by jest-canvas-mock
 * and return the recorded canvas draw calls for snapshot comparison.
 *
 * jsdom reports a zero-size container, so dimensions are passed to `init` up
 * front (via `opts.width/height`) to give a correct initial layout without the
 * "Can't get DOM width or height" warning. `animation: false` makes the first
 * paint the final frame, so the captured draw calls are deterministic.
 * https://echarts.apache.org/en/api.html#echarts.init
 * https://echarts.apache.org/en/option.html#animation
 */
export function renderEChartsOptionToCanvasEvents(
  option: ECBasicOption,
  size: CanvasSize
): CanvasRenderingContext2DEvent[] {
  const dom = document.createElement('div');
  dom.style.width = `${size.width}px`;
  dom.style.height = `${size.height}px`;
  document.body.appendChild(dom);

  const chart = init(dom, undefined, { width: size.width, height: size.height });
  try {
    // `notMerge` mirrors Panel.tsx's render path; `animation: false` forces a
    // single deterministic frame instead of an animated transition.
    chart.setOption({ ...option, animation: false }, { notMerge: true });

    const canvas = dom.querySelector('canvas');
    if (!canvas) {
      throw new Error('ECharts did not create a canvas element');
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('canvas 2D context unavailable');
    }
    return ctx.__getEvents();
  } finally {
    chart.dispose();
    dom.remove();
  }
}
