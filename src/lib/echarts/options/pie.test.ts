import { createTheme, type Field, type FieldConfig, FieldType } from '@grafana/data';
import { type CallbackDataParams } from 'echarts/types/dist/shared';
import { type PieLabel } from 'editor/types';
import { type PieSliceModel } from 'lib/echarts/converters/pie';
import { getPieContentLabel, getPieRadius, getPieRoseType } from 'lib/echarts/options/pie';

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
