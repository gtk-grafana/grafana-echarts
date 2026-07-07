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

// jest-canvas-mock installs a recording 2D canvas context (exposing `__getEvents`),
// replacing jsdom's unimplemented getContext. This lets ECharts actually draw in
// tests so canvas snapshot matchers can compare the emitted draw calls.
// https://github.com/hustcc/jest-canvas-mock
require('jest-canvas-mock');

// Register the `toMatchCanvasSnapshot` matcher for canvas style-regression tests.
// https://github.com/grafana/jest-canvas-mock-compare
const { matchers } = require('jest-canvas-mock-compare');
expect.extend(matchers);
