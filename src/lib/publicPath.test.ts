type WebpackRuntimeGlobals = typeof globalThis & {
  __PLUGIN_ID__?: string;
  __webpack_public_path__?: string;
};

describe('public path', () => {
  it('uses the webpack-selected plugin ID for lazy chunks', async () => {
    const runtimeGlobals = globalThis as WebpackRuntimeGlobals;
    runtimeGlobals.__PLUGIN_ID__ = 'grafana-relations-panel';
    runtimeGlobals.__webpack_public_path__ = 'http://grafana.test/public/plugins/source-panel/';
    jest.resetModules();

    await import('./publicPath');

    expect(runtimeGlobals.__webpack_public_path__).toBe('http://grafana.test/public/plugins/grafana-relations-panel/');
  });
});
