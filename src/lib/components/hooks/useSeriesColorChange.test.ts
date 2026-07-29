import { type FieldConfigSource } from '@grafana/data';
import { renderHook } from '@testing-library/react';
import { useSeriesColorChange } from './useSeriesColorChange';

const emptyConfig: FieldConfigSource = { defaults: {}, overrides: [] };

describe('useSeriesColorChange', () => {
  it('persists the pick as a byName fixed-color override', () => {
    const onFieldConfigChange = jest.fn();
    const { result } = renderHook(() => useSeriesColorChange(emptyConfig, onFieldConfigChange));

    result.current('cpu', 'red');

    // Grafana re-applies the override to `data.series`, which is what makes the
    // chart re-render in the picked color rather than us mutating series state.
    expect(onFieldConfigChange).toHaveBeenCalledWith({
      defaults: {},
      overrides: [
        {
          matcher: { id: 'byName', options: 'cpu' },
          properties: [{ id: 'color', value: { mode: 'fixed', fixedColor: 'red' } }],
        },
      ],
    });
  });

  it('keeps existing overrides for other series', () => {
    const config: FieldConfigSource = {
      defaults: {},
      overrides: [
        {
          matcher: { id: 'byName', options: 'memory' },
          properties: [{ id: 'color', value: { mode: 'fixed', fixedColor: 'blue' } }],
        },
      ],
    };
    const onFieldConfigChange = jest.fn<void, [FieldConfigSource]>();
    const { result } = renderHook(() => useSeriesColorChange(config, onFieldConfigChange));

    result.current('cpu', 'red');

    const next = onFieldConfigChange.mock.calls[0][0];
    expect(next.overrides).toHaveLength(2);
  });

  it('is stable while the field config and handler are unchanged', () => {
    const onFieldConfigChange = jest.fn();
    const { result, rerender } = renderHook(() => useSeriesColorChange(emptyConfig, onFieldConfigChange));
    const first = result.current;

    rerender();

    // The handler goes into the legend's PanelContext value; a new identity each
    // render would re-render the whole legend.
    expect(result.current).toBe(first);
  });
});
