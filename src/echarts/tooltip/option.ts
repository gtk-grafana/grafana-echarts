import { TooltipDisplayMode } from '@grafana/schema';
import { ValueFormatter } from 'echarts/style';
import { EChartsTooltipTrigger, TooltipKind } from './types';

/** Crosshair line color from Core Grafana's uPlot panels. */
const CROSSHAIR_COLOR = 'rgba(120, 120, 130, 0.5)';

/**
 * Pick the ECharts tooltip trigger for the active series kind and tooltip mode.
 */
export function tooltipTriggerForMode(kind: TooltipKind, mode: TooltipDisplayMode): EChartsTooltipTrigger {
  if (kind === 'timeseries') {
    return mode === TooltipDisplayMode.Single ? 'item' : 'axis';
  }
  return 'item';
}

/** ECharts axisPointer styled to match Core Grafana's uPlot cursor crosshair. */
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

  return {
    show: true,
    trigger,
    axisPointer: getCrosshairAxisPointer(),
    valueFormatter: (value: unknown) => formatTooltipValue(value, formatValue),
  };
}
