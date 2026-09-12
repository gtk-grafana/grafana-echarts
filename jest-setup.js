// Jest setup provided by Grafana scaffolding
require('@testing-library/jest-dom');
const { TextEncoder, TextDecoder } = require('util');

Object.assign(global, { TextDecoder, TextEncoder });

// https://jestjs.io/docs/manual-mocks#mocking-methods-which-are-not-implemented-in-jsdom
Object.defineProperty(global, 'matchMedia', {
  writable: true,
  value: (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(), // deprecated
    removeListener: jest.fn(), // deprecated
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  }),
});

// jsdom has no layout engine, so `clientWidth`/`clientHeight` are always 0. ECharts'
// `init()` reads only those two props to size the container and, when they're 0, both
// warns ("Can't get DOM width or height...") and performs its first paint at 0x0.
// Derive them from the element's inline pixel size (the Panel sets `style.width/height`
// on its chart container) so charts initialize at the intended size. zrender's own
// getSize() already falls back to `style.width`, so this keeps the two paths consistent.
// https://github.com/apache/echarts/blob/master/src/core/echarts.ts (init size check)
for (const dimension of ['Width', 'Height']) {
  Object.defineProperty(HTMLElement.prototype, `client${dimension}`, {
    configurable: true,
    get() {
      return parseInt(this.style[dimension.toLowerCase()], 10) || 0;
    },
  });
}

// jsdom ships no ResizeObserver, so `@grafana/ui`'s `VizLayout` (via react-use's
// `useMeasure`) measures its legend as 0x0 and then refuses to render its
// measure-gated children (the chart) at all. Provide a minimal synchronous
// ResizeObserver that reports the element's inline-style-derived client size
// (see the clientWidth/Height shim above), falling back to a small non-zero box
// so the legend measures a sensible size and the chart mounts.
// https://developer.mozilla.org/en-US/docs/Web/API/ResizeObserver
const FALLBACK_MEASURE_WIDTH = 240;
const FALLBACK_MEASURE_HEIGHT = 40;

global.ResizeObserver = class ResizeObserver {
  constructor(callback) {
    this.callback = callback;
  }

  observe(element) {
    const width = element.clientWidth || FALLBACK_MEASURE_WIDTH;
    const height = element.clientHeight || FALLBACK_MEASURE_HEIGHT;
    this.callback([
      {
        target: element,
        contentRect: { x: 0, y: 0, top: 0, left: 0, right: width, bottom: height, width, height },
      },
    ]);
  }

  unobserve() {}
  disconnect() {}
};

// jest-canvas-mock installs a recording 2D canvas context (exposing `__getEvents`),
// replacing jsdom's unimplemented getContext. This lets ECharts actually draw in
// tests so canvas snapshot matchers can compare the emitted draw calls.
// https://github.com/hustcc/jest-canvas-mock
require('jest-canvas-mock');

// Register the `toMatchCanvasSnapshot` matcher for canvas style-regression tests.
// https://github.com/grafana/jest-canvas-mock-compare
const { matchers } = require('jest-canvas-mock-compare');
expect.extend(matchers);

// jest-canvas-mock answers every `measureText` with `width = text.length` — one pixel per
// character, whatever the font. zrender measures *everything* through that call, including
// its line height: `getLineHeight()` is the width of `'国'`, so in jsdom a line is 1px tall
// and every multi-line label (a relations node drawn as `name\nvalue`) stacks its lines on
// top of each other instead of 12px apart. Label widths are off by ~6x in the same way, so
// `overflow: 'truncate'`, `hideOverlap`, sankey/chord label gutters and any geometry laid
// out around a text box all behave unlike the browser.
//
// Re-measure with the ratio table zrender itself uses when it renders without a canvas
// (server-side): per-character fractions of the em, measured from a real browser's
// sans-serif, with 1em for anything outside ASCII — which puts `'国'` (and so the line
// height) back at the font size. Deterministic, font-size aware, and close enough to a
// browser that a canvas baseline reads like the picture the panel actually paints.
// https://github.com/ecomfe/zrender/blob/master/src/core/platform.ts (DEFAULT_TEXT_WIDTH_MAP)
const ZRENDER_WIDTH_MAP =
  "007LLmW'55;N0500LLLLLLLLLL00NNNLzWW\\\\WQb\\0FWLg\\bWb\\WQ\\WrWWQ000CL5LLFLL0LL**F*gLLLL5F0LF\\FFF5.5N";
const ZRENDER_WIDTH_MAP_OFFSET = 20;
const ZRENDER_WIDTH_MAP_SCALE = 100;
const DEFAULT_FONT_SIZE = 12;

// char -> width as a fraction of the em, for the printable ASCII range the table covers.
const CHAR_EM_WIDTHS = Object.fromEntries(
  Array.from(ZRENDER_WIDTH_MAP, (char, index) => [
    String.fromCharCode(index + 32),
    (char.charCodeAt(0) - ZRENDER_WIDTH_MAP_OFFSET) / ZRENDER_WIDTH_MAP_SCALE,
  ])
);

const fontSizeOf = (font) => {
  const match = /((?:\d+)?\.?\d*)px/.exec(font || '');
  return (match && Number(match[1])) || DEFAULT_FONT_SIZE;
};

const measuredWidth = (text, font) => {
  const fontSize = fontSizeOf(font);
  // Same shortcut zrender takes: a monospace face is one em per character.
  if ((font || '').indexOf('mono') >= 0) {
    return fontSize * text.length;
  }
  let width = 0;
  for (const char of text) {
    const em = CHAR_EM_WIDTHS[char];
    width += em == null ? fontSize : em * fontSize;
  }
  return width;
};

// Only `width` is corrected; the rest of `TextMetrics` (ascents, baselines) stays 0 as
// jest-canvas-mock leaves it, because nothing in the chart stack reads it.
const recordMeasureText = window.CanvasRenderingContext2D.prototype.measureText;
window.CanvasRenderingContext2D.prototype.measureText = function measureText(...args) {
  const metrics = recordMeasureText.apply(this, args);
  metrics.width = measuredWidth(String(args[0] ?? ''), this.font);
  return metrics;
};
