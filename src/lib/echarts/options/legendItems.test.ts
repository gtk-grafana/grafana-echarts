import {
  createTheme,
  type DataFrame,
  type Field,
  type FieldConfigSource,
  FieldType,
  type SystemConfigOverrideRule,
  toDataFrame,
} from '@grafana/data';
import {
  buildPieLegendItems,
  buildRadarLegendItems,
  buildTimeSeriesLegendItems,
  getCalcDisplayValues,
} from 'lib/echarts/options/legendItems';

const theme = createTheme();

const fieldConfig: FieldConfigSource = { defaults: {}, overrides: [] };

// The pie legend now reduces via `getFieldDisplayValues`, so `buildPieLegendItems`
// takes the panel's `reduceOptions` (calc) + `replaceVariables` instead of a calc.
const reduce = (calc: string) => ({ calcs: [calc], values: false });
const noopReplace = (value: string) => value;

/**
 * The `hideSeriesFrom` system override the visibility toggle writes: a `byNames`
 * `exclude` matcher keeping every name except the hidden ones.
 */
const hiddenConfig = (hiddenName: string, allNames: string[]): FieldConfigSource => {
  const override: SystemConfigOverrideRule = {
    __systemRef: 'hideSeriesFrom',
    matcher: {
      id: 'byNames',
      options: {
        mode: 'exclude',
        names: allNames.filter((name) => name !== hiddenName),
        prefix: 'All except:',
        readOnly: true,
      },
    },
    properties: [{ id: 'custom.hideFrom', value: { viz: true, legend: false, tooltip: true } }],
  };
  return { defaults: {}, overrides: [override] };
};

const wideFrame = (): DataFrame =>
  toDataFrame({
    fields: [
      { name: 'time', type: FieldType.time, values: [1, 2, 3] },
      { name: 'cpu', type: FieldType.number, values: [10, 20, 30], config: { displayName: 'cpu' } },
      { name: 'mem', type: FieldType.number, values: [40, 50, 60], config: { displayName: 'mem' } },
    ],
  });

const categoricalFrame = (): DataFrame =>
  toDataFrame({
    fields: [
      { name: 'category', type: FieldType.string, values: ['north', 'south', 'east'] },
      { name: 'q1', type: FieldType.number, values: [10, 20, 30], config: { displayName: 'q1' } },
      { name: 'q2', type: FieldType.number, values: [40, 50, 60], config: { displayName: 'q2' } },
    ],
  });

const numberField = (values: Array<number | null>): Field =>
  toDataFrame({
    fields: [{ name: 'value', type: FieldType.number, values }],
  }).fields[0];

describe('getCalcDisplayValues', () => {
  it('returns nothing when no calcs are requested', () => {
    expect(getCalcDisplayValues([], numberField([1, 2, 3]), theme)).toEqual([]);
  });

  it('reduces a field to one display value per calc, titled with the reducer name', () => {
    const result = getCalcDisplayValues(['mean', 'last'], numberField([10, 20, 30]), theme);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ title: 'Mean', numeric: 20 });
    expect(result[1]).toMatchObject({ title: 'Last', numeric: 30 });
  });

  it('falls back to the raw calc id for an unknown reducer', () => {
    const result = getCalcDisplayValues(['definitely-not-a-reducer'], numberField([1]), theme);

    expect(result[0].title).toBe('definitely-not-a-reducer');
  });
});

describe('buildTimeSeriesLegendItems', () => {
  it('builds one item per numeric field, with label and color', () => {
    const items = buildTimeSeriesLegendItems([wideFrame()], theme, [], fieldConfig);

    expect(items).toHaveLength(2);
    expect(items[0].label).toBe('cpu');
    expect(items[1].label).toBe('mem');
    expect(items[0].color).toEqual(expect.any(String));
  });

  it('gives each item a stable, unique key', () => {
    const items = buildTimeSeriesLegendItems([wideFrame()], theme, [], fieldConfig);

    const keys = items.map((item) => item.getItemKey?.());
    expect(new Set(keys).size).toBe(items.length);
  });

  it('exposes the requested calcs lazily via getDisplayValues', () => {
    const items = buildTimeSeriesLegendItems([wideFrame()], theme, ['mean'], fieldConfig);

    expect(items[0].getDisplayValues?.()).toEqual([expect.objectContaining({ title: 'Mean', numeric: 20 })]);
    expect(items[1].getDisplayValues?.()).toEqual([expect.objectContaining({ title: 'Mean', numeric: 50 })]);
  });

  it('skips frames that have no time field', () => {
    const noTime = toDataFrame({
      fields: [{ name: 'cpu', type: FieldType.number, values: [1, 2], config: { displayName: 'cpu' } }],
    });

    expect(buildTimeSeriesLegendItems([noTime], theme, [], fieldConfig)).toHaveLength(0);
  });
});

describe('buildRadarLegendItems', () => {
  it('builds one item per numeric field (one per polygon)', () => {
    const items = buildRadarLegendItems([categoricalFrame()], theme, [], fieldConfig);

    expect(items.map((item) => item.label)).toEqual(['q1', 'q2']);
    expect(items[0].color).toEqual(expect.any(String));
  });

  it('reduces each polygon across its axes for the calc columns', () => {
    const items = buildRadarLegendItems([categoricalFrame()], theme, ['max'], fieldConfig);

    expect(items[0].getDisplayValues?.()).toEqual([expect.objectContaining({ title: 'Max', numeric: 30 })]);
    expect(items[1].getDisplayValues?.()).toEqual([expect.objectContaining({ title: 'Max', numeric: 60 })]);
  });

  it('returns nothing when no frame has a numeric field', () => {
    const stringsOnly = toDataFrame({ fields: [{ name: 'category', type: FieldType.string, values: ['a'] }] });
    expect(buildRadarLegendItems([stringsOnly], theme, [], fieldConfig)).toHaveLength(0);
  });
});

describe('buildPieLegendItems', () => {
  describe('wide format', () => {
    it('builds one item per numeric field, labeled by field', () => {
      const items = buildPieLegendItems([categoricalFrame()], theme, [], fieldConfig, 'wide', reduce('sum'), noopReplace);

      expect(items.map((item) => item.label)).toEqual(['q1', 'q2']);
      expect(items[0].color).toEqual(expect.any(String));
    });

    it('shows each field reduced by the pie calc in the calc columns', () => {
      const items = buildPieLegendItems([categoricalFrame()], theme, ['last'], fieldConfig, 'wide', reduce('sum'), noopReplace);

      // q1 sum = 60, q2 sum = 150; any legend reducer resolves to that slice value.
      expect(items[0].getDisplayValues?.()).toEqual([expect.objectContaining({ numeric: 60 })]);
      expect(items[1].getDisplayValues?.()).toEqual([expect.objectContaining({ numeric: 150 })]);
    });

    it('keeps a hidden field in the legend but marks it disabled', () => {
      const items = buildPieLegendItems(
        [categoricalFrame()],
        theme,
        [],
        hiddenConfig('q2', ['q1', 'q2']),
        'wide',
        reduce('sum'),
        noopReplace
      );

      expect(items.map((item) => item.label)).toEqual(['q1', 'q2']);
      expect(items.map((item) => item.disabled ?? false)).toEqual([false, true]);
    });
  });

  describe('long format', () => {
    it('builds one item per category row (one per slice), labeled by category', () => {
      const items = buildPieLegendItems([categoricalFrame()], theme, [], fieldConfig, 'long', reduce('sum'), noopReplace);

      expect(items.map((item) => item.label)).toEqual(['north', 'south', 'east']);
    });

    it('colors slices by palette index, independent of the field color', () => {
      const items = buildPieLegendItems([categoricalFrame()], theme, [], fieldConfig, 'long', reduce('sum'), noopReplace);

      expect(items[0].color).not.toBe(items[1].color);
    });

    it('shows each slice value in the calc columns', () => {
      const items = buildPieLegendItems([categoricalFrame()], theme, ['last'], fieldConfig, 'long', reduce('sum'), noopReplace);

      // A slice is a single value, so any reducer resolves to that slice's value.
      expect(items[0].getDisplayValues?.()).toEqual([expect.objectContaining({ numeric: 10 })]);
      expect(items[2].getDisplayValues?.()).toEqual([expect.objectContaining({ numeric: 30 })]);
    });

    it('keeps a hidden slice in the legend but marks it disabled', () => {
      const items = buildPieLegendItems(
        [categoricalFrame()],
        theme,
        [],
        hiddenConfig('south', ['north', 'south', 'east']),
        'long',
        reduce('sum'),
        noopReplace
      );

      expect(items.map((item) => item.label)).toEqual(['north', 'south', 'east']);
      expect(items.map((item) => item.disabled ?? false)).toEqual([false, true, false]);
    });
  });
});

describe('legend disabled state (per-field families)', () => {
  it('marks time series items disabled when the field config hides them from the viz', () => {
    const items = buildTimeSeriesLegendItems([wideFrame()], theme, [], hiddenConfig('mem', ['cpu', 'mem']));

    expect(items.map((item) => item.label)).toEqual(['cpu', 'mem']);
    expect(items.map((item) => item.disabled ?? false)).toEqual([false, true]);
  });

  it('marks radar polygons disabled when the field config hides them from the viz', () => {
    const items = buildRadarLegendItems([categoricalFrame()], theme, [], hiddenConfig('q2', ['q1', 'q2']));

    expect(items.map((item) => item.label)).toEqual(['q1', 'q2']);
    expect(items.map((item) => item.disabled ?? false)).toEqual([false, true]);
  });
});
