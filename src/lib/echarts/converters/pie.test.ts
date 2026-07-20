import {
  createTheme,
  type DataFrame,
  type FieldConfigSource,
  FieldType,
  reduceField,
  type ReduceDataOptions,
  type SystemConfigOverrideRule,
  toDataFrame,
} from '@grafana/data';
import { SortOrder } from '@grafana/schema';
import { resolvePieSlices } from 'lib/echarts/converters/pie';

const theme = createTheme();
const emptyConfig: FieldConfigSource = { defaults: {}, overrides: [] };

// The pie reduces via Grafana's `getFieldDisplayValues`, which needs the panel's
// `reduceOptions` (calc + Calculate/All-values + limit) and `replaceVariables`.
const calculate = (calc: string): ReduceDataOptions => ({ calcs: [calc], values: false });
const allValues = (limit?: number): ReduceDataOptions => ({ calcs: [], values: true, limit });
const noopReplace = (value: string) => value;

// Wide: several numeric fields (plus an ignored time field). Each numeric field
// is one slice, reduced to a single value.
const wideFrame = (): DataFrame =>
  toDataFrame({
    fields: [
      { name: 'time', type: FieldType.time, values: [1, 2, 3] },
      { name: 'A', type: FieldType.number, values: [10, 20, 30], config: { displayName: 'A' } },
      { name: 'B', type: FieldType.number, values: [1, 2, 3], config: { displayName: 'B' } },
      { name: 'C', type: FieldType.number, values: [5, 5, 5], config: { displayName: 'C' } },
    ],
  });

// Three single-value frames (e.g. one frame per Prometheus series) — the
// multi-series case this converter unlocks (previously only the first was read).
const multiFrames = (): DataFrame[] => [
  toDataFrame({ fields: [{ name: 'A', type: FieldType.number, values: [10, 20], config: { displayName: 'A' } }] }),
  toDataFrame({ fields: [{ name: 'B', type: FieldType.number, values: [1, 2], config: { displayName: 'B' } }] }),
  toDataFrame({ fields: [{ name: 'C', type: FieldType.number, values: [5, 5], config: { displayName: 'C' } }] }),
];

// A category label field + a numeric value field, one row per category — the
// All-values case (one slice per row, named by the category). The value field has
// no `displayName`, so each row's slice name falls through to the category label.
const rowsFrame = (): DataFrame =>
  toDataFrame({
    fields: [
      { name: 'category', type: FieldType.string, values: ['Sales', 'Admin', 'IT', 'Ops'] },
      { name: 'value', type: FieldType.number, values: [10, 20, 30, 40] },
    ],
  });

// The `hideSeriesFrom` system override the visibility toggle writes: keep the
// listed names, hide the rest (exclude mode).
const hideConfig = (keep: string[]): FieldConfigSource => {
  const override: SystemConfigOverrideRule = {
    __systemRef: 'hideSeriesFrom',
    matcher: { id: 'byNames', options: { mode: 'exclude', names: keep, prefix: 'All except:', readOnly: true } },
    properties: [{ id: 'custom.hideFrom', value: { viz: true, legend: false, tooltip: true } }],
  };
  return { defaults: {}, overrides: [override] };
};

const colorConfig = (name: string, color: string): FieldConfigSource => ({
  defaults: {},
  overrides: [
    {
      matcher: { id: 'byName', options: name },
      properties: [{ id: 'color', value: { mode: 'fixed', fixedColor: color } }],
    },
  ],
});

describe('resolvePieSlices', () => {
  describe('Calculate (one slice per numeric field)', () => {
    it('builds one slice per numeric field, reduced by the calc', () => {
      const slices = resolvePieSlices([wideFrame()], theme, emptyConfig, calculate('sum'), noopReplace);

      expect(slices.map((slice) => ({ name: slice.name, value: slice.value }))).toEqual([
        { name: 'A', value: 60 },
        { name: 'B', value: 6 },
        { name: 'C', value: 15 },
      ]);
    });

    it('honors the chosen calculation', () => {
      const slices = resolvePieSlices([wideFrame()], theme, emptyConfig, calculate('max'), noopReplace);
      expect(slices.map((slice) => slice.value)).toEqual([30, 3, 5]);
    });

    it('ignores time/label fields as slices', () => {
      const slices = resolvePieSlices([wideFrame()], theme, emptyConfig, calculate('sum'), noopReplace);
      expect(slices.map((slice) => slice.name)).not.toContain('time');
    });

    it('reduces every field across multiple frames into one slice each (multi-series)', () => {
      // Previously only the first frame was read; now each frame's numeric field
      // becomes a slice.
      const slices = resolvePieSlices(multiFrames(), theme, emptyConfig, calculate('sum'), noopReplace);
      expect(slices.map((slice) => ({ name: slice.name, value: slice.value }))).toEqual([
        { name: 'A', value: 30 },
        { name: 'B', value: 3 },
        { name: 'C', value: 10 },
      ]);
    });

    it('marks slices visible with string colors, and lets a fixed-color override win', () => {
      const slices = resolvePieSlices([wideFrame()], theme, emptyConfig, calculate('sum'), noopReplace);
      expect(slices.every((slice) => slice.hidden === false)).toBe(true);
      expect(slices.every((slice) => typeof slice.color === 'string')).toBe(true);

      const overridden = resolvePieSlices(
        [wideFrame()],
        theme,
        colorConfig('B', '#123456'),
        calculate('sum'),
        noopReplace
      );
      expect(overridden.find((slice) => slice.name === 'B')!.color).toBe('#123456');
    });

    it('flags a field hidden via a hideSeriesFrom override', () => {
      const slices = resolvePieSlices([wideFrame()], theme, hideConfig(['A', 'C']), calculate('sum'), noopReplace);
      expect(slices.map((slice) => [slice.name, slice.hidden])).toEqual([
        ['A', false],
        ['B', true],
        ['C', false],
      ]);
    });

    it('reduces an all-null field to a finite sum (0) or an undefined non-finite calc', () => {
      const frame = toDataFrame({
        fields: [{ name: 'A', type: FieldType.number, values: [null, null], config: { displayName: 'A' } }],
      });
      // Sum of nothing is 0 (a finite value renders an empty slice).
      expect(resolvePieSlices([frame], theme, emptyConfig, calculate('sum'), noopReplace)).toEqual([
        expect.objectContaining({ name: 'A', value: 0 }),
      ]);
      // A non-finite reduction (mean of all-null → null) collapses to undefined.
      expect(resolvePieSlices([frame], theme, emptyConfig, calculate('mean'), noopReplace)).toEqual([
        expect.objectContaining({ name: 'A', value: undefined }),
      ]);
    });
  });

  describe('All values (one slice per row)', () => {
    it('builds one slice per row, named and valued by row', () => {
      const slices = resolvePieSlices([rowsFrame()], theme, emptyConfig, allValues(), noopReplace);
      expect(slices.map((slice) => ({ name: slice.name, value: slice.value }))).toEqual([
        { name: 'Sales', value: 10 },
        { name: 'Admin', value: 20 },
        { name: 'IT', value: 30 },
        { name: 'Ops', value: 40 },
      ]);
    });

    it('caps the slices at the configured limit', () => {
      const slices = resolvePieSlices([rowsFrame()], theme, emptyConfig, allValues(2), noopReplace);
      expect(slices.map((slice) => slice.name)).toEqual(['Sales', 'Admin']);
    });

    it('flags a hidden row and lets a fixed-color override win', () => {
      const slices = resolvePieSlices(
        [rowsFrame()],
        theme,
        hideConfig(['Sales', 'IT', 'Ops']),
        allValues(),
        noopReplace
      );
      expect(slices.map((slice) => [slice.name, slice.hidden])).toEqual([
        ['Sales', false],
        ['Admin', true],
        ['IT', false],
        ['Ops', false],
      ]);

      const overridden = resolvePieSlices(
        [rowsFrame()],
        theme,
        colorConfig('Admin', '#abcdef'),
        allValues(),
        noopReplace
      );
      expect(overridden.find((slice) => slice.name === 'Admin')!.color).toBe('#abcdef');
    });
  });

  it('returns an empty array when no frame has a numeric-like field', () => {
    expect(resolvePieSlices([], theme, emptyConfig, calculate('sum'), noopReplace)).toEqual([]);

    const labelsOnly = toDataFrame({ fields: [{ name: 'category', type: FieldType.string, values: ['a', 'b'] }] });
    expect(resolvePieSlices([labelsOnly], theme, emptyConfig, calculate('sum'), noopReplace)).toEqual([]);
  });

  it('defaults to Sum when no calc is configured', () => {
    const slices = resolvePieSlices([wideFrame()], theme, emptyConfig, undefined, noopReplace);
    expect(slices.map((slice) => slice.value)).toEqual([60, 6, 15]);
  });

  it('exposes a single-value slice field whose calc columns resolve to the slice value', () => {
    const [a] = resolvePieSlices([wideFrame()], theme, emptyConfig, calculate('sum'), noopReplace);
    // The slice field holds the reduced value regardless of the reducer used.
    expect(reduceField({ field: a.field, reducers: ['last'] }).last).toBe(60);
  });

  describe('slice sorting', () => {
    // wideFrame sums: A=60, B=6, C=15 (data order A, B, C).
    it('orders slices largest-first when descending', () => {
      const slices = resolvePieSlices(
        [wideFrame()],
        theme,
        emptyConfig,
        calculate('sum'),
        noopReplace,
        undefined,
        SortOrder.Descending
      );
      expect(slices.map((slice) => slice.name)).toEqual(['A', 'C', 'B']);
    });

    it('orders slices smallest-first when ascending', () => {
      const slices = resolvePieSlices(
        [wideFrame()],
        theme,
        emptyConfig,
        calculate('sum'),
        noopReplace,
        undefined,
        SortOrder.Ascending
      );
      expect(slices.map((slice) => slice.name)).toEqual(['B', 'C', 'A']);
    });

    it('keeps data order when sorting is none (the default)', () => {
      const none = resolvePieSlices(
        [wideFrame()],
        theme,
        emptyConfig,
        calculate('sum'),
        noopReplace,
        undefined,
        SortOrder.None
      );
      expect(none.map((slice) => slice.name)).toEqual(['A', 'B', 'C']);
      // Omitting the sort argument defaults to data order too.
      const unset = resolvePieSlices([wideFrame()], theme, emptyConfig, calculate('sum'), noopReplace);
      expect(unset.map((slice) => slice.name)).toEqual(['A', 'B', 'C']);
    });

    it('sorts hidden slices alongside the rest', () => {
      // Hidden slices stay in the model (greyed in the legend) and are ordered too.
      const slices = resolvePieSlices(
        [wideFrame()],
        theme,
        hideConfig(['A', 'B']),
        calculate('sum'),
        noopReplace,
        undefined,
        SortOrder.Descending
      );
      expect(slices.map((slice) => [slice.name, slice.hidden])).toEqual([
        ['A', false],
        ['C', true],
        ['B', false],
      ]);
    });

    it('pushes non-finite slice values to the end regardless of direction', () => {
      // B is all-null → mean is non-finite → value undefined.
      const frame = toDataFrame({
        fields: [
          { name: 'A', type: FieldType.number, values: [10], config: { displayName: 'A' } },
          { name: 'B', type: FieldType.number, values: [null], config: { displayName: 'B' } },
          { name: 'C', type: FieldType.number, values: [30], config: { displayName: 'C' } },
        ],
      });
      const desc = resolvePieSlices(
        [frame],
        theme,
        emptyConfig,
        calculate('mean'),
        noopReplace,
        undefined,
        SortOrder.Descending
      );
      expect(desc.map((slice) => slice.name)).toEqual(['C', 'A', 'B']);

      const asc = resolvePieSlices(
        [frame],
        theme,
        emptyConfig,
        calculate('mean'),
        noopReplace,
        undefined,
        SortOrder.Ascending
      );
      expect(asc.map((slice) => slice.name)).toEqual(['A', 'C', 'B']);
    });
  });

  // The chart option, tooltip, and legend paths all resolve slices with identical
  // inputs in a single render; the resolver memoizes per `series` reference so the
  // underlying `getFieldDisplayValues` reduction runs once.
  describe('memoization', () => {
    it('returns the identical model for repeated calls with the same frames and inputs', () => {
      const frames = [wideFrame()];
      const reduce = calculate('sum');
      const first = resolvePieSlices(frames, theme, emptyConfig, reduce, noopReplace);
      const second = resolvePieSlices(frames, theme, emptyConfig, reduce, noopReplace);
      expect(second).toBe(first);
    });

    it('recomputes when an input changes', () => {
      const frames = [wideFrame()];
      const sum = resolvePieSlices(frames, theme, emptyConfig, calculate('sum'), noopReplace);
      const max = resolvePieSlices(frames, theme, emptyConfig, calculate('max'), noopReplace);
      expect(max).not.toBe(sum);
      expect(max.map((slice) => slice.value)).not.toEqual(sum.map((slice) => slice.value));
    });

    it('keeps a separate entry per frames reference', () => {
      const reduce = calculate('sum');
      const a = resolvePieSlices([wideFrame()], theme, emptyConfig, reduce, noopReplace);
      const b = resolvePieSlices([wideFrame()], theme, emptyConfig, reduce, noopReplace);
      expect(b).not.toBe(a);
    });
  });
});
