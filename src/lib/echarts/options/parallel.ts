import { type GrafanaTheme2 } from '@grafana/data';
import { type VizLegendOptions } from '@grafana/schema';
import { type ParallelComponentOption, type ParallelSeriesOption } from 'echarts';
import { type ECBasicOption } from 'echarts/types/dist/shared';
import {
  PARALLEL_ANIMATION_ENABLED_DEFAULT,
  PARALLEL_LAYOUT_DEFAULT,
  PARALLEL_LINE_OPACITY_DEFAULT,
  PARALLEL_LINE_WIDTH_DEFAULT,
} from 'editor/parallel';
import { type ParallelLayout } from 'editor/types';
import { AXIS_FONT_SIZE, createBaseOptions, getThemeTextStyle, getUPlotGridColor } from 'lib/echarts/options/base';
import { applyAdvancedDefaults } from 'lib/echarts/options/editorMode';
import { type PanelOptions } from 'types';

/** Base option for parallel-coordinates charts. Axes and series data are merged at render time. */
export const parallelDefaultOptions: ECBasicOption = {
  ...createBaseOptions({ includeLegend: true }),
};

/* --- Parallel option builders ------------------------------------------------
 * Each helper omits its ECharts key at the default so an untouched parallel chart
 * renders on ECharts' own defaults, and only opted-in options add keys. */

/* --- Layout box ---------------------------------------------------------------
 * The `parallel` coordinate system carries its own box instead of a `grid`, and
 * has no `containLabel`, so the room for labels has to be reserved in real px.
 * ECharts' own defaults (80/80/60/60) leave a 400x300 panel drawing into 240x180
 * — 36% of the canvas — which is why a parallel panel looked so much more padded
 * than its cartesian neighbours. The values below were measured off a rendered
 * chart (see `multivariate.canvas.test.tsx`) as the smallest that clip nothing.
 */

/**
 * Horizontal layout — axes run vertically, left to right.
 *
 * `top` holds the axis-name row: ECharts centres each name `nameGap` (15px)
 * above its axis line, putting ~21px of text box above the plot. `left`/`right`
 * cover the outermost names, which are centred *on* their axis and so overhang
 * by half their width; tick labels need nothing, being drawn 8px *inside* each
 * axis. `bottom` is half a tick label's line height.
 */
const HORIZONTAL_BOX = { top: 24, bottom: 12, left: 40, right: 40 };

/**
 * Vertical layout — axes run horizontally, stacked top to bottom.
 *
 * Not a rotation of the above: ECharts draws each name *past the right end* of
 * its axis and left-aligned, so `right` is a name column rather than padding,
 * and undersizing it pushes the names clean off the canvas. Tick labels sit
 * under each axis (centred on their tick), so `bottom` clears the last row and
 * `left` covers half of the first label.
 */
const VERTICAL_BOX = { top: 16, bottom: 20, left: 16, right: 80 };

/** Reserved for a native ECharts legend, matching the cartesian grid's gap. */
const PARALLEL_LEGEND_PADDING = 12;

/**
 * Axis styling for the parallel coordinate system, mirroring
 * `getCartesianAxisStyle` so tick labels read at the same weight as every other
 * panel — ECharts' own default label color is a muted grey that looked washed
 * out beside Grafana's `text.primary`.
 *
 * Two deliberate departures from the cartesian style: the axis line stays
 * *shown*, because on parallel it is the structural spine rather than a
 * redundant edge, and `splitLine` is omitted, because a parallel axis is a
 * single line with no plane to rule.
 */
function getParallelAxisStyle(theme: GrafanaTheme2): NonNullable<ParallelComponentOption['parallelAxisDefault']> {
  const gridColor = getUPlotGridColor(theme);
  const textStyle = { ...getThemeTextStyle(theme), fontSize: AXIS_FONT_SIZE };

  return {
    axisLine: { show: true, lineStyle: { color: theme.colors.border.medium } },
    axisTick: { show: true, length: 4, lineStyle: { color: gridColor } },
    axisLabel: textStyle,
    nameTextStyle: textStyle,
  };
}

/**
 * The ECharts `parallel` coordinate component: the Advanced "Layout" direction,
 * the layout box, and the shared axis styling.
 *
 * Unlike the other parallel builders this one does *not* omit-at-default — it
 * always writes a box and a `parallelAxisDefault`, because ECharts' defaults for
 * both are the bugs being fixed (see the padding constants above and
 * `getParallelAxisStyle`). `parallelAxisDefault` is merged into each
 * `parallelAxis` without overwriting keys the axis sets itself, so per-axis
 * `dim` / `name` / `type` still win.
 *
 * The box is layout-aware — see `HORIZONTAL_BOX` / `VERTICAL_BOX`, which differ
 * by more than orientation.
 * https://echarts.apache.org/en/option.html#parallel.layout
 */
export function getParallelComponent(
  layout: ParallelLayout | undefined,
  theme: GrafanaTheme2,
  legend?: VizLegendOptions
): ParallelComponentOption {
  const isVertical = layout === 'vertical';
  const box = isVertical ? VERTICAL_BOX : HORIZONTAL_BOX;

  return {
    ...(isVertical ? { layout: 'vertical' as const } : {}),
    ...box,
    bottom: box.bottom + (legend?.placement === 'bottom' ? PARALLEL_LEGEND_PADDING : 0),
    right: box.right + (legend?.placement === 'right' ? PARALLEL_LEGEND_PADDING : 0),
    parallelAxisDefault: getParallelAxisStyle(theme),
  };
}

/**
 * ECharts parallel `series.lineStyle` from the Advanced "Line width" and "Line
 * opacity". Width is omitted at unset/≤0 (ECharts' default stroke); opacity is a
 * 0–100 value scaled to ECharts' 0–1 and omitted when unset. Returns `undefined`
 * when neither is set, so no `lineStyle` is written.
 * https://echarts.apache.org/en/option.html#series-parallel.lineStyle
 */
export function getParallelLineStyle(
  lineWidth: number | undefined,
  lineOpacity: number | undefined
): ParallelSeriesOption['lineStyle'] | undefined {
  const lineStyle: NonNullable<ParallelSeriesOption['lineStyle']> = {};
  if (lineWidth != null && lineWidth > 0) {
    lineStyle.width = lineWidth;
  }
  if (lineOpacity != null) {
    lineStyle.opacity = lineOpacity / 100;
  }
  return Object.keys(lineStyle).length > 0 ? lineStyle : undefined;
}

/**
 * Default values for every Advanced-gated parallel option, keyed by its
 * `PanelOptions` path. Spread over the stored options in Default editor mode (see
 * `applyParallelEditorModeDefaults`) so a panel with Advanced values configured
 * and then hidden renders exactly like an untouched parallel chart. The
 * Default-tier `parallelSmooth` is intentionally absent (it is never hidden).
 * `animation` is included so Default mode restores animation too. Mirrors
 * `ADVANCED_RADAR_DEFAULTS`.
 */
export const ADVANCED_PARALLEL_DEFAULTS: Partial<PanelOptions> = {
  parallelLayout: PARALLEL_LAYOUT_DEFAULT,
  parallelLineWidth: PARALLEL_LINE_WIDTH_DEFAULT,
  parallelLineOpacity: PARALLEL_LINE_OPACITY_DEFAULT,
  animation: { enabled: PARALLEL_ANIMATION_ENABLED_DEFAULT },
};

/**
 * Normalize a parallel panel's options for rendering by editor mode: Default mode
 * spreads `ADVANCED_PARALLEL_DEFAULTS` over them so hidden Advanced values don't
 * affect the render; Advanced / API mode passes them through. Registered in the
 * `editorMode.ts` dispatch for the multivariate family.
 */
export function applyParallelEditorModeDefaults(options: PanelOptions): PanelOptions {
  return applyAdvancedDefaults(options, ADVANCED_PARALLEL_DEFAULTS);
}
