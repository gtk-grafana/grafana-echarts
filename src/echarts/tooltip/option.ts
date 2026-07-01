import { GrafanaTheme2 } from '@grafana/data';
import { TooltipDisplayMode } from '@grafana/schema';
import { EChartsAxisType } from 'echarts/axes/converters';
import { ValueFormatter } from 'echarts/style';
import { TooltipOption } from 'echarts/types/dist/shared';
import { OptionDataValue } from 'echarts/types/src/util/types';
import { convertThemePxToNumeric } from 'grafana/converters/theme';
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
function formatTooltipValue(
  eChartValue: OptionDataValue | OptionDataValue[],
  grafanaFormatValue: ValueFormatter
): string {
  const numeric = Array.isArray(eChartValue) ? eChartValue[eChartValue.length - 1] : eChartValue;
  if (typeof numeric === 'number') {
    return grafanaFormatValue(numeric);
  }

  // @todo better defaults
  return eChartValue ? eChartValue.toString() : 'N/A';
}

/** Gap (px) between the cursor and the tooltip so it never sits under the pointer. */
const TOOLTIP_CURSOR_GAP = 10;

/**
 * Position the portaled tooltip next to the cursor, flipping at the chart's
 * right/bottom edges so it stays inside the view. Returned coords are
 * chart-local; ECharts transforms them into the `appendTo` container.
 * See https://echarts.apache.org/en/option.html#tooltip.position
 */
const getTooltipPosition: NonNullable<TooltipOption['position']> = (point, _params, _dom, _rect, size) => {
  const [cursorX, cursorY] = point;
  const [tooltipWidth, tooltipHeight] = size.contentSize;
  const [viewWidth, viewHeight] = size.viewSize;

  const x = cursorX + TOOLTIP_CURSOR_GAP + tooltipWidth > viewWidth
      ? cursorX - tooltipWidth - TOOLTIP_CURSOR_GAP
      : cursorX + TOOLTIP_CURSOR_GAP;
  const y = cursorY + TOOLTIP_CURSOR_GAP + tooltipHeight > viewHeight
      ? cursorY - tooltipHeight - TOOLTIP_CURSOR_GAP
      : cursorY + TOOLTIP_CURSOR_GAP;

  // Keep the tooltip inside the chart view after flipping (avoids negative coords
  // when portaled to document.body).
  return {
    left: Math.max(0, Math.min(x, viewWidth - tooltipWidth)),
    top: Math.max(0, Math.min(y, viewHeight - tooltipHeight)),
  };
};

/**
 * Native ECharts tooltip config.
 * Translates Grafana theme into supported eCharts styles
 * See https://echarts.apache.org/en/option.html#tooltip
 */
export function getTooltipOption(
  trigger: EChartsTooltipTrigger,
  mode: TooltipDisplayMode,
  grafanaValueFormatter: ValueFormatter,
  grafanaTheme: GrafanaTheme2
): TooltipOption {
  if (mode === TooltipDisplayMode.None) {
    return { show: false };
  }

  // https://echarts.apache.org/en/option.html#tooltip
  return {
    show: true,
    // https://echarts.apache.org/en/option.html#grid.tooltip.position
    position: getTooltipPosition,
    trigger,
    axisPointer: getCrosshairAxisPointer(),
    // Portal the tooltip out of the panel container.
    // We use the body instead of the grafana portal container because the zero-height fixed position Grafana portal
    // doesn't work with the absolutely positioned eCharts tooltip
    // https://echarts.apache.org/en/option.html#tooltip.appendTo
    appendTo: document.body,
    // https://echarts.apache.org/en/option.html#grid.tooltip.formatter
    // formatter allows tooltip templates/ custom HTML, requires sanitization!
    // formatter: params => {
    //   console.log('params', params)
    //   return ''
    // },
    // Value formatter passes the values from the eCharts data into the grafana formatValue method
    valueFormatter: (eChartValue: OptionDataValue | OptionDataValue[]) =>
      formatTooltipValue(eChartValue, grafanaValueFormatter),
    // https://echarts.apache.org/en/option.html#grid.tooltip.backgroundColor
    backgroundColor: grafanaTheme.colors.background.elevated,
    //https://echarts.apache.org/en/option.html#tooltip.padding
    padding: convertThemePxToNumeric(grafanaTheme.spacing(1)),
    //https://echarts.apache.org/en/option.html#grid.tooltip.textStyle
    textStyle: {
      fontSize: grafanaTheme.typography.bodySmall.fontSize,
      fontFamily: grafanaTheme.typography.fontFamily,
      color: grafanaTheme.colors.text.primary,
    },
    borderColor: grafanaTheme.colors.border.medium,
    borderRadius: convertThemePxToNumeric(grafanaTheme.shape.radius.default),
    // @todo get from theme?
    borderWidth: 1,
    // CSS for floating layer (e.g. box shadow) rich text so unsanitized strings are vulnerable
    // https://echarts.apache.org/en/option.html#grid.tooltip.extraCssText
    extraCssText: `box-shadow: ${grafanaTheme.shadows.z2};`,
  };
}
