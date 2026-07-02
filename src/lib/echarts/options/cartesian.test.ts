import { createTheme } from '@grafana/data';
import { getCartesianAxisStyle } from 'lib/echarts/options/cartesian';

describe('getCartesianAxisStyle', () => {
  it('uses the dark grid color and theme text/font on a dark theme', () => {
    const theme = createTheme({ colors: { mode: 'dark' } });
    const style = getCartesianAxisStyle(theme);

    expect(style.splitLine.lineStyle.color).toBe('rgba(240, 250, 255, 0.09)');
    expect(style.axisTick.lineStyle.color).toBe('rgba(240, 250, 255, 0.09)');
    expect(style.axisLabel.color).toBe(theme.colors.text.primary);
    expect(style.axisLabel.fontFamily).toBe(theme.typography.fontFamily);
    expect(style.axisLabel.fontSize).toBe(12);
  });

  it('uses the light grid color on a light theme', () => {
    const theme = createTheme({ colors: { mode: 'light' } });
    const style = getCartesianAxisStyle(theme);

    expect(style.splitLine.lineStyle.color).toBe('rgba(0, 10, 23, 0.09)');
  });

  it('hides the axis baseline and shows grid + ticks, matching uPlot defaults', () => {
    const style = getCartesianAxisStyle(createTheme());

    expect(style.axisLine.show).toBe(false);
    expect(style.splitLine.show).toBe(true);
    expect(style.axisTick.show).toBe(true);
    expect(style.axisTick.length).toBe(4);
  });
});
