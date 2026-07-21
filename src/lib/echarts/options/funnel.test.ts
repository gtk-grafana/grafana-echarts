import { createTheme, type Field, type FieldConfig, FieldType } from '@grafana/data';
import { type CallbackDataParams } from 'echarts/types/dist/shared';
import { type FunnelLabelPosition, type PieLabel } from 'editor/types';
import { type PieSliceModel } from 'lib/echarts/converters/types';
import {
  getFunnelAlign,
  getFunnelGap,
  getFunnelLabel,
  getFunnelOrient,
  getFunnelSeries,
  getFunnelSize,
} from 'lib/echarts/options/funnel';
import { ADVANCED_FUNNEL_DEFAULTS, applyPartToWholeEditorModeDefaults } from 'lib/echarts/options/pie';
import { type PanelOptions } from 'types';

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

const opts = (extra: Partial<PanelOptions> = {}): PanelOptions => ({ ...extra }) as PanelOptions;

/** Render the label content ECharts would draw for the slice at `index`. */
const renderLabel = (
  labels: PieLabel[] | undefined,
  model: PieSliceModel[],
  index: number,
  position?: FunnelLabelPosition
): string => {
  const label = getFunnelLabel(labels, model, theme, undefined, position);
  const formatter = label?.formatter;
  if (typeof formatter !== 'function') {
    return '';
  }
  return formatter({ dataIndex: index } as CallbackDataParams);
};

describe('getFunnelOrient', () => {
  it('omits the vertical default (undefined, so the key is dropped)', () => {
    expect(getFunnelOrient('vertical')).toBeUndefined();
    expect(getFunnelOrient(undefined)).toBeUndefined();
  });

  it('emits horizontal', () => {
    expect(getFunnelOrient('horizontal')).toBe('horizontal');
  });
});

describe('getFunnelAlign', () => {
  it('omits the center default', () => {
    expect(getFunnelAlign('center')).toBeUndefined();
    expect(getFunnelAlign(undefined)).toBeUndefined();
  });

  it('emits left / right', () => {
    expect(getFunnelAlign('left')).toBe('left');
    expect(getFunnelAlign('right')).toBe('right');
  });
});

describe('getFunnelGap', () => {
  it('returns a positive gap unchanged', () => {
    expect(getFunnelGap(6)).toBe(6);
  });

  it('omits 0/unset (the ECharts default)', () => {
    expect(getFunnelGap(0)).toBeUndefined();
    expect(getFunnelGap(undefined)).toBeUndefined();
  });
});

describe('getFunnelSize', () => {
  it('omits both keys at the ECharts defaults', () => {
    expect(getFunnelSize(undefined, undefined)).toEqual({});
  });

  it('emits minSize / maxSize as percentages when set', () => {
    expect(getFunnelSize(20, undefined)).toEqual({ minSize: '20%' });
    expect(getFunnelSize(undefined, 80)).toEqual({ maxSize: '80%' });
    expect(getFunnelSize(10, 90)).toEqual({ minSize: '10%', maxSize: '90%' });
  });
});

describe('getFunnelLabel', () => {
  it('defaults the position to inside (still shown)', () => {
    expect(getFunnelLabel(['name'], slices(), theme, undefined, undefined)).toMatchObject({
      position: 'inside',
      show: true,
    });
  });

  it('hides the label on an explicit empty selection', () => {
    expect(getFunnelLabel([], slices(), theme, undefined, 'inside')).toMatchObject({ show: false });
  });

  it('reuses the pie Name / Value / Percent content (same lines, same order)', () => {
    const model = slices();
    expect(renderLabel(['name'], model, 0)).toBe('A');
    expect(renderLabel(['value'], model, 0)).toBe('60');
    expect(renderLabel(['percent'], model, 0)).toBe('60%');
    expect(renderLabel(['percent', 'value', 'name'], model, 0)).toBe('A\n60\n60%');
  });

  it('defaults an unset selection to the slice name', () => {
    expect(renderLabel(undefined, slices(), 0)).toBe('A');
  });

  it('threads a non-default position through', () => {
    expect(getFunnelLabel(['name'], slices(), theme, undefined, 'right')).toMatchObject({
      position: 'right',
      show: true,
    });
  });
});

describe('getFunnelSeries', () => {
  it('builds a funnel series from the visible slices', () => {
    const series = getFunnelSeries(slices(), opts(), theme, undefined);
    expect(series.type).toBe('funnel');
    expect(series.data).toHaveLength(3);
  });

  it('fixes min: 0 (proportional widths) and sort: none (keep resolver order)', () => {
    const series = getFunnelSeries(slices(), opts(), theme, undefined);
    expect(series.min).toBe(0);
    expect(series.sort).toBe('none');
  });

  it('colors each slice via the shared pie item style', () => {
    const series = getFunnelSeries([makeSlice('A', 1)], opts(), theme, undefined);
    expect(series.data?.[0]).toMatchObject({ name: 'A', value: 1, itemStyle: { color: '#111111' } });
  });

  it('omits orient / funnelAlign / gap at their ECharts defaults', () => {
    const series = getFunnelSeries(slices(), opts(), theme, undefined);
    expect(series).not.toHaveProperty('orient');
    expect(series).not.toHaveProperty('funnelAlign');
    expect(series).not.toHaveProperty('gap');
  });

  it('emits the layout options when set away from their defaults', () => {
    const series = getFunnelSeries(
      slices(),
      opts({ funnelOrient: 'horizontal', funnelAlign: 'left', funnelGap: 4, funnelMinSize: 10, funnelMaxSize: 90 }),
      theme,
      undefined
    );
    expect(series.orient).toBe('horizontal');
    expect(series.funnelAlign).toBe('left');
    expect(series.gap).toBe(4);
    expect(series.minSize).toBe('10%');
    expect(series.maxSize).toBe('90%');
  });

  it('threads the series zlevel and tooltip when provided', () => {
    const tooltip = { formatter: () => document.createElement('div') };
    const series = getFunnelSeries(slices(), opts(), theme, undefined, { zlevel: 3, tooltip });
    expect(series.zlevel).toBe(3);
    expect(series.tooltip).toBe(tooltip);
  });
});

describe('applyPartToWholeEditorModeDefaults (funnel keys)', () => {
  it('forces funnel advanced options back to their defaults in Default mode', () => {
    const resolved = applyPartToWholeEditorModeDefaults(
      opts({ editorMode: 'default', funnelOrient: 'horizontal', funnelGap: 8, funnelMinSize: 20 })
    );
    expect(resolved.funnelOrient).toBe(ADVANCED_FUNNEL_DEFAULTS.funnelOrient);
    expect(resolved.funnelGap).toBe(ADVANCED_FUNNEL_DEFAULTS.funnelGap);
    // "Unset" defaults clear any stored value.
    expect(resolved.funnelMinSize).toBeUndefined();
  });

  it('passes stored funnel options through untouched in Advanced mode', () => {
    const options = opts({ editorMode: 'advanced', funnelOrient: 'horizontal' });
    expect(applyPartToWholeEditorModeDefaults(options)).toBe(options);
  });
});
