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

// A value column that arrived as text (no convertFieldType transform); the label
// column stays a genuine category and is excluded from the slices.
const numericStringFrame = (): DataFrame =>
  toDataFrame({
    fields: [
      { name: 'category', type: FieldType.string, values: ['Sales', 'Admin', 'IT'] },
      { name: 'value', type: FieldType.string, values: ['43', '10', '30'] },
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

    it('coerces a numeric-string field into a slice', () => {
      // 'category' is a genuine label (excluded); 'value' is numeric text.
      const slices = resolvePieSlices([numericStringFrame()], theme, emptyConfig, calculate('sum'), noopReplace);
      expect(slices.map((slice) => ({ name: slice.name, value: slice.value }))).toEqual([{ name: 'value', value: 83 }]);
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
});
