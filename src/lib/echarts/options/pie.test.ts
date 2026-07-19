import { createTheme, type Field, type FieldConfig, FieldType } from '@grafana/data';
import { type CallbackDataParams } from 'echarts/types/dist/shared';
import { type PieLabel } from 'editor/types';
import { type PieSliceModel } from 'lib/echarts/converters/pie';
import {
  getPieAngles,
  getPieCenter,
  getPieContentLabel,
  getPieItemStyle,
  getPieLabelStyle,
  getPieMinAngle,
  getPieMinShowLabelAngle,
  getPieRadius,
  getPieRoseType,
  type PieLabelOptions,
} from 'lib/echarts/options/pie';

const theme = createTheme();

const sliceField = (name: string, value: number | undefined, config: FieldConfig = {}): Field => ({
  name,
  type: FieldType.number,
  config,
  values: [value ?? null],
  state: undefined,
});

const makeSlice = (name: string, value: number | undefined, config: FieldConfig = {}): PieSliceModel => ({
  name,
  value,
  color: '#111111',
  hidden: false,
  field: sliceField(name, value, config),
});

// Slices summing to 100 so percent math is easy to read (60/20/20 → 60%/20%/20%).
const slices = (): PieSliceModel[] => [makeSlice('A', 60), makeSlice('B', 20), makeSlice('C', 20)];

/** Render the label content ECharts would draw for the slice at `index`. */
const renderLabel = (
  labels: PieLabel[] | undefined,
  model: PieSliceModel[],
  index: number,
  labelOptions?: PieLabelOptions
): string => {
  const label = getPieContentLabel(labels, model, theme, undefined, labelOptions);
  const formatter = label?.formatter;
  if (typeof formatter !== 'function') {
    return '';
  }
  return formatter({ dataIndex: index } as CallbackDataParams);
};

describe('getPieContentLabel', () => {
  it('hides the label on an explicit empty selection', () => {
    expect(getPieContentLabel([], slices(), theme)).toMatchObject({ show: false });
  });

  it('defaults an unset selection to the slice name', () => {
    const model = slices();
    expect(getPieContentLabel(undefined, model, theme)).toMatchObject({ show: true });
    expect(renderLabel(undefined, model, 0)).toBe('A');
  });

  it('shows the label when at least one content type is selected', () => {
    expect(getPieContentLabel(['name'], slices(), theme)).toMatchObject({ show: true });
  });

  it('renders each selected content type', () => {
    const model = slices();
    expect(renderLabel(['name'], model, 0)).toBe('A');
    expect(renderLabel(['value'], model, 0)).toBe('60');
    expect(renderLabel(['percent'], model, 0)).toBe('60%');
  });

  it('renders percent from the slice share of the visible total', () => {
    const model = slices();
    expect(renderLabel(['percent'], model, 0)).toBe('60%');
    expect(renderLabel(['percent'], model, 1)).toBe('20%');
    expect(renderLabel(['percent'], model, 2)).toBe('20%');
  });

  it('renders non-round percentages to one decimal (dropping a trailing .0)', () => {
    const model = [makeSlice('A', 1), makeSlice('B', 2)]; // total 3
    expect(renderLabel(['percent'], model, 0)).toBe('33.3%');
    expect(renderLabel(['percent'], model, 1)).toBe('66.7%');
  });

  it('honors a custom percent precision (Advanced `percentPrecision`)', () => {
    const model = [makeSlice('A', 1), makeSlice('B', 2)]; // total 3 → 33.333…%
    // Default (unset) keeps the one-decimal output.
    expect(renderLabel(['percent'], model, 0)).toBe('33.3%');
    // Two decimals distinguishes near-equal shares.
    expect(renderLabel(['percent'], model, 0, { percentPrecision: 2 })).toBe('33.33%');
    // Zero decimals rounds to a whole percent.
    expect(renderLabel(['percent'], model, 0, { percentPrecision: 0 })).toBe('33%');
  });

  it('stacks multiple selected labels in Name → Value → Percent order (one per line)', () => {
    const model = slices();
    expect(renderLabel(['name', 'value'], model, 0)).toBe('A\n60');
    expect(renderLabel(['name', 'percent'], model, 0)).toBe('A\n60%');
    expect(renderLabel(['value', 'percent'], model, 0)).toBe('60\n60%');
    expect(renderLabel(['name', 'value', 'percent'], model, 0)).toBe('A\n60\n60%');
  });

  it('orders lines Name → Value → Percent regardless of selection order', () => {
    const model = slices();
    expect(renderLabel(['percent', 'value', 'name'], model, 0)).toBe('A\n60\n60%');
  });

  it('formats the value with the field unit/decimals', () => {
    const model = [makeSlice('A', 60, { decimals: 1 }), makeSlice('B', 40, { decimals: 1 })];
    expect(renderLabel(['value'], model, 0)).toBe('60.0');
  });

  it('handles a non-finite slice value (renders no-value text and 0% share)', () => {
    const model = [makeSlice('A', undefined), makeSlice('B', 100)];
    // Value line falls back to the field's "No value" text; percent is 0% of total.
    expect(renderLabel(['percent'], model, 0)).toBe('0%');
    expect(renderLabel(['name', 'percent'], model, 0)).toBe('A\n0%');
  });

  it('defaults an unset position to outside (ECharts default, unchanged render)', () => {
    expect(getPieContentLabel(['name'], slices(), theme)).toMatchObject({ position: 'outside' });
    expect(getPieContentLabel(['name'], slices(), theme, undefined, undefined)).toMatchObject({ position: 'outside' });
  });

  it('threads the label position through (inside / center)', () => {
    expect(getPieContentLabel(['name'], slices(), theme, undefined, { position: 'inside' })).toMatchObject({
      position: 'inside',
    });
    expect(getPieContentLabel(['value'], slices(), theme, undefined, { position: 'center' })).toMatchObject({
      position: 'center',
    });
  });

  it('sets the position even on an empty (hidden) selection', () => {
    expect(getPieContentLabel([], slices(), theme, undefined, { position: 'center' })).toMatchObject({
      show: false,
      position: 'center',
    });
  });
});

describe('getPieRadius', () => {
  it('uses a single outer radius for a pie', () => {
    expect(getPieRadius('pie')).toBe('75%');
  });

  it('uses an [inner, outer] radius (a hole) for a donut', () => {
    expect(getPieRadius('donut')).toEqual(['50%', '75%']);
  });

  it('defaults an unset type to a pie', () => {
    expect(getPieRadius(undefined)).toBe('75%');
  });

  it('honors an outer radius override on a pie', () => {
    expect(getPieRadius('pie', undefined, 60)).toBe('60%');
  });

  it('carves a hole when an inner radius is set on a plain pie', () => {
    expect(getPieRadius('pie', 40, 60)).toEqual(['40%', '60%']);
  });

  it('honors radius overrides on a donut, keeping defaults for the unset side', () => {
    expect(getPieRadius('donut', 30)).toEqual(['30%', '75%']);
    expect(getPieRadius('donut', undefined, 90)).toEqual(['50%', '90%']);
  });
});

describe('getPieCenter', () => {
  it('returns undefined when neither coordinate is set (default centered)', () => {
    expect(getPieCenter()).toBeUndefined();
    expect(getPieCenter(undefined, undefined)).toBeUndefined();
  });

  it('builds a percentage [x, y] pair from the overrides', () => {
    expect(getPieCenter(30, 40)).toEqual(['30%', '40%']);
  });

  it('keeps the unset axis centered at 50%', () => {
    expect(getPieCenter(30)).toEqual(['30%', '50%']);
    expect(getPieCenter(undefined, 40)).toEqual(['50%', '40%']);
  });
});

describe('getPieMinShowLabelAngle', () => {
  it('returns the angle when positive', () => {
    expect(getPieMinShowLabelAngle(5)).toBe(5);
  });

  it('returns undefined for 0 or unset (all labels shown)', () => {
    expect(getPieMinShowLabelAngle(0)).toBeUndefined();
    expect(getPieMinShowLabelAngle(undefined)).toBeUndefined();
  });
});

describe('getPieItemStyle', () => {
  it('returns the border keys when a width is set', () => {
    expect(getPieItemStyle(2, '#000000')).toEqual({ borderWidth: 2, borderColor: '#000000' });
  });

  it('omits the color when unset but keeps the width', () => {
    expect(getPieItemStyle(2, undefined)).toEqual({ borderWidth: 2 });
  });

  it('returns an empty object for a 0/unset width (no separator)', () => {
    expect(getPieItemStyle(0, '#000000')).toEqual({});
    expect(getPieItemStyle(undefined, '#000000')).toEqual({});
  });
});

describe('getPieLabelStyle', () => {
  it('includes the font size when set', () => {
    expect(getPieLabelStyle(theme, 20)).toMatchObject({ fontSize: 20 });
  });

  it('omits the font size when unset', () => {
    expect(getPieLabelStyle(theme)).not.toHaveProperty('fontSize');
  });

  it('spreads overflow and width when overflow is set', () => {
    expect(getPieLabelStyle(theme, undefined, 'truncate', 120)).toMatchObject({ overflow: 'truncate', width: 120 });
  });

  it('omits overflow/width for none or unset', () => {
    const none = getPieLabelStyle(theme, undefined, 'none', 120);
    expect(none).not.toHaveProperty('overflow');
    const unset = getPieLabelStyle(theme);
    expect(unset).not.toHaveProperty('overflow');
    expect(unset).not.toHaveProperty('width');
  });
});

describe('getPieRoseType', () => {
  // `none` maps to `undefined` (ECharts' own default = a plain pie). The
  // `@types/echarts` `roseType` union is `'radius' | 'area' | undefined` and does
  // not accept the runtime `false`, so `undefined` is the type-safe "off" value.
  it('maps the none sentinel to undefined (a plain pie)', () => {
    expect(getPieRoseType('none')).toBeUndefined();
  });

  it('passes through the radius rose type', () => {
    expect(getPieRoseType('radius')).toBe('radius');
  });

  it('passes through the area rose type', () => {
    expect(getPieRoseType('area')).toBe('area');
  });

  it('defaults an unset rose type to undefined (a plain pie)', () => {
    expect(getPieRoseType(undefined)).toBeUndefined();
  });
});

describe('getPieMinAngle', () => {
  it('returns a positive value unchanged', () => {
    expect(getPieMinAngle(5)).toBe(5);
    expect(getPieMinAngle(0.5)).toBe(0.5);
  });

  it('omits the default 0 (returns undefined, so the key is dropped)', () => {
    expect(getPieMinAngle(0)).toBeUndefined();
  });

  it('omits a negative value', () => {
    expect(getPieMinAngle(-10)).toBeUndefined();
  });

  it('omits an unset value', () => {
    expect(getPieMinAngle(undefined)).toBeUndefined();
  });
});

describe('getPieAngles', () => {
  it('omits startAngle at the ECharts default (90) — keeps the full pie unchanged', () => {
    expect(getPieAngles(90, undefined)).toEqual({});
  });

  it('omits both when unset', () => {
    expect(getPieAngles(undefined, undefined)).toEqual({});
  });

  it('returns both angles for a half-pie (start 180 / end 360)', () => {
    expect(getPieAngles(180, 360)).toEqual({ startAngle: 180, endAngle: 360 });
  });

  it('returns only endAngle when start is at the default', () => {
    expect(getPieAngles(90, 270)).toEqual({ endAngle: 270 });
  });

  it('returns only endAngle when start is unset', () => {
    expect(getPieAngles(undefined, 270)).toEqual({ endAngle: 270 });
  });

  it('returns only startAngle when set away from the default and end is unset', () => {
    expect(getPieAngles(180, undefined)).toEqual({ startAngle: 180 });
  });
});
