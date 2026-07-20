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
// takes the panel's `reduceOptions` (calc) + `replaceVariables`.
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
  it('builds one item per numeric field, labeled by field', () => {
    const items = buildPieLegendItems([categoricalFrame()], theme, [], fieldConfig, reduce('sum'), noopReplace);

    expect(items.map((item) => item.label)).toEqual(['q1', 'q2']);
    expect(items[0].color).toEqual(expect.any(String));
  });

  it('shows no value columns when no legend values are selected', () => {
    const items = buildPieLegendItems([categoricalFrame()], theme, [], fieldConfig, reduce('sum'), noopReplace);

    expect(items[0].getDisplayValues?.()).toEqual([]);
    expect(items[1].getDisplayValues?.()).toEqual([]);
  });

  it('shows the formatted slice value in the Value column', () => {
    // q1 sum = 60, q2 sum = 150.
    const items = buildPieLegendItems([categoricalFrame()], theme, ['value'], fieldConfig, reduce('sum'), noopReplace);

    // Always titled — the table legend renders a `?` header for a title-less column.
    expect(items[0].getDisplayValues?.()).toEqual([expect.objectContaining({ numeric: 60, title: 'Value' })]);
    expect(items[1].getDisplayValues?.()).toEqual([expect.objectContaining({ numeric: 150, title: 'Value' })]);
  });

  it('shows each slice share of the visible total in the Percent column', () => {
    // q1 sum = 60, q2 sum = 150; total 210 → ~28.6% / ~71.4% (whole-number default).
    const items = buildPieLegendItems(
      [categoricalFrame()],
      theme,
      ['percent'],
      fieldConfig,
      reduce('sum'),
      noopReplace
    );

    expect(items[0].getDisplayValues?.()).toEqual([expect.objectContaining({ text: '29%', title: 'Percent' })]);
    expect(items[1].getDisplayValues?.()).toEqual([expect.objectContaining({ text: '71%', title: 'Percent' })]);
  });

  it('titles both columns when Value and Percent are shown together', () => {
    const items = buildPieLegendItems(
      [categoricalFrame()],
      theme,
      ['value', 'percent'],
      fieldConfig,
      reduce('sum'),
      noopReplace
    );

    const columns = items[0].getDisplayValues?.();
    expect(columns).toHaveLength(2);
    expect(columns?.[0]).toMatchObject({ numeric: 60, title: 'Value' });
    expect(columns?.[1]).toMatchObject({ title: 'Percent' });
  });

  it('keeps a hidden field in the legend but marks it disabled, showing "-" for its percent', () => {
    const items = buildPieLegendItems(
      [categoricalFrame()],
      theme,
      ['percent'],
      hiddenConfig('q2', ['q1', 'q2']),
      reduce('sum'),
      noopReplace
    );

    expect(items.map((item) => item.label)).toEqual(['q1', 'q2']);
    expect(items.map((item) => item.disabled ?? false)).toEqual([false, true]);
    // q1 is the only visible slice, so its share is 100%; the hidden q2 shows "-".
    expect(items[0].getDisplayValues?.()).toEqual([expect.objectContaining({ text: '100%' })]);
    expect(items[1].getDisplayValues?.()).toEqual([expect.objectContaining({ text: '-' })]);
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
