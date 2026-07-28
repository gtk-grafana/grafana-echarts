import { type DataFrame, FieldType, toDataFrame } from '@grafana/data';
import { type CartesianSingleValueSeriesType } from 'editor/types';
import { type PanelOptions } from 'types';
import { LARGE_MODE_THRESHOLD, SAMPLING_MIN_POINTS_PER_SERIES, SYMBOL_VISIBLE_MAX_TOTAL_POINTS } from './constants';
import { getSeriesDensity, getSeriesPerfOptions, resolveAnimation } from './resolvers';

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

/** Density shorthand for the resolver tests. */
const density = (totalPoints: number, maxPointsPerSeries = totalPoints) => ({ totalPoints, maxPointsPerSeries });

describe('getSeriesDensity', () => {
  it('sums total across a wide frame and takes the densest series', () => {
    // 3 value fields x 10 rows = 30 total, 10 per series.
    expect(getSeriesDensity([timeFrame(10, 3)])).toEqual({ totalPoints: 30, maxPointsPerSeries: 10 });
  });

  it('sums total across frames and takes the max per series (multi frame)', () => {
    expect(getSeriesDensity([timeFrame(10, 1), timeFrame(25, 1)])).toEqual({
      totalPoints: 35,
      maxPointsPerSeries: 25,
    });
  });

  it('returns zeros for an empty frame list', () => {
    expect(getSeriesDensity([])).toEqual({ totalPoints: 0, maxPointsPerSeries: 0 });
  });

  it('returns zeros when no frame has a usable X field', () => {
    const frame = toDataFrame({
      fields: [{ name: 'host', type: FieldType.string, values: ['a', 'b'] }],
    });
    expect(getSeriesDensity([frame])).toEqual({ totalPoints: 0, maxPointsPerSeries: 0 });
  });
});

describe('getSeriesPerfOptions', () => {
  describe('line', () => {
    it('keeps symbols and no sampling for a sparse chart (auto)', () => {
      expect(
        getSeriesPerfOptions({ type: 'line', density: density(SYMBOL_VISIBLE_MAX_TOTAL_POINTS), options: options() })
      ).toEqual({ showSymbol: true, sampling: undefined });
    });

    it('hides symbols and enables LTTB for a deep single series (auto)', () => {
      expect(
        getSeriesPerfOptions({
          type: 'line',
          density: density(SYMBOL_VISIBLE_MAX_TOTAL_POINTS + 1),
          options: options(),
        })
      ).toEqual({ showSymbol: false, sampling: 'lttb' });
    });

    // The regression this split fixes: many short series draw just as many
    // markers as one long one, so symbols must go even though no single series is
    // deep enough to be worth sampling.
    it('hides symbols on many short series, without enabling sampling', () => {
      expect(
        getSeriesPerfOptions({
          type: 'line',
          // 1000 series x 100 points: 100,000 markers, but only 100 per series.
          density: { totalPoints: 100_000, maxPointsPerSeries: 100 },
          options: options(),
        })
      ).toEqual({ showSymbol: false, sampling: undefined });
    });

    it('enables sampling only once a single series is deep enough', () => {
      expect(
        getSeriesPerfOptions({
          type: 'line',
          density: { totalPoints: 100_000, maxPointsPerSeries: SAMPLING_MIN_POINTS_PER_SERIES + 1 },
          options: options(),
        })
      ).toEqual({ showSymbol: false, sampling: 'lttb' });
    });

    it('honors Show points = Always on a dense chart (symbols forced on, sampling still applies)', () => {
      expect(
        getSeriesPerfOptions({
          type: 'line',
          density: density(5000),
          options: options({ performance: { showPoints: 'always' } }),
        })
      ).toEqual({ showSymbol: true, sampling: 'lttb' });
    });

    it('honors Show points = Never on a sparse chart', () => {
      expect(
        getSeriesPerfOptions({
          type: 'line',
          density: density(10),
          options: options({ performance: { showPoints: 'never' } }),
        })
      ).toEqual({ showSymbol: false, sampling: undefined });
    });

    it('honors Downsampling = off on a dense chart (no sampling, symbols still hidden)', () => {
      expect(
        getSeriesPerfOptions({
          type: 'line',
          density: density(5000),
          options: options({ performance: { downsampling: false } }),
        })
      ).toEqual({ showSymbol: false, sampling: undefined });
    });
  });

  describe('scatter / bar large mode', () => {
    it.each(['scatter', 'bar'] as CartesianSingleValueSeriesType[])('enables large mode for a dense %s', (type) => {
      expect(getSeriesPerfOptions({ type, density: density(LARGE_MODE_THRESHOLD), options: options() })).toEqual({
        large: true,
        largeThreshold: LARGE_MODE_THRESHOLD,
      });
    });

    it.each(['scatter', 'bar'] as CartesianSingleValueSeriesType[])('leaves a sparse %s untouched', (type) => {
      expect(getSeriesPerfOptions({ type, density: density(LARGE_MODE_THRESHOLD - 1), options: options() })).toEqual(
        {}
      );
    });

    // `large` is per-series because ECharts applies `largeThreshold` per-series;
    // a big total spread thinly must not switch it on.
    it.each(['scatter', 'bar'] as CartesianSingleValueSeriesType[])(
      'does not enable large mode for %s on many short series',
      (type) => {
        expect(
          getSeriesPerfOptions({
            type,
            density: { totalPoints: 100_000, maxPointsPerSeries: 100 },
            options: options(),
          })
        ).toEqual({});
      }
    );
  });

  it('leaves effectScatter untouched (ripple series, not a big-data path)', () => {
    expect(getSeriesPerfOptions({ type: 'effectScatter', density: density(10_000), options: options() })).toEqual({});
  });

  it('leaves heatmap (undefined type) untouched', () => {
    expect(getSeriesPerfOptions({ type: undefined, density: density(10_000), options: options() })).toEqual({});
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

  // `resolveAnimation` takes no density argument at all, which is the point: the
  // signature makes it impossible for frame shape to influence the answer.
  it('takes only options, so chart density cannot influence it', () => {
    expect(resolveAnimation).toHaveLength(1);
    // A frame set well past every per-series/total threshold still animates when
    // the user opted in.
    expect(getSeriesDensity([timeFrame(500, 20)]).totalPoints).toBe(10_000);
    expect(resolveAnimation(options({ animation: { enabled: true } }))).toBe(true);
  });
});
