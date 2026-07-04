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

// jest-canvas-mock installs a recording 2D canvas context (exposing `__getEvents`),
// replacing jsdom's unimplemented getContext. This lets ECharts actually draw in
// tests so canvas snapshot matchers can compare the emitted draw calls.
// https://github.com/hustcc/jest-canvas-mock
require('jest-canvas-mock');

// Register the `toMatchCanvasSnapshot` matcher for canvas style-regression tests.
// https://github.com/grafana/jest-canvas-mock-compare
const { matchers } = require('jest-canvas-mock-compare');
expect.extend(matchers);
