import { FieldColorModeId, type FieldConfigSource, FieldMatcherID } from '@grafana/data';
import { SeriesVisibilityChangeMode } from '@grafana/ui';
import {
  changeSeriesColorConfig,
  getHiddenSeriesNames,
  getSeriesColorOverride,
  toggleSeriesVisibilityConfig,
} from 'lib/grafana/fields/seriesConfig';

const emptyConfig = (): FieldConfigSource => ({ defaults: {}, overrides: [] });

const names = ['cpu', 'mem', 'disk'];

describe('changeSeriesColorConfig', () => {
  it('adds a byName fixed color override', () => {
    const result = changeSeriesColorConfig(emptyConfig(), 'cpu', '#ff0000');

    expect(result.overrides).toEqual([
      {
        matcher: { id: FieldMatcherID.byName, options: 'cpu' },
        properties: [{ id: 'color', value: { mode: FieldColorModeId.Fixed, fixedColor: '#ff0000' } }],
      },
    ]);
  });

  it('replaces the color on an existing byName override, preserving other properties', () => {
    const config: FieldConfigSource = {
      defaults: {},
      overrides: [
        {
          matcher: { id: FieldMatcherID.byName, options: 'cpu' },
          properties: [
            { id: 'unit', value: 'bytes' },
            { id: 'color', value: { mode: FieldColorModeId.Fixed, fixedColor: '#000000' } },
          ],
        },
      ],
    };

    const result = changeSeriesColorConfig(config, 'cpu', '#00ff00');

    expect(result.overrides).toHaveLength(1);
    expect(result.overrides[0].properties).toEqual([
      { id: 'unit', value: 'bytes' },
      { id: 'color', value: { mode: FieldColorModeId.Fixed, fixedColor: '#00ff00' } },
    ]);
  });
});

describe('getSeriesColorOverride', () => {
  it('returns the fixed color for a name, or undefined', () => {
    const config = changeSeriesColorConfig(emptyConfig(), 'cpu', '#abcdef');

    expect(getSeriesColorOverride(config, 'cpu')).toBe('#abcdef');
    expect(getSeriesColorOverride(config, 'mem')).toBeUndefined();
  });
});

describe('toggleSeriesVisibilityConfig', () => {
  it('isolates the clicked series on plain click (hides the rest)', () => {
    const result = toggleSeriesVisibilityConfig(
      emptyConfig(),
      'cpu',
      SeriesVisibilityChangeMode.ToggleSelection,
      names
    );

    expect(getHiddenSeriesNames(result, names)).toEqual(new Set(['mem', 'disk']));
  });

  it('writes a single hideSeriesFrom byNames-exclude system override (core shape)', () => {
    const result = toggleSeriesVisibilityConfig(
      emptyConfig(),
      'cpu',
      SeriesVisibilityChangeMode.ToggleSelection,
      names
    );

    expect(result.overrides).toEqual([
      {
        __systemRef: 'hideSeriesFrom',
        matcher: {
          id: FieldMatcherID.byNames,
          options: { mode: 'exclude', names: ['cpu'], prefix: 'All except:', readOnly: true },
        },
        properties: [{ id: 'custom.hideFrom', value: { viz: true, legend: false, tooltip: true } }],
      },
    ]);
  });

  it('restores all series when clicking the already-isolated series', () => {
    const isolated = toggleSeriesVisibilityConfig(
      emptyConfig(),
      'cpu',
      SeriesVisibilityChangeMode.ToggleSelection,
      names
    );

    const restored = toggleSeriesVisibilityConfig(isolated, 'cpu', SeriesVisibilityChangeMode.ToggleSelection, names);

    expect(restored.overrides).toEqual([]);
    expect(getHiddenSeriesNames(restored, names)).toEqual(new Set());
  });

  it('re-isolates a different series on plain click (replaces the override)', () => {
    const isolatedCpu = toggleSeriesVisibilityConfig(
      emptyConfig(),
      'cpu',
      SeriesVisibilityChangeMode.ToggleSelection,
      names
    );

    const isolatedMem = toggleSeriesVisibilityConfig(
      isolatedCpu,
      'mem',
      SeriesVisibilityChangeMode.ToggleSelection,
      names
    );

    expect(isolatedMem.overrides).toHaveLength(1);
    expect(getHiddenSeriesNames(isolatedMem, names)).toEqual(new Set(['cpu', 'disk']));
  });

  it('toggles a single series on append (ctrl/cmd click)', () => {
    const hidden = toggleSeriesVisibilityConfig(
      emptyConfig(),
      'mem',
      SeriesVisibilityChangeMode.AppendToSelection,
      names
    );
    expect(getHiddenSeriesNames(hidden, names)).toEqual(new Set(['mem']));

    const shown = toggleSeriesVisibilityConfig(hidden, 'mem', SeriesVisibilityChangeMode.AppendToSelection, names);
    expect(getHiddenSeriesNames(shown, names)).toEqual(new Set());
  });

  it('preserves unrelated color overrides when toggling visibility', () => {
    const withColor = changeSeriesColorConfig(emptyConfig(), 'cpu', '#ff0000');

    const result = toggleSeriesVisibilityConfig(withColor, 'mem', SeriesVisibilityChangeMode.AppendToSelection, names);

    expect(getSeriesColorOverride(result, 'cpu')).toBe('#ff0000');
    expect(getHiddenSeriesNames(result, names)).toEqual(new Set(['mem']));
  });
});
