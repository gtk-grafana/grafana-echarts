import { type DataFrame, FieldType, toDataFrame } from '@grafana/data';
import { type CartesianSingleValueSeriesType } from 'editor/types';
import { type PanelOptions } from 'types';
import { LARGE_MODE_THRESHOLD, SYMBOL_VISIBLE_MAX_TOTAL_POINTS } from './constants';
import { getDensityFromSeriesValues, getSeriesDensity, getSeriesPerfOptions, resolveAnimation } from './resolvers';

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

/**
 * `values` shorthand: a run of `count` contiguous non-null points, i.e. an
 * ordinary series that draws a line. The symbol resolver only inspects adjacency,
 * so the actual numbers are irrelevant.
 */
const contiguous = (count: number) => Array.from({ length: count }, (_, i) => i);

describe('getDensityFromSeriesValues', () => {
  it('sums total and takes the longest series', () => {
    expect(getDensityFromSeriesValues([contiguous(10), contiguous(25)])).toEqual({
      totalPoints: 35,
      maxPointsPerSeries: 25,
    });
  });

  it('returns zeros for no series', () => {
    expect(getDensityFromSeriesValues([])).toEqual({ totalPoints: 0, maxPointsPerSeries: 0 });
  });

  // Nulls occupy a slot on the x axis, so they count toward render cost.
  it('counts null slots, since they still cost a data point', () => {
    expect(getDensityFromSeriesValues([[1, null, 3]])).toEqual({ totalPoints: 3, maxPointsPerSeries: 3 });
  });
});

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
    it('keeps symbols for a sparse chart (auto)', () => {
      expect(
        getSeriesPerfOptions({
          type: 'line',
          density: density(SYMBOL_VISIBLE_MAX_TOTAL_POINTS),
          options: options(),
          values: contiguous(SYMBOL_VISIBLE_MAX_TOTAL_POINTS),
        })
      ).toEqual({ showSymbol: true, sampling: 'lttb' });
    });

    it('hides symbols for a deep single series (auto)', () => {
      expect(
        getSeriesPerfOptions({
          type: 'line',
          density: density(SYMBOL_VISIBLE_MAX_TOTAL_POINTS + 1),
          options: options(),
          values: contiguous(SYMBOL_VISIBLE_MAX_TOTAL_POINTS + 1),
        })
      ).toEqual({ showSymbol: false, sampling: 'lttb' });
    });

    // The regression the total-vs-per-series split fixes: many short series draw
    // just as many markers as one long one, so symbols must go even though no
    // single series is deep.
    it('hides symbols on many short series', () => {
      expect(
        getSeriesPerfOptions({
          type: 'line',
          // 1000 series x 100 points: 100,000 markers, but only 100 per series.
          density: { totalPoints: 100_000, maxPointsPerSeries: 100 },
          options: options(),
          values: contiguous(100),
        })
      ).toEqual({ showSymbol: false, sampling: 'lttb' });
    });

    it('honors Show points = Always on a dense chart (symbols forced on, sampling still applies)', () => {
      expect(
        getSeriesPerfOptions({
          type: 'line',
          density: density(5000),
          options: options({ performance: { showPoints: 'always' } }),
          values: contiguous(5000),
        })
      ).toEqual({ showSymbol: true, sampling: 'lttb' });
    });

    it('honors Show points = Never on a sparse chart', () => {
      expect(
        getSeriesPerfOptions({
          type: 'line',
          density: density(10),
          options: options({ performance: { showPoints: 'never' } }),
          values: contiguous(10),
        })
      ).toEqual({ showSymbol: false, sampling: 'lttb' });
    });

    it('honors Downsampling = off (no sampling, symbols still hidden)', () => {
      expect(
        getSeriesPerfOptions({
          type: 'line',
          density: density(5000),
          options: options({ performance: { downsampling: false } }),
          values: contiguous(5000),
        })
      ).toEqual({ showSymbol: false, sampling: undefined });
    });

    // Symbols are the only thing that renders a series with no line to draw, so
    // the auto lever spares those even on a dense chart. Without this the panel
    // paints nothing at all: no arc per point, and a zero-length path per point
    // covers no pixels. Core Grafana guards the same case via `pointsFilter`.
    describe('series that would render as nothing', () => {
      it('keeps symbols for a single-point series on a dense chart', () => {
        // 200 one-point series (a Prometheus instant query): far past the total,
        // but no series has two points to draw a line between.
        expect(
          getSeriesPerfOptions({
            type: 'line',
            density: { totalPoints: 200, maxPointsPerSeries: 1 },
            options: options(),
            values: [42],
          })
        ).toMatchObject({ showSymbol: true });
      });

      it('keeps symbols when every value is separated by nulls', () => {
        expect(
          getSeriesPerfOptions({
            type: 'line',
            density: density(5000),
            options: options(),
            values: [1, null, 3, null, 5, null],
          })
        ).toMatchObject({ showSymbol: true });
      });

      it('keeps symbols for an all-null series', () => {
        expect(
          getSeriesPerfOptions({
            type: 'line',
            density: density(5000),
            options: options(),
            values: [null, null, null],
          })
        ).toMatchObject({ showSymbol: true });
      });

      it('keeps symbols for an empty series', () => {
        expect(
          getSeriesPerfOptions({ type: 'line', density: density(5000), options: options(), values: [] })
        ).toMatchObject({ showSymbol: true });
      });

      // One adjacent pair anywhere is enough to draw a line, so the fast path
      // still applies — the isolated points elsewhere in the series lose their
      // markers, which is the pre-existing behavior and the limit of what
      // `showSymbol` (a per-series flag) can express.
      it('still hides symbols when a gappy series has one contiguous pair', () => {
        expect(
          getSeriesPerfOptions({
            type: 'line',
            density: density(5000),
            options: options(),
            values: [1, null, 3, 4, null, 6],
          })
        ).toMatchObject({ showSymbol: false });
      });

      // The guard belongs to the heuristic only: an explicit Never is obeyed even
      // when it blanks the series.
      it('does not override an explicit Never', () => {
        expect(
          getSeriesPerfOptions({
            type: 'line',
            density: density(5000),
            options: options({ performance: { showPoints: 'never' } }),
            values: [42],
          })
        ).toMatchObject({ showSymbol: false });
      });
    });
  });

  describe('scatter / bar large mode', () => {
    it.each(['scatter', 'bar'] as CartesianSingleValueSeriesType[])('enables large mode for a dense %s', (type) => {
      expect(
        getSeriesPerfOptions({ type, density: density(LARGE_MODE_THRESHOLD), options: options(), values: [] })
      ).toEqual({
        large: true,
        largeThreshold: LARGE_MODE_THRESHOLD,
      });
    });

    it.each(['scatter', 'bar'] as CartesianSingleValueSeriesType[])('leaves a sparse %s untouched', (type) => {
      expect(
        getSeriesPerfOptions({ type, density: density(LARGE_MODE_THRESHOLD - 1), options: options(), values: [] })
      ).toEqual({});
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
            values: [],
          })
        ).toEqual({});
      }
    );
  });

  it('leaves effectScatter untouched (ripple series, not a big-data path)', () => {
    expect(
      getSeriesPerfOptions({ type: 'effectScatter', density: density(10_000), options: options(), values: [] })
    ).toEqual({});
  });

  it('leaves heatmap (undefined type) untouched', () => {
    expect(getSeriesPerfOptions({ type: undefined, density: density(10_000), options: options(), values: [] })).toEqual(
      {}
    );
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

  it('animates a chart well past every density threshold when the user opted in', () => {
    expect(getSeriesDensity([timeFrame(500, 20)]).totalPoints).toBe(10_000);
    expect(resolveAnimation(options({ animation: { enabled: true } }))).toBe(true);
  });
});
