import { type DataFrame, FieldType, toDataFrame } from '@grafana/data';
import { type CartesianSingleValueSeriesType } from 'editor/types';
import { type PanelOptions } from 'types';
import { LARGE_MODE_THRESHOLD, SYMBOL_VISIBLE_MAX_POINTS } from './constants';
import { getMaxPointsPerSeries, getSeriesPerfOptions, resolveAnimation } from './resolvers';

const options = (extra?: Partial<PanelOptions>): PanelOptions => ({ ...extra }) as PanelOptions;

/** A wide time frame with `valueFields` numeric columns of `points` rows each. */
const timeFrame = (points: number, valueFields = 1): DataFrame =>
  toDataFrame({
    fields: [
      { name: 'time', type: FieldType.time, values: Array.from({ length: points }, (_, i) => i) },
      ...Array.from({ length: valueFields }, (_, f) => ({
        name: `v${f}`,
        type: FieldType.number,
        values: Array.from({ length: points }, (_, i) => i + f),
      })),
    ],
  });

describe('getMaxPointsPerSeries', () => {
  it('takes the densest series in a wide frame', () => {
    expect(getMaxPointsPerSeries([timeFrame(10, 3)])).toBe(10);
  });

  it('takes the max across frames (multi frame)', () => {
    expect(getMaxPointsPerSeries([timeFrame(10, 1), timeFrame(25, 1)])).toBe(25);
  });

  it('returns zero for an empty frame list', () => {
    expect(getMaxPointsPerSeries([])).toBe(0);
  });

  it('returns zero when no frame has a usable X field', () => {
    const frame = toDataFrame({
      fields: [{ name: 'host', type: FieldType.string, values: ['a', 'b'] }],
    });
    expect(getMaxPointsPerSeries([frame])).toBe(0);
  });
});

describe('getSeriesPerfOptions', () => {
  describe('line', () => {
    it('keeps symbols and no sampling for a sparse series (auto)', () => {
      expect(getSeriesPerfOptions({ type: 'line', maxPoints: SYMBOL_VISIBLE_MAX_POINTS, options: options() })).toEqual({
        showSymbol: true,
        sampling: undefined,
      });
    });

    it('hides symbols and enables LTTB for a dense series (auto)', () => {
      expect(
        getSeriesPerfOptions({ type: 'line', maxPoints: SYMBOL_VISIBLE_MAX_POINTS + 1, options: options() })
      ).toEqual({ showSymbol: false, sampling: 'lttb' });
    });

    it('honors Show points = Always on a dense series (symbols forced on, sampling still applies)', () => {
      expect(
        getSeriesPerfOptions({
          type: 'line',
          maxPoints: 5000,
          options: options({ performance: { showPoints: 'always' } }),
        })
      ).toEqual({ showSymbol: true, sampling: 'lttb' });
    });

    it('honors Show points = Never on a sparse series', () => {
      expect(
        getSeriesPerfOptions({
          type: 'line',
          maxPoints: 10,
          options: options({ performance: { showPoints: 'never' } }),
        })
      ).toEqual({ showSymbol: false, sampling: undefined });
    });

    it('honors Downsampling = off on a dense series (no sampling, symbols still hidden)', () => {
      expect(
        getSeriesPerfOptions({
          type: 'line',
          maxPoints: 5000,
          options: options({ performance: { downsampling: false } }),
        })
      ).toEqual({ showSymbol: false, sampling: undefined });
    });
  });

  describe('scatter / bar large mode', () => {
    it.each(['scatter', 'bar'] as CartesianSingleValueSeriesType[])('enables large mode for a dense %s', (type) => {
      expect(getSeriesPerfOptions({ type, maxPoints: LARGE_MODE_THRESHOLD, options: options() })).toEqual({
        large: true,
        largeThreshold: LARGE_MODE_THRESHOLD,
      });
    });

    it.each(['scatter', 'bar'] as CartesianSingleValueSeriesType[])('leaves a sparse %s untouched', (type) => {
      expect(getSeriesPerfOptions({ type, maxPoints: LARGE_MODE_THRESHOLD - 1, options: options() })).toEqual({});
    });
  });

  it('leaves effectScatter untouched (ripple series, not a big-data path)', () => {
    expect(getSeriesPerfOptions({ type: 'effectScatter', maxPoints: 10_000, options: options() })).toEqual({});
  });

  it('leaves heatmap (undefined type) untouched', () => {
    expect(getSeriesPerfOptions({ type: undefined, maxPoints: 10_000, options: options() })).toEqual({});
  });
});

// Animation is a plain opt-in, off unless asked for, and takes no frame stats:
// density thresholds were tried and could not fire before the render that needed
// them. See `resolveAnimation`.
describe('resolveAnimation', () => {
  it('is off when unset', () => {
    expect(resolveAnimation(options())).toBe(false);
  });

  it('is off when the animation object is present but empty', () => {
    // A persisted panel can carry `animation: {}`; it must not read as enabled.
    expect(resolveAnimation(options({ animation: {} as PanelOptions['animation'] }))).toBe(false);
  });

  it('is on when explicitly enabled', () => {
    expect(resolveAnimation(options({ animation: { enabled: true } }))).toBe(true);
  });

  it('is off when explicitly disabled', () => {
    expect(resolveAnimation(options({ animation: { enabled: false } }))).toBe(false);
  });

  // Density no longer influences the answer, so a huge frame set changes nothing.
  it('ignores chart density entirely', () => {
    const dense = options({ animation: { enabled: true } });
    expect(resolveAnimation(dense)).toBe(true);
    expect(getMaxPointsPerSeries([timeFrame(100_000, 200)])).toBe(100_000);
    expect(resolveAnimation(dense)).toBe(true);
  });
});
