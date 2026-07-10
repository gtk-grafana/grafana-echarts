import { formattedValueToString, type GrafanaTheme2, type TimeRange, type ValueFormatter } from '@grafana/data';
import { type ECBasicOption } from 'echarts/types/dist/shared';
import {
  type AxisLabelValueFormatter,
  type NumericAxisBaseOptionCommon,
  TimeAxisBaseOption,
} from 'echarts/types/src/coord/axisCommonTypes';
import { type CartesianAxisOption } from 'echarts/types/src/coord/cartesian/AxisModel';
import { AXIS_FONT_SIZE, createBaseOptions } from 'lib/echarts/options/base';

/**
 * Pin an ECharts `time` axis to the dashboard time range so panels with gappy
 * data still span the full window and line up with sibling panels in the
 * dashboard. Bounds are epoch milliseconds, which is what a `time` axis expects.
 * https://echarts.apache.org/en/option.html#xAxis.min
 */
export function getTimeAxisBounds(timeRange: TimeRange): { min: number; max: number } {
  return { min: timeRange.from.valueOf(), max: timeRange.to.valueOf() };
}

/** uPlot-style grid line color for cartesian axes. */
export function getUPlotGridColor(theme: GrafanaTheme2): string {
  return theme.isDark ? 'rgba(240, 250, 255, 0.09)' : 'rgba(0, 10, 23, 0.09)';
}

/**
 * Axis + grid styling that mirrors Core Grafana's uPlot time series panels.
 */
export function getCartesianAxisStyle(theme: GrafanaTheme2) {
  const gridColor = getUPlotGridColor(theme);

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

/** Merge base axis config with theme styling and optional extras. */
export function mergeAxisStyle(
  baseAxis: CartesianAxisOption | TimeAxisBaseOption,
  axisStyle: CartesianAxisOption | TimeAxisBaseOption,
  extras?: CartesianAxisOption | TimeAxisBaseOption,
  grafanaValueFormatter?: ValueFormatter
): NumericAxisBaseOptionCommon | CartesianAxisOption {
  const extraAxisLabel = extras?.axisLabel ?? {};
  const extraAxisTick = extras?.axisTick ?? {};
  const extraSplitLine = extras?.splitLine ?? {};

  // Only attach a formatter when a Grafana value formatter is supplied. Axes
  // without one (e.g. the time x-axis) must keep ECharts' default formatter
  // https://echarts.apache.org/en/option.html#yAxis.axisLabel.formatter
  const formatter: AxisLabelValueFormatter | undefined = grafanaValueFormatter
    ? (value) => formattedValueToString(grafanaValueFormatter(value))
    : undefined;

  return {
    ...baseAxis,
    ...axisStyle,
    ...extras,
    axisLabel: {
      ...axisStyle.axisLabel,
      ...extraAxisLabel,
      ...(formatter ? { formatter } : {}),
    },
    axisTick: { ...axisStyle.axisTick, ...extraAxisTick },
    splitLine: { ...axisStyle.splitLine, ...extraSplitLine },
    // @todo need to figure out the types
  } as CartesianAxisOption;
}

/**
 * Shared base option for cartesian time series charts (line, bar, scatter).
 * Tooltip and grid are merged at render time.
 */
export const cartesianTimeDefaultOptions: ECBasicOption & { xAxis: CartesianAxisOption } & {
  yAxis: CartesianAxisOption;
} = {
  ...createBaseOptions(),
  xAxis: {
    type: 'time',
    tooltip: { show: true },
    alignTicks: true,
  },
  yAxis: {
    type: 'value',
    // `scale: true` auto-fits the axis to the data's min/max
    // https://echarts.apache.org/en/option.html#yAxis.scale
    scale: true,
  },
};

/**
 * Shared base option for category-axis cartesian charts (Group 2: category
 * bar/line built from Numeric frames). Same value y-axis as the time variant,
 * but the x-axis is `category` and its labels (`data`) are supplied at render
 * time from the categorical model. Tooltip and grid are merged at render time.
 * See https://echarts.apache.org/en/option.html#xAxis.type
 */
export const cartesianCategoryDefaultOptions: ECBasicOption & { xAxis: CartesianAxisOption } & {
  yAxis: CartesianAxisOption;
} = {
  ...createBaseOptions(),
  xAxis: {
    type: 'category',
  },
  yAxis: {
    type: 'value',
    // See cartesianTimeDefaultOptions above: fit to data min/max, don't force zero.
    // https://echarts.apache.org/en/option.html#yAxis.scale
    scale: true,
  },
};
