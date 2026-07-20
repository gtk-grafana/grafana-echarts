import { createTheme, type Field, type FieldConfig, FieldType } from '@grafana/data';
import { type CallbackDataParams } from 'echarts/types/dist/shared';
import { type PieLabel } from 'editor/types';
import { type PieSliceModel } from 'lib/echarts/converters/types';
import {
  getPieAngles,
  getPieBorderRadius,
  getPieCenter,
  getPieContentLabel,
  getPieEmphasis,
  getPieEmptyState,
  getPieItemStyle,
  getPieLabelStyle,
  getPieMinAngle,
  getPieMinShowLabelAngle,
  getPieOrientation,
  getPieRadius,
  getPieRoseType,
  getPieSelection,
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

  it('rounds percent to a whole number by default (core Grafana)', () => {
    const model = [makeSlice('A', 1), makeSlice('B', 2)]; // total 3
    expect(renderLabel(['percent'], model, 0)).toBe('33%');
    expect(renderLabel(['percent'], model, 1)).toBe('67%');
  });

  it("honors the slice field's decimals for the percent", () => {
    const model = [makeSlice('A', 1, { decimals: 1 }), makeSlice('B', 2, { decimals: 1 })]; // total 3
    expect(renderLabel(['percent'], model, 0)).toBe('33.3%');
    expect(renderLabel(['percent'], model, 1)).toBe('66.7%');
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

describe('getPieItemStyle (slice separation border)', () => {
  it('returns the border keys when a width is set', () => {
    expect(getPieItemStyle(undefined, undefined, 2, '#000000')).toEqual({
      color: undefined,
      borderWidth: 2,
      borderColor: '#000000',
    });
  });

  it('omits the border color when unset but keeps the width', () => {
    expect(getPieItemStyle(undefined, undefined, 2, undefined)).toEqual({ color: undefined, borderWidth: 2 });
  });

  it('omits the border keys for a 0/unset width (no separator)', () => {
    expect(getPieItemStyle(undefined, undefined, 0, '#000000')).toEqual({ color: undefined });
    expect(getPieItemStyle(undefined, undefined, undefined, '#000000')).toEqual({ color: undefined });
  });
});

describe('getPieLabelStyle', () => {
  it('includes the font size when set', () => {
    expect(getPieLabelStyle(theme, { fontSize: 20 })).toMatchObject({ fontSize: 20 });
  });

  it('omits the font size when unset', () => {
    expect(getPieLabelStyle(theme)).not.toHaveProperty('fontSize');
  });

  it('spreads overflow and width when overflow is set', () => {
    expect(getPieLabelStyle(theme, { overflow: 'truncate', width: 120 })).toMatchObject({
      overflow: 'truncate',
      width: 120,
    });
  });

  it('omits overflow/width for none or unset', () => {
    const none = getPieLabelStyle(theme, { overflow: 'none', width: 120 });
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

// --- Advanced (Tier 3) pie option builders ---------------------------------

describe('getPieSelection', () => {
  it('maps "off" (and unset) to selectedMode: false with no offset', () => {
    expect(getPieSelection('off', undefined)).toEqual({ selectedMode: false });
    expect(getPieSelection(undefined, undefined)).toEqual({ selectedMode: false });
  });

  it('emits the mode and offset when a selection mode is chosen', () => {
    expect(getPieSelection('single', 20)).toEqual({ selectedMode: 'single', selectedOffset: 20 });
    expect(getPieSelection('multiple', 12)).toEqual({ selectedMode: 'multiple', selectedOffset: 12 });
  });

  it('omits the offset when it is unset or zero', () => {
    expect(getPieSelection('single', undefined)).toEqual({ selectedMode: 'single' });
    expect(getPieSelection('single', 0)).toEqual({ selectedMode: 'single' });
  });

  it('ignores the offset when the mode is off', () => {
    expect(getPieSelection('off', 20)).toEqual({ selectedMode: false });
  });
});

describe('getPieBorderRadius', () => {
  it('returns the radius when positive', () => {
    expect(getPieBorderRadius(8)).toBe(8);
  });

  it('returns undefined for 0 or unset (square corners, key omitted)', () => {
    expect(getPieBorderRadius(0)).toBeUndefined();
    expect(getPieBorderRadius(undefined)).toBeUndefined();
  });
});

describe('getPieItemStyle', () => {
  it('keeps the slice color and omits borderRadius at the default', () => {
    expect(getPieItemStyle('#111111', undefined)).toEqual({ color: '#111111' });
  });

  it('merges a non-zero borderRadius without clobbering the color', () => {
    expect(getPieItemStyle('#111111', 12)).toEqual({ color: '#111111', borderRadius: 12 });
  });
});

describe('getPieEmphasis', () => {
  it('emits focus + scale when configured', () => {
    expect(getPieEmphasis('self', true)).toEqual({ focus: 'self', scale: true });
  });

  it('omits focus at the "none" default', () => {
    expect(getPieEmphasis('none', undefined)).toBeUndefined();
    expect(getPieEmphasis(undefined, undefined)).toBeUndefined();
  });

  it('emits scale without focus when focus is none', () => {
    expect(getPieEmphasis('none', false)).toEqual({ scale: false });
  });
});

describe('getPieEmptyState', () => {
  it('omits both keys at the ECharts true defaults', () => {
    expect(getPieEmptyState(undefined, undefined)).toEqual({});
    expect(getPieEmptyState(true, true)).toEqual({});
  });

  it('emits only the keys set to false', () => {
    expect(getPieEmptyState(false, undefined)).toEqual({ stillShowZeroSum: false });
    expect(getPieEmptyState(undefined, false)).toEqual({ showEmptyCircle: false });
    expect(getPieEmptyState(false, false)).toEqual({ stillShowZeroSum: false, showEmptyCircle: false });
  });
});

describe('getPieOrientation', () => {
  it('omits both keys at the ECharts true defaults', () => {
    expect(getPieOrientation(undefined, undefined)).toEqual({});
    expect(getPieOrientation(true, true)).toEqual({});
  });

  it('emits only the keys set to false', () => {
    expect(getPieOrientation(false, undefined)).toEqual({ clockwise: false });
    expect(getPieOrientation(undefined, false)).toEqual({ avoidLabelOverlap: false });
  });
});

describe('getPieLabelStyle', () => {
  it('zeroes the text shadow/stroke and uses the theme color by default', () => {
    expect(getPieLabelStyle(theme)).toMatchObject({
      color: theme.colors.text.primary,
      textShadowBlur: 0,
      textShadowColor: 'transparent',
      textBorderWidth: 0,
    });
  });

  it('overrides the theme color with an explicit label color', () => {
    expect(getPieLabelStyle(theme, { color: '#ff0000' })).toMatchObject({ color: '#ff0000' });
    // Unset keeps the theme color.
    expect(getPieLabelStyle(theme)).toMatchObject({ color: theme.colors.text.primary });
  });

  it('re-enables a non-zero text shadow when the switch is on', () => {
    const style = getPieLabelStyle(theme, { textShadow: true });
    expect(style?.textShadowBlur).toBeGreaterThan(0);
    expect(style?.textShadowColor).not.toBe('transparent');
  });

  it('re-enables a non-zero text stroke when the switch is on', () => {
    const style = getPieLabelStyle(theme, { textStroke: true });
    expect(style?.textBorderWidth).toBeGreaterThan(0);
  });
});
