import { TooltipDisplayMode } from '@grafana/schema';
import { type EChartsAxisType } from 'lib/echarts/axes/converters';
import { type TooltipOption, type TopLevelFormatterParams } from 'echarts/types/dist/shared';
import { type CrossStyle, type EChartsTooltipTrigger } from './eChartsTypes';
import { toEmittingFormatter, type TooltipModel, type TooltipSink } from './model';

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
 * A tooltip config that is functionally active but **visually silent**: ECharts
 * still does hover hit-testing, multi-series ("All") aggregation, and draws the
 * crosshair axisPointer, but the HTML box renders nothing (transparent chrome +
 * empty content). The `formatter` instead converts the hovered `params` into a
 * {@link TooltipModel} and hands it to `sink`, which the React overlay
 * (`EChartsTooltip`) renders with `@grafana/ui`'s `VizTooltip`.
 *
 * This keeps the ECharts tooltip as the hover/aggregation engine while all
 * visible tooltip UI is owned by React — so the option layer stays free of
 * presentation, and the React layer stays free of ECharts (it only consumes the
 * model). Positioning is owned by `VizTooltipContainer`, so no `position` or
 * `appendTo` is set here.
 * See https://echarts.apache.org/en/option.html#tooltip
 */
export function getSilentTooltipOption(
  trigger: EChartsTooltipTrigger,
  mode: TooltipDisplayMode,
  produce: (params: TopLevelFormatterParams) => TooltipModel,
  sink: TooltipSink
): TooltipOption {
  if (mode === TooltipDisplayMode.None) {
    return { show: false };
  }

  // https://echarts.apache.org/en/option.html#tooltip
  return {
    show: true,
    trigger,
    axisPointer: getCrosshairAxisPointer(),
    // Emit the hovered content to React and render nothing native. Returning an
    // empty string with transparent chrome makes the native box invisible.
    // https://echarts.apache.org/en/option.html#tooltip.formatter
    formatter: toEmittingFormatter(produce, sink),
    // Neutralize every visual aspect of the native box; the React overlay draws
    // the real tooltip. `pointer-events: none` keeps the empty box from
    // intercepting hover.
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    borderWidth: 0,
    padding: 0,
    extraCssText: 'box-shadow: none; pointer-events: none;',
  };
}
