import { formattedValueToString, type GrafanaTheme2, type TimeRange, type ValueFormatter } from '@grafana/data';
import {
  type BarSeriesOption,
  type EffectScatterSeriesOption,
  type LineSeriesOption,
  type ScatterSeriesOption,
} from 'echarts';
import { type ECBasicOption } from 'echarts/types/dist/shared';
import { type AxisLabelValueFormatter, type TimeAxisBaseOption } from 'echarts/types/src/coord/axisCommonTypes';
import {
  type CartesianAxisOption,
  type XAXisOption,
  type YAXisOption,
} from 'echarts/types/src/coord/cartesian/AxisModel';
import {
  CARTESIAN_ANIMATION_ENABLED_DEFAULT,
  CARTESIAN_BAR_RADIUS_DEFAULT,
  CARTESIAN_BAR_WIDTH_DEFAULT,
  CARTESIAN_FILL_OPACITY_DEFAULT,
  CARTESIAN_LINE_WIDTH_DEFAULT,
  CARTESIAN_POINT_SIZE_DEFAULT,
  CARTESIAN_VALUE_LABEL_POSITION_DEFAULT,
  CARTESIAN_X_TICK_ROTATE_DEFAULT,
} from 'editor/cartesian';
import {
  type CartesianShowValues,
  type CartesianSingleValueSeriesType,
  type CartesianValueLabelPosition,
} from 'editor/types';
import { AXIS_FONT_SIZE, createBaseOptions } from 'lib/echarts/options/base';
import { applyAdvancedDefaults } from 'lib/echarts/options/editorMode';
import { getThemedLabelStyle } from 'lib/echarts/options/labels';
import { type PanelOptions } from 'types';

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

/**
 * Merge base axis config with theme styling and optional extras.
 *
 * Generic over the concrete axis type (`XAXisOption`/`YAXisOption`) so the merged
 * result keeps the discriminated ECharts axis type of the `baseAxis`, letting it
 * assign directly to a composed option's `xAxis`/`yAxis` without a cast.
 */
export function mergeAxisStyle<T extends CartesianAxisOption>(
  baseAxis: T,
  axisStyle: CartesianAxisOption | TimeAxisBaseOption,
  extras?: CartesianAxisOption | TimeAxisBaseOption,
  grafanaValueFormatter?: ValueFormatter
): T {
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
  };
}

/**
 * Shared base option for cartesian time series charts (line, bar, scatter).
 * Tooltip and grid are merged at render time.
 */
export const cartesianTimeDefaultOptions: ECBasicOption & { xAxis: XAXisOption; yAxis: YAXisOption } = {
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
export const cartesianCategoryDefaultOptions: ECBasicOption & { xAxis: XAXisOption; yAxis: YAXisOption } = {
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

/* --- Categorical multi-axis parity uplift: series-level ECharts option builders
 * Each helper follows pie's "omit-at-default" convention: it returns `undefined`
 * / `{}` at the default so an untouched panel's series are byte-for-byte the same
 * as before, and only opted-in options add ECharts keys. */

/**
 * ECharts series `label` for the cartesian "Show values" option. Only `always`
 * draws labels; `auto` / `never` / unset return `undefined` so no label key is
 * written and the chart renders as before (existing panels have no value labels).
 * `position` places them (default `top`); the style is themed via the shared
 * `getThemedLabelStyle` so labels match Grafana.
 * https://echarts.apache.org/en/option.html#series-bar.label
 */
export function getCartesianValueLabel(
  showValues: CartesianShowValues | undefined,
  position: CartesianValueLabelPosition | undefined,
  theme: GrafanaTheme2
) {
  if (showValues !== 'always') {
    return undefined;
  }
  // Return the inferred structural label (not a series-specific `label` type):
  // the `position` values are valid for every cartesian series, but the concrete
  // per-series label types differ (bar carries a `positionExtra`), so a shared
  // structural object assigns to bar and line alike.
  return {
    ...getThemedLabelStyle(theme),
    show: true,
    position: position ?? CARTESIAN_VALUE_LABEL_POSITION_DEFAULT,
  };
}

/**
 * ECharts bar `series.barWidth` from the "Bar width" percentage. `undefined` / 0
 * returns `undefined` so ECharts' auto width stands. Bar series only.
 * https://echarts.apache.org/en/option.html#series-bar.barWidth
 */
export function getBarWidth(barWidth: number | undefined): string | undefined {
  return barWidth != null && barWidth > 0 ? `${barWidth}%` : undefined;
}

/**
 * Bar corner radius (px) from "Bar corner radius". 0/unset returns `undefined`
 * (square corners; key omitted).
 * https://echarts.apache.org/en/option.html#series-bar.itemStyle.borderRadius
 */
export function getBarRadius(barRadius: number | undefined): number | undefined {
  return barRadius != null && barRadius > 0 ? barRadius : undefined;
}

/**
 * Per-series `itemStyle` composing the series color with the bar corner radius.
 * `borderRadius` is omitted at 0/unset so the default item style is unchanged.
 */
export function getCartesianItemStyle(
  color: string | undefined,
  barRadius: number | undefined
): BarSeriesOption['itemStyle'] {
  const radius = getBarRadius(barRadius);
  return { color, ...(radius != null ? { borderRadius: radius } : {}) };
}

/**
 * Per-series `lineStyle` composing the series color with the "Line width". The
 * `width` is omitted at unset/≤0 so ECharts' default stroke stands. Line series.
 * https://echarts.apache.org/en/option.html#series-line.lineStyle.width
 */
export function getCartesianLineStyle(
  color: string | undefined,
  lineWidth: number | undefined
): LineSeriesOption['lineStyle'] {
  return { color, ...(lineWidth != null && lineWidth > 0 ? { width: lineWidth } : {}) };
}

/**
 * ECharts line `series.areaStyle` from "Fill opacity" (0–100 → 0–1). A non-zero
 * value turns a line into an area chart; 0/unset returns `undefined` (a plain
 * line). Line series only.
 * https://echarts.apache.org/en/option.html#series-line.areaStyle
 */
export function getCartesianAreaStyle(fillOpacity: number | undefined): LineSeriesOption['areaStyle'] | undefined {
  return fillOpacity != null && fillOpacity > 0 ? { opacity: Math.min(fillOpacity, 100) / 100 } : undefined;
}

/**
 * ECharts symbol keys from "Point size": `0` hides the points
 * (`showSymbol: false`), a positive value sets `symbolSize`, and unset returns
 * `{}` (ECharts' default symbol). line/scatter series.
 * https://echarts.apache.org/en/option.html#series-line.symbolSize
 */
export function getCartesianSymbol(pointSize: number | undefined): { symbolSize?: number; showSymbol?: boolean } {
  if (pointSize == null) {
    return {};
  }
  return pointSize <= 0 ? { showSymbol: false } : { symbolSize: pointSize };
}

/**
 * ECharts `xAxis.axisLabel.rotate` extra from "X tick rotation". 0/unset returns
 * `{}` so labels stay horizontal (unchanged).
 * https://echarts.apache.org/en/option.html#xAxis.axisLabel.rotate
 */
export function getXTickRotate(xTickRotate: number | undefined): { rotate?: number } {
  return xTickRotate != null && xTickRotate !== 0 ? { rotate: xTickRotate } : {};
}

/** A single cartesian series entry (one render type per member of the union). */
export type CartesianSeriesEntry = BarSeriesOption | LineSeriesOption | ScatterSeriesOption | EffectScatterSeriesOption;

/**
 * The data-independent inputs a converter supplies for one cartesian series: its
 * name, positional `data`, resolved color, canvas `zlevel`, and (bar-only) stack
 * group. `buildCartesianSeries` composes these with the Advanced options.
 */
export interface CartesianSeriesInput {
  name: string;
  data: LineSeriesOption['data'];
  color: string | undefined;
  zlevel: number | undefined;
  stack?: string;
}

/**
 * Build one cartesian series with its Advanced value-label / geometry / style
 * options, dispatching on the resolved render type. Each branch returns a
 * concrete series literal with a literal `type`, so the result assigns to
 * ECharts' discriminated `series` union with no cast (a shared object carrying
 * `barWidth` *and* `areaStyle` could not). Every Advanced key is omitted at its
 * default (see the per-option builders), so an untouched panel emits exactly the
 * color-only series it did before. Shared by both cartesian converters.
 */
export function buildCartesianSeries(
  input: CartesianSeriesInput,
  resolvedType: CartesianSingleValueSeriesType,
  options: PanelOptions,
  theme: GrafanaTheme2
): CartesianSeriesEntry {
  const { name, data, color, zlevel, stack } = input;
  const label = getCartesianValueLabel(options.showValues, options.valueLabelPosition, theme);
  const symbol = getCartesianSymbol(options.pointSize);
  // Common (non-discriminating) props every branch shares.
  const common = { name, data, zlevel, ...(stack ? { stack } : {}), ...(label ? { label } : {}) };
  const barWidth = getBarWidth(options.barWidth);

  switch (resolvedType) {
    case 'bar':
      // Bars have no `lineStyle`; color rides on `itemStyle` (with corner radius).
      return {
        ...common,
        type: 'bar',
        itemStyle: getCartesianItemStyle(color, options.barRadius),
        ...(barWidth ? { barWidth } : {}),
      };
    case 'line': {
      const areaStyle = getCartesianAreaStyle(options.fillOpacity);
      return {
        ...common,
        type: 'line',
        itemStyle: { color },
        lineStyle: getCartesianLineStyle(color, options.lineWidth),
        ...(areaStyle ? { areaStyle } : {}),
        ...symbol,
      };
    }
    case 'scatter':
      return { ...common, type: 'scatter', itemStyle: { color }, ...symbol };
    case 'effectScatter':
      return { ...common, type: 'effectScatter', itemStyle: { color }, showEffectOn: 'emphasis', ...symbol };
  }
}

/**
 * Default values for every Advanced-gated cartesian option, keyed by its
 * `PanelOptions` path. Spread over the stored options in Default editor mode (see
 * `applyCartesianEditorModeDefaults`) so a panel with Advanced values configured
 * and then hidden renders exactly like an untouched cartesian panel. The
 * Default-tier `showValues` is intentionally absent (it is never hidden, so it is
 * not reset). `animation` is included (the shared `@internal animation.enabled`)
 * so Default mode restores animation too. Mirrors `ADVANCED_PIE_DEFAULTS`.
 */
export const ADVANCED_CARTESIAN_DEFAULTS: Partial<PanelOptions> = {
  valueLabelPosition: CARTESIAN_VALUE_LABEL_POSITION_DEFAULT,
  barWidth: CARTESIAN_BAR_WIDTH_DEFAULT,
  barRadius: CARTESIAN_BAR_RADIUS_DEFAULT,
  lineWidth: CARTESIAN_LINE_WIDTH_DEFAULT,
  fillOpacity: CARTESIAN_FILL_OPACITY_DEFAULT,
  pointSize: CARTESIAN_POINT_SIZE_DEFAULT,
  xTickRotate: CARTESIAN_X_TICK_ROTATE_DEFAULT,
  animation: { enabled: CARTESIAN_ANIMATION_ENABLED_DEFAULT },
};

/**
 * Normalize a cartesian panel's options for rendering by editor mode: Default
 * mode spreads `ADVANCED_CARTESIAN_DEFAULTS` over them so hidden Advanced values
 * don't affect the render; Advanced / API mode passes them through. Registered in
 * the `editorMode.ts` dispatch for every cartesian render type.
 */
export function applyCartesianEditorModeDefaults(options: PanelOptions): PanelOptions {
  return applyAdvancedDefaults(options, ADVANCED_CARTESIAN_DEFAULTS);
}
