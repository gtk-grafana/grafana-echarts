// Point webpack async-chunk loading at the app plugin's base URL.
//
// This repo builds one app plugin (`grafana-echarts-app`) that bundles several
// nested panel plugins. Grafana serves each nested panel from its OWN base
// (`public/plugins/<nested-id>/`, mapped to `dist/modules/<family>/`), and the
// scaffolded `grafana-public-path` sets `__webpack_public_path__` to that nested
// dir. But shared split chunks (e.g. the de-duplicated `echarts` chunk) are
// emitted once to the app's dist root, served at `public/plugins/<app-id>/`.
//
// So we rewrite the runtime publicPath from the nested panel's dir to the app's
// dir by swapping the trailing plugin-id segment. This keeps the origin/subpath
// prefix intact (Grafana may run under a sub-path) and lets every nested panel
// load the single shared chunk. Imported for side effect by the shared Panel,
// which only the nested panels bundle. Must run before any dynamic import().
// https://webpack.js.org/guides/public-path/#on-the-fly

// `grafana-echarts-app` (this repo's app plugin id, see src/plugin.json).
const APP_ID = 'grafana-echarts-app';

declare let __webpack_public_path__: string;

if (typeof __webpack_public_path__ === 'string' && __webpack_public_path__.length > 0) {
  // e.g. "http://host/public/plugins/grafana-echartscartesian-panel/"
  //   -> "http://host/public/plugins/grafana-echarts-app/"
  __webpack_public_path__ = __webpack_public_path__.replace(/[^/]+\/$/, `${APP_ID}/`);
}

export {};
