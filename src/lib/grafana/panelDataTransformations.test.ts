import {
  hostSupportsDataTransformations,
  setSystemTransformations,
  type SystemTransformationsSupplier,
} from 'lib/grafana/panelDataTransformations';

const supplier: SystemTransformationsSupplier = () => [];

describe('setDataTransformations', () => {
  it('registers the supplier on a host that supports the API', () => {
    const setter = jest.fn();
    const plugin = { setSystemTransformations: setter };

    expect(setSystemTransformations(plugin, supplier)).toBe(plugin);
    expect(setter).toHaveBeenCalledWith(supplier);
  });

  it('no-ops on a host without the API', () => {
    // `@grafana/data` 13.1.1 and any Grafana built without grafana/grafana#129992.
    // The panel still renders — it just converts at its own frame boundary, where
    // the conversion is downstream of `applyFieldOverrides`.
    const plugin = { setPanelOptions: jest.fn() };

    expect(() => setSystemTransformations(plugin, supplier)).not.toThrow();
    expect(setSystemTransformations(plugin, supplier)).toBe(plugin);
  });

  it('reports host support', () => {
    expect(hostSupportsDataTransformations({ setSystemTransformations: jest.fn() })).toBe(true);
    expect(hostSupportsDataTransformations({})).toBe(false);
    expect(hostSupportsDataTransformations(undefined)).toBe(false);
  });
});
