import { GrafanaTheme2 } from '@grafana/data';
import { getTooltipOption } from 'echarts/options/tooltip';
import { ECBasicOption } from 'echarts/types/dist/shared';

/** Matches Core Grafana's uPlot axis font size (UPLOT_AXIS_FONT_SIZE). */
const AXIS_FONT_SIZE = 12;

/**
 * Axis + grid styling that mirrors Core Grafana's uPlot time series panels, so
 * the cartesian ECharts charts feel native alongside built-in visualizations.
 *
 * Values are taken from `@grafana/ui`'s `UPlotAxisBuilder`:
 * - Grid/tick lines use a faint theme-aware color.
 * - Tick labels use `theme.colors.text.primary` at 12px in the theme font.
 * - No axis baseline (uPlot hides the axis border by default).
 *
 * Returned shape is shared by both the x (time) and y (value) axes; ECharts
 * draws horizontal grid lines from the y axis and vertical ones from the x axis,
 * matching uPlot which shows both.
 */
export function getCartesianAxisStyle(theme: GrafanaTheme2) {
  const gridColor = theme.isDark ? 'rgba(240, 250, 255, 0.09)' : 'rgba(0, 10, 23, 0.09)';

  return {
    axisLine: { show: false },
    axisTick: { show: true, length: 4, lineStyle: { color: gridColor } },
    axisLabel: {
      color: theme.colors.text.primary,
      fontFamily: theme.typography.fontFamily,
      fontSize: AXIS_FONT_SIZE,
    },
    splitLine: { show: true, lineStyle: { color: gridColor } },
  };
}

/**
 * Shared base option for cartesian time series charts (line, bar, scatter,
 * effectScatter). Pairs a `time` xAxis with a `value` yAxis so the converter's
 * `[time, value]` series data renders directly.
 */
export const cartesianTimeDefaultOptions: ECBasicOption = {
  animationDuration: 300,

  // https://echarts.apache.org/en/option.html#grid
  grid: {
    top: 'top',
    left: 'left',
    bottom: '5%',
  },

  // https://echarts.apache.org/en/option.html#tooltip
  // Transparent box that keeps ECharts' axis pointer + positioning while the
  // Grafana React tooltip (see EChartsTooltip) renders the content.
  tooltip: getTooltipOption('axis'),

  // https://echarts.apache.org/en/option.html#xAxis
  xAxis: {
    type: 'time',
    tooltip: {
      show: true,
    },
    alignTicks: true,
  },

  // https://echarts.apache.org/en/option.html#yAxis
  yAxis: {
    type: 'value',
  },
};
