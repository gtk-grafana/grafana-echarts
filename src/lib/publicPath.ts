// Point webpack async-chunk loading at the active plugin's base URL.
//
// Default builds share lazy chunks under the app plugin. A standalone build
// keeps them under its panel plugin. Preserve Grafana's origin and subpath.
// https://webpack.js.org/guides/public-path/#on-the-fly

declare const __PLUGIN_ID__: string;
declare let __webpack_public_path__: string;

if (typeof __webpack_public_path__ === 'string' && __webpack_public_path__.length > 0) {
  __webpack_public_path__ = __webpack_public_path__.replace(/[^/]+\/$/, `${__PLUGIN_ID__}/`);
}

export {};
