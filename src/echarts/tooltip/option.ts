import { TooltipDisplayMode } from '@grafana/schema';
import { EChartsAxisType } from 'echarts/axes/converters';
import { ValueFormatter } from 'echarts/style';
import { EChartsTooltipTrigger } from './eChartsTypes';

/** Crosshair line color from Core Grafana's uPlot panels. */
const CROSSHAIR_COLOR = 'rgba(120, 120, 130, 0.5)';

/**
 * Pick the ECharts tooltip trigger for the chart's axis type and Grafana tooltip mode.
 * https://echarts.apache.org/en/option.html#tooltip.trigger
 */
export function grafanaTooltipModeToEChartsTrigger(
  axisType: EChartsAxisType,
  mode: TooltipDisplayMode
): EChartsTooltipTrigger {
  if (mode === TooltipDisplayMode.None) {
    return 'none';
  }

  // Categorical axes have no shared axis, so only per-item hover works.
  if (axisType === 'category') {
    return 'item';
  }

  // On cartesian axes, "All series" shows every series at the hovered x (axis),
  // while "Single" shows just the hovered point (item).
  return mode === TooltipDisplayMode.Multi ? 'axis' : 'item';
}

/**
 *  ECharts axisPointer styled to match Core Grafana's uPlot cursor crosshair.
 *  https://echarts.apache.org/en/option.html#tooltip.axisPointer
 */
export function getCrosshairAxisPointer() {
  const lineStyle = { color: CROSSHAIR_COLOR, width: 1, type: 'dashed' };
  return {
    show: true,
    type: 'cross',
    lineStyle,
    crossStyle: lineStyle,
    label: { show: false },
  };
}

/**
 * Format a raw ECharts tooltip value with Grafana's field formatter. ECharts
 * hands `tooltip.valueFormatter` the series' raw data item, which is a bare
 * scalar (pie) or an array whose trailing element is the numeric value we care
 * about (cartesian `[time, value]`, heatmap `[..., value]`).
 * See https://echarts.apache.org/en/option.html#tooltip.valueFormatter
 */
function formatTooltipValue(value: unknown, formatValue: ValueFormatter): string {
  const numeric = Array.isArray(value) ? value[value.length - 1] : value;
  return formatValue(typeof numeric === 'number' ? numeric : null);
}

/**
 * Native ECharts tooltip config. ECharts renders and positions its own tooltip
 * box; we only pick the trigger, style the crosshair to match Grafana, and route
 * values through Grafana's field formatter so units/decimals match the panel.
 * See https://echarts.apache.org/en/option.html#tooltip
 */
export function getTooltipOption(trigger: EChartsTooltipTrigger, mode: TooltipDisplayMode, formatValue: ValueFormatter) {
  if (mode === TooltipDisplayMode.None) {
    return { show: false };
  }

  // https://echarts.apache.org/en/option.html#tooltip
  return {
    show: true,
    trigger,
    axisPointer: getCrosshairAxisPointer(),
    valueFormatter: (value: unknown) => formatTooltipValue(value, formatValue),
  };
}
