import { createTheme, type Field, type FieldConfig, FieldType } from '@grafana/data';
import { type CallbackDataParams } from 'echarts/types/dist/shared';
import { type PieLabel } from 'editor/types';
import { type PieSliceModel } from 'lib/echarts/converters/pie';
import {
  getPieBorderRadius,
  getPieContentLabel,
  getPieEmphasis,
  getPieEmptyState,
  getPieItemStyle,
  getPieLabelStyle,
  getPieOrientation,
  getPieRadius,
  getPieSelection,
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
const renderLabel = (labels: PieLabel[] | undefined, model: PieSliceModel[], index: number): string => {
  const label = getPieContentLabel(labels, model, theme);
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
    expect(getPieLabelStyle(theme, undefined, '#ff0000')).toMatchObject({ color: '#ff0000' });
    // Unset keeps the theme color.
    expect(getPieLabelStyle(theme, undefined, undefined)).toMatchObject({ color: theme.colors.text.primary });
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
