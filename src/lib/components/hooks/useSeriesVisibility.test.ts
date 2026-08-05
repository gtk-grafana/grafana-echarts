import { type FieldConfigSource } from '@grafana/data';
import { SeriesVisibilityChangeMode, type VizLegendItem } from '@grafana/ui';
import { renderHook } from '@testing-library/react';
import { toggleSeriesVisibilityConfig } from 'lib/grafana/fields/seriesConfig';
import { useSeriesVisibility } from './useSeriesVisibility';

// The override maths is covered by `seriesConfig.test.ts`; these tests are about
// what this hook adds — the series-name list and the `replace` flag.
jest.mock('lib/grafana/fields/seriesConfig', () => ({
  toggleSeriesVisibilityConfig: jest.fn(() => ({ toggled: true })),
}));
const toggleConfig = jest.mocked(toggleSeriesVisibilityConfig);

const emptyConfig: FieldConfigSource = { defaults: {}, overrides: [] };
const items = [
  { label: 'CPU', fieldName: 'cpu_seconds', color: 'red', yAxis: 1 },
  // Slice/dimension items have no backing field, so the label is the name.
  { label: 'Idle', color: 'blue', yAxis: 1 },
] as VizLegendItem[];

describe('useSeriesVisibility', () => {
  beforeEach(() => {
    toggleConfig.mockClear();
  });

  it('replaces rather than merges the field config', () => {
    const onFieldConfigChange = jest.fn();
    const { result } = renderHook(() => useSeriesVisibility(emptyConfig, onFieldConfigChange, items));

    result.current('CPU', SeriesVisibilityChangeMode.ToggleSelection);

    // Without `replace: true` the update is deep-merged and an emptied
    // `overrides` array contributes nothing, so un-toggles would never land.
    expect(onFieldConfigChange).toHaveBeenCalledWith({ toggled: true }, true);
  });

  it('passes the full legend series names so isolate/append can resolve', () => {
    const { result } = renderHook(() => useSeriesVisibility(emptyConfig, jest.fn(), items));

    result.current('CPU', SeriesVisibilityChangeMode.AppendToSelection);

    // A field-backed item contributes its `fieldName`, an item without one its label.
    expect(toggleConfig).toHaveBeenCalledWith(emptyConfig, 'CPU', SeriesVisibilityChangeMode.AppendToSelection, [
      'cpu_seconds',
      'Idle',
    ]);
  });

  /**
   * The override is an *exclude* matcher, so any field left out of the kept list is
   * hidden — including fields the legend never drew a row for. A family that has such
   * fields (relations edges) supplies the wider universe itself.
   */
  it('prefers an explicit override universe over the legend rows', () => {
    const { result } = renderHook(() =>
      useSeriesVisibility(emptyConfig, jest.fn(), items, ['cpu_seconds', 'Idle', 'a-->b'])
    );

    result.current('CPU', SeriesVisibilityChangeMode.AppendToSelection);

    expect(toggleConfig.mock.calls[0][3]).toEqual(['cpu_seconds', 'Idle', 'a-->b']);
  });

  it('forwards a multi-label and a null selection unchanged', () => {
    const { result } = renderHook(() => useSeriesVisibility(emptyConfig, jest.fn(), items));

    result.current(['CPU', 'Idle'], SeriesVisibilityChangeMode.ToggleSelection);
    expect(toggleConfig.mock.calls[0][1]).toEqual(['CPU', 'Idle']);

    // `null` is core's "clear the selection" signal.
    result.current(null, SeriesVisibilityChangeMode.ToggleSelection);
    expect(toggleConfig.mock.calls[1][1]).toBeNull();
  });

  it('is stable while the config, handler and items are unchanged', () => {
    const onFieldConfigChange = jest.fn();
    const { result, rerender } = renderHook(() => useSeriesVisibility(emptyConfig, onFieldConfigChange, items));
    const first = result.current;

    rerender();

    expect(result.current).toBe(first);
  });
});
