import {
  createTheme,
  type DataFrame,
  type FieldConfigSource,
  FieldType,
  reduceField,
  type SystemConfigOverrideRule,
  toDataFrame,
} from '@grafana/data';
import { resolvePieSlices } from 'lib/echarts/converters/pie';

const theme = createTheme();
const emptyConfig: FieldConfigSource = { defaults: {}, overrides: [] };

// The pie now reduces via Grafana's `getFieldDisplayValues`, which needs the
// panel's `reduceOptions` (calc + Calculate/All-values) and `replaceVariables`.
// A slice is one value, so tests exercise a single Calculate calc.
const reduce = (calc: string) => ({ calcs: [calc], values: false });
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

// Long: a category label field + a value field, with duplicate categories to
// exercise aggregation.
const longFrame = (): DataFrame =>
  toDataFrame({
    fields: [
      { name: 'category', type: FieldType.string, values: ['Sales', 'Sales', 'Admin', 'IT'] },
      { name: 'value', type: FieldType.number, values: [43, 7, 10, 30], config: { displayName: 'value' } },
    ],
  });

// A value column that arrived as text (no convertFieldType transform).
const numericStringFrame = (): DataFrame =>
  toDataFrame({
    fields: [
      { name: 'category', type: FieldType.string, values: ['Sales', 'Admin', 'IT'] },
      { name: 'value', type: FieldType.string, values: ['43', '10', '30'] },
    ],
  });

// A year-like (all-numeric) string category paired with a numeric value.
const yearFrame = (): DataFrame =>
  toDataFrame({
    fields: [
      { name: 'year', type: FieldType.string, values: ['2021', '2022', '2021'] },
      { name: 'sales', type: FieldType.number, values: [10, 20, 30], config: { displayName: 'sales' } },
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
  describe('wide format (Grafana default)', () => {
    it('builds one slice per numeric field, reduced by the calc', () => {
      const slices = resolvePieSlices([wideFrame()], theme, emptyConfig, 'wide', reduce('sum'), noopReplace);

      expect(slices.map((slice) => ({ name: slice.name, value: slice.value }))).toEqual([
        { name: 'A', value: 60 },
        { name: 'B', value: 6 },
        { name: 'C', value: 15 },
      ]);
    });

    it('honors the chosen calculation', () => {
      const slices = resolvePieSlices([wideFrame()], theme, emptyConfig, 'wide', reduce('max'), noopReplace);
      expect(slices.map((slice) => slice.value)).toEqual([30, 3, 5]);
    });

    it('ignores time/label fields as slices', () => {
      const slices = resolvePieSlices([wideFrame()], theme, emptyConfig, 'wide', reduce('sum'), noopReplace);
      expect(slices.map((slice) => slice.name)).not.toContain('time');
    });

    it('coerces a numeric-string field into a slice', () => {
      // 'category' is a genuine label (excluded); 'value' is numeric text.
      const slices = resolvePieSlices([numericStringFrame()], theme, emptyConfig, 'wide', reduce('sum'), noopReplace);
      expect(slices.map((slice) => ({ name: slice.name, value: slice.value }))).toEqual([{ name: 'value', value: 83 }]);
    });

    it('marks slices visible with string colors, and lets a fixed-color override win', () => {
      const slices = resolvePieSlices([wideFrame()], theme, emptyConfig, 'wide', reduce('sum'), noopReplace);
      expect(slices.every((slice) => slice.hidden === false)).toBe(true);
      expect(slices.every((slice) => typeof slice.color === 'string')).toBe(true);

      const overridden = resolvePieSlices([wideFrame()], theme, colorConfig('B', '#123456'), 'wide', reduce('sum'), noopReplace);
      expect(overridden.find((slice) => slice.name === 'B')!.color).toBe('#123456');
    });

    it('flags a field hidden via a hideSeriesFrom override', () => {
      const slices = resolvePieSlices([wideFrame()], theme, hideConfig(['A', 'C']), 'wide', reduce('sum'), noopReplace);
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
      expect(resolvePieSlices([frame], theme, emptyConfig, 'wide', reduce('sum'), noopReplace)).toEqual([
        expect.objectContaining({ name: 'A', value: 0 }),
      ]);
      // A non-finite reduction (mean of all-null → null) collapses to undefined.
      expect(resolvePieSlices([frame], theme, emptyConfig, 'wide', reduce('mean'), noopReplace)).toEqual([
        expect.objectContaining({ name: 'A', value: undefined }),
      ]);
    });
  });

  describe('long format', () => {
    it('builds one slice per distinct category, aggregating duplicates by the calc', () => {
      const slices = resolvePieSlices([longFrame()], theme, emptyConfig, 'long', reduce('sum'), noopReplace);

      // Two 'Sales' rows (43, 7) aggregate to 50; first-seen category order.
      expect(slices.map((slice) => ({ name: slice.name, value: slice.value }))).toEqual([
        { name: 'Sales', value: 50 },
        { name: 'Admin', value: 10 },
        { name: 'IT', value: 30 },
      ]);
    });

    it('honors the chosen calculation per category group', () => {
      const slices = resolvePieSlices([longFrame()], theme, emptyConfig, 'long', reduce('mean'), noopReplace);
      // Sales mean(43, 7) = 25; single-row groups equal their value.
      expect(slices.map((slice) => slice.value)).toEqual([25, 10, 30]);
    });

    it('colors slices by palette index (distinct), letting an override win', () => {
      const slices = resolvePieSlices([longFrame()], theme, emptyConfig, 'long', reduce('sum'), noopReplace);
      expect(slices[0].color).not.toBe(slices[1].color);

      const overridden = resolvePieSlices([longFrame()], theme, colorConfig('Admin', '#abcdef'), 'long', reduce('sum'), noopReplace);
      expect(overridden.find((slice) => slice.name === 'Admin')!.color).toBe('#abcdef');
    });

    it('coerces a numeric-string value field without a transform', () => {
      const slices = resolvePieSlices([numericStringFrame()], theme, emptyConfig, 'long', reduce('sum'), noopReplace);
      expect(slices.map((slice) => ({ name: slice.name, value: slice.value }))).toEqual([
        { name: 'Sales', value: 43 },
        { name: 'Admin', value: 10 },
        { name: 'IT', value: 30 },
      ]);
    });

    it('keeps a year-like string field as the category, not the value', () => {
      const slices = resolvePieSlices([yearFrame()], theme, emptyConfig, 'long', reduce('sum'), noopReplace);
      expect(slices.map((slice) => ({ name: slice.name, value: slice.value }))).toEqual([
        { name: '2021', value: 40 },
        { name: '2022', value: 20 },
      ]);
    });

    it('falls back to row indices when there is no category field', () => {
      const frame = toDataFrame({
        fields: [{ name: 'v', type: FieldType.number, values: [5, 6], config: { displayName: 'v' } }],
      });
      expect(
        resolvePieSlices([frame], theme, emptyConfig, 'long', reduce('sum'), noopReplace).map((slice) => ({
          name: slice.name,
          value: slice.value,
        }))
      ).toEqual([
        { name: '0', value: 5 },
        { name: '1', value: 6 },
      ]);
    });

    it('flags a hidden category and keeps palette colors stable', () => {
      const all = resolvePieSlices([longFrame()], theme, emptyConfig, 'long', reduce('sum'), noopReplace);
      const slices = resolvePieSlices([longFrame()], theme, hideConfig(['Sales', 'IT']), 'long', reduce('sum'), noopReplace);

      expect(slices.map((slice) => [slice.name, slice.hidden])).toEqual([
        ['Sales', false],
        ['Admin', true],
        ['IT', false],
      ]);
      // 'IT' keeps its original palette color despite 'Admin' being hidden.
      expect(slices.find((slice) => slice.name === 'IT')!.color).toBe(all.find((slice) => slice.name === 'IT')!.color);
    });
  });

  it('returns an empty array when no frame has a numeric-like field', () => {
    expect(resolvePieSlices([], theme, emptyConfig, 'wide', reduce('sum'), noopReplace)).toEqual([]);

    const labelsOnly = toDataFrame({ fields: [{ name: 'category', type: FieldType.string, values: ['a', 'b'] }] });
    expect(resolvePieSlices([labelsOnly], theme, emptyConfig, 'long', reduce('sum'), noopReplace)).toEqual([]);
    expect(resolvePieSlices([labelsOnly], theme, emptyConfig, 'wide', reduce('sum'), noopReplace)).toEqual([]);
  });

  it('exposes a single-value slice field whose calc columns resolve to the slice value', () => {
    const [sales] = resolvePieSlices([longFrame()], theme, emptyConfig, 'long', reduce('sum'), noopReplace);
    // The slice field holds the reduced value regardless of the reducer used.
    expect(reduceField({ field: sales.field, reducers: ['last'] }).last).toBe(50);
  });
});
