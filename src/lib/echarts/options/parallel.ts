import { type ParallelComponentOption, type ParallelSeriesOption } from 'echarts';
import { type ECBasicOption } from 'echarts/types/dist/shared';
import {
  PARALLEL_ANIMATION_ENABLED_DEFAULT,
  PARALLEL_LAYOUT_DEFAULT,
  PARALLEL_LINE_OPACITY_DEFAULT,
  PARALLEL_LINE_WIDTH_DEFAULT,
} from 'editor/parallel';
import { type ParallelLayout } from 'editor/types';
import { createBaseOptions } from 'lib/echarts/options/base';
import { applyAdvancedDefaults } from 'lib/echarts/options/editorMode';
import { type PanelOptions } from 'types';

/** Base option for parallel-coordinates charts. Axes and series data are merged at render time. */
export const parallelDefaultOptions: ECBasicOption = {
  ...createBaseOptions({ includeLegend: true }),
};

/* --- Parallel option builders ------------------------------------------------
 * Each helper omits its ECharts key at the default so an untouched parallel chart
 * renders on ECharts' own defaults, and only opted-in options add keys. */

/**
 * The ECharts `parallel` coordinate component from the Advanced "Layout". Only
 * the `vertical` layout writes a key; `horizontal` (the ECharts default) returns
 * an empty component so the default left-to-right layout stands.
 * https://echarts.apache.org/en/option.html#parallel.layout
 */
export function getParallelComponent(layout: ParallelLayout | undefined): ParallelComponentOption {
  return layout === 'vertical' ? { layout: 'vertical' } : {};
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
