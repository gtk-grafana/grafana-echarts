import { TooltipDisplayMode } from '@grafana/schema';
import { EChartsAxisType } from 'echarts/axes/converters';
import { ValueFormatter } from 'echarts/style';
import { TooltipOption } from 'echarts/types/dist/shared';
import { OptionDataValue } from 'echarts/types/src/util/types';
import { CrossStyle, EChartsTooltipTrigger } from './eChartsTypes';

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

export function getNoTooltipOption() {
  return { show: false };
}

/**
 *  ECharts axisPointer styled to match Core Grafana's uPlot cursor crosshair.
 *  https://echarts.apache.org/en/option.html#tooltip.axisPointer
 */
export function getCrosshairAxisPointer(): TooltipOption['axisPointer'] {
  const lineStyle: CrossStyle = { color: CROSSHAIR_COLOR, width: 1, type: 'dashed' };
  return {
    show: true,
    type: 'cross',
    // lineStyle is valid when axisPointer.type is 'line'
    // https://echarts.apache.org/en/option.html#tooltip.axisPointer.lineStyle
    lineStyle,
    // crossStyle is valid when axisPointer.type is 'cross'.
    // https://echarts.apache.org/en/option.html#tooltip.axisPointer.crossStyle
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
function formatTooltipValue(eChartValue: OptionDataValue | OptionDataValue[], grafanaFormatValue: ValueFormatter): string {
  const numeric = Array.isArray(eChartValue) ? eChartValue[eChartValue.length - 1] : eChartValue;
  if(typeof numeric === 'number'){
    return grafanaFormatValue(numeric);
  }

  // @todo better defaults
  return eChartValue ? eChartValue.toString() : 'N/A';
}

/**
 * Native ECharts tooltip config. ECharts renders and positions its own tooltip
 * box; we only pick the trigger, style the crosshair to match Grafana, and route
 * values through Grafana's field formatter so units/decimals match the panel.
 * See https://echarts.apache.org/en/option.html#tooltip
 */
export function getTooltipOption(
  trigger: EChartsTooltipTrigger,
  mode: TooltipDisplayMode,
  formatValue: ValueFormatter
): TooltipOption {
  if (mode === TooltipDisplayMode.None) {
    return { show: false };
  }

  // https://echarts.apache.org/en/option.html#tooltip
  return {
    show: true,
    trigger,
    axisPointer: getCrosshairAxisPointer(),
    valueFormatter: (eChartValue: OptionDataValue | OptionDataValue[]) => formatTooltipValue(eChartValue, formatValue),
  };
}
