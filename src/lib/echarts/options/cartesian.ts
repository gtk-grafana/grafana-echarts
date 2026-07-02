import { type GrafanaTheme2, type TimeRange } from '@grafana/data';
import { AXIS_FONT_SIZE, createBaseOptions } from 'lib/echarts/options/base';
import { type ECBasicOption } from 'echarts/types/dist/shared';

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

type AxisStyle = ReturnType<typeof getCartesianAxisStyle>;

/** Merge base axis config with theme styling and optional extras. */
export function mergeAxisStyle(
  baseAxis: Record<string, unknown>,
  axisStyle: AxisStyle,
  extras?: Record<string, unknown>,
  valueFormatter?: (value: unknown) => string
) {
  const extraAxisLabel = (extras?.axisLabel ?? {}) as Record<string, unknown>;
  const extraAxisTick = (extras?.axisTick ?? {}) as Record<string, unknown>;
  const extraSplitLine = (extras?.splitLine ?? {}) as Record<string, unknown>;

  return {
    ...baseAxis,
    ...axisStyle,
    ...extras,
    axisLabel: {
      ...axisStyle.axisLabel,
      ...extraAxisLabel,
      ...(valueFormatter ? { formatter: valueFormatter } : {}),
    },
    axisTick: { ...axisStyle.axisTick, ...extraAxisTick },
    splitLine: { ...axisStyle.splitLine, ...extraSplitLine },
  };
}

/**
 * Shared base option for cartesian time series charts (line, bar, scatter).
 * Tooltip and grid are merged at render time.
 */
export const cartesianTimeDefaultOptions: ECBasicOption = {
  ...createBaseOptions(),
  xAxis: {
    type: 'time',
    tooltip: { show: true },
    alignTicks: true,
  },
  yAxis: {
    type: 'value',
  },
};

/**
 * Shared base option for category-axis cartesian charts (Group 2: category
 * bar/line built from Numeric frames). Same value y-axis as the time variant,
 * but the x-axis is `category` and its labels (`data`) are supplied at render
 * time from the categorical model. Tooltip and grid are merged at render time.
 * See https://echarts.apache.org/en/option.html#xAxis.type
 */
export const cartesianCategoryDefaultOptions: ECBasicOption = {
  ...createBaseOptions(),
  xAxis: {
    type: 'category',
  },
  yAxis: {
    type: 'value',
  },
};
