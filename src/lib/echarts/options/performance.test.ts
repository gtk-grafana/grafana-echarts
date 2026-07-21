import { type DataFrame, FieldType, toDataFrame } from '@grafana/data';
import { type CartesianSingleValueSeriesType } from 'editor/types';
import { type PanelOptions } from 'types';
import {
  ANIMATION_MAX_POINTS,
  ANIMATION_MAX_SERIES,
  getSeriesPerfOptions,
  getSeriesStats,
  LARGE_MODE_THRESHOLD,
  resolveAnimation,
  SYMBOL_VISIBLE_MAX_POINTS,
} from './performance';

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

describe('getSeriesStats', () => {
  it('counts one series per numeric field and the densest series point count (wide frame)', () => {
    expect(getSeriesStats([timeFrame(10, 3)])).toEqual({ seriesCount: 3, maxPoints: 10 });
  });

  it('sums series across frames and takes the max points across them (multi frame)', () => {
    expect(getSeriesStats([timeFrame(10, 1), timeFrame(25, 1)])).toEqual({ seriesCount: 2, maxPoints: 25 });
  });

  it('returns zeros for an empty frame list', () => {
    expect(getSeriesStats([])).toEqual({ seriesCount: 0, maxPoints: 0 });
  });

  it('returns zeros when no frame has a usable X field', () => {
    const frame = toDataFrame({
      fields: [{ name: 'host', type: FieldType.string, values: ['a', 'b'] }],
    });
    expect(getSeriesStats([frame])).toEqual({ seriesCount: 0, maxPoints: 0 });
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

describe('resolveAnimation', () => {
  it('honors an explicit enabled=true even above the thresholds', () => {
    expect(
      resolveAnimation(options({ animation: { enabled: true } }), {
        seriesCount: ANIMATION_MAX_SERIES + 1,
        maxPoints: ANIMATION_MAX_POINTS + 1,
      })
    ).toBe(true);
  });

  it('honors an explicit enabled=false even below the thresholds', () => {
    expect(resolveAnimation(options({ animation: { enabled: false } }), { seriesCount: 1, maxPoints: 1 })).toBe(false);
  });

  it('auto-enables for a small chart when unset', () => {
    expect(resolveAnimation(options(), { seriesCount: ANIMATION_MAX_SERIES, maxPoints: ANIMATION_MAX_POINTS })).toBe(
      true
    );
  });

  it('auto-disables above the series-count threshold', () => {
    expect(resolveAnimation(options(), { seriesCount: ANIMATION_MAX_SERIES + 1, maxPoints: 1 })).toBe(false);
  });

  it('auto-disables above the points-per-series threshold', () => {
    expect(resolveAnimation(options(), { seriesCount: 1, maxPoints: ANIMATION_MAX_POINTS + 1 })).toBe(false);
  });
});
