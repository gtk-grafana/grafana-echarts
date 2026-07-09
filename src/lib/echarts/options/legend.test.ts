import { createTheme } from '@grafana/data';
import { LegendDisplayMode, type VizLegendOptions } from '@grafana/schema';
import { cartesianChartModule } from 'lib/echarts/charts/cartesian';
import {
  DEFAULT_CHART_LEGEND,
  getLegendOption,
  isLegendVisible,
  resolveLegendOptions,
} from 'lib/echarts/options/legend';
import { type PanelOptions } from 'types';

const theme = createTheme();

const legend = (overrides: Partial<VizLegendOptions> = {}): VizLegendOptions => ({
  showLegend: true,
  displayMode: LegendDisplayMode.List,
  placement: 'bottom',
  calcs: [],
  ...overrides,
});

describe('isLegendVisible', () => {
  it('is false when undefined, hidden, showLegend is false, or isVisible is false', () => {
    expect(isLegendVisible(undefined)).toBe(false);
    expect(isLegendVisible(legend({ showLegend: false }))).toBe(false);
    expect(isLegendVisible(legend({ isVisible: false }))).toBe(false);
  });

  it('is true for a visible list legend', () => {
    expect(isLegendVisible(legend())).toBe(true);
  });
});

describe('resolveLegendOptions', () => {
  it('merges module defaults with user options, user wins', () => {
    const options = {
      legend: { placement: 'right' as const, width: 300 },
    } as PanelOptions;

    const resolved = resolveLegendOptions(cartesianChartModule, options);

    expect(resolved.placement).toBe('right');
    expect(resolved.width).toBe(300);
    expect(resolved.displayMode).toBe(DEFAULT_CHART_LEGEND.displayMode);
  });

  it('uses module calcs when user omits them', () => {
    const module = { ...cartesianChartModule, legend: { ...DEFAULT_CHART_LEGEND, calcs: ['lastNotNull'] } };
    const options = { legend: { placement: 'bottom' as const } } as PanelOptions;

    expect(resolveLegendOptions(module, options).calcs).toEqual(['lastNotNull']);
  });

  it('prefers user calcs over module defaults', () => {
    const module = { ...cartesianChartModule, legend: { ...DEFAULT_CHART_LEGEND, calcs: ['lastNotNull'] } };
    const options = { legend: { calcs: ['mean'], placement: 'bottom' as const } } as PanelOptions;

    expect(resolveLegendOptions(module, options).calcs).toEqual(['mean']);
  });
});

describe('getLegendOption', () => {
  it('hides the legend when not visible', () => {
    expect(getLegendOption(legend({ showLegend: false }), theme)).toEqual({ show: false });
  });

  it('styles text with the theme and places horizontally at the bottom', () => {
    const option = getLegendOption(legend({ placement: 'bottom' }), theme);

    expect(option.show).toBe(true);
    expect(option.orient).toBe('horizontal');
    expect(option.bottom).toBe(0);
    expect(option.textStyle?.color).toBe(theme.colors.text.primary);
    expect(option.textStyle?.fontFamily).toBe(theme.typography.fontFamily);
    expect(option.textStyle?.fontSize).toBe(12);
  });

  it('places vertically on the right for right placement', () => {
    const option = getLegendOption(legend({ placement: 'right' }), theme);

    expect(option.orient).toBe('vertical');
    expect(option.right).toBe(8);
  });

  it('passes explicit item names through as legend data', () => {
    const option = getLegendOption(legend(), theme, ['A', 'B']);

    expect(option.data).toEqual(['A', 'B']);
  });
});
