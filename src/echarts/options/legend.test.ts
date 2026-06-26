import { createTheme } from '@grafana/data';
import { LegendDisplayMode, LegendPlacement, VizLegendOptions } from '@grafana/schema';
import { getCartesianGrid, getLegendOption, isLegendVisible } from 'echarts/options/legend';

const theme = createTheme();

const legend = (overrides: Partial<VizLegendOptions> = {}): VizLegendOptions => ({
  showLegend: true,
  displayMode: LegendDisplayMode.List,
  placement: 'bottom',
  calcs: [],
  ...overrides,
});

describe('isLegendVisible', () => {
  it('is false when undefined, hidden, or showLegend is false', () => {
    expect(isLegendVisible(undefined)).toBe(false);
    expect(isLegendVisible(legend({ showLegend: false }))).toBe(false);
    expect(isLegendVisible(legend({ displayMode: LegendDisplayMode.Hidden }))).toBe(false);
  });

  it('is true for a visible list legend', () => {
    expect(isLegendVisible(legend())).toBe(true);
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

describe('getCartesianGrid', () => {
  it('reserves bottom space for a bottom legend', () => {
    expect(getCartesianGrid(legend({ placement: 'bottom' })).bottom).toBe(48);
  });

  it('reserves right space sized to the configured width for a right legend', () => {
    expect(getCartesianGrid(legend({ placement: 'right', width: 200 })).right).toBe(224);
  });

  it('uses default insets when the legend is hidden', () => {
    const grid = getCartesianGrid(legend({ showLegend: false }));

    expect(grid.bottom).toBe(24);
    expect(grid.containLabel).toBe(true);
  });

  it('treats an unknown placement value defensively as bottom', () => {
    const grid = getCartesianGrid(legend({ placement: 'top' as LegendPlacement }));

    expect(grid.bottom).toBe(48);
  });
});
