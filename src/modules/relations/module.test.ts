import { initPluginTranslations } from '@grafana/i18n';

jest.mock('@grafana/i18n', () => ({
  initPluginTranslations: jest.fn(),
  t: (key: string) => key,
}));

describe('Relations plugin module', () => {
  it('initializes translations with the webpack-selected plugin ID', async () => {
    (globalThis as typeof globalThis & { __PLUGIN_ID__?: string }).__PLUGIN_ID__ = 'grafana-relations-panel';

    await import('./module');

    expect(initPluginTranslations).toHaveBeenCalledWith('grafana-relations-panel');
  });
});
