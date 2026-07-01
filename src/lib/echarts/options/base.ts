import { type GrafanaTheme2 } from '@grafana/data';
import { type ECBasicOption } from 'echarts/types/dist/shared';

/** Shared ECharts animation duration (ms). */
export const ANIMATION_DURATION = 300;

/** Matches Core Grafana's uPlot axis font size. */
export const AXIS_FONT_SIZE = 12;

/** Matches Core Grafana's legend text size. */
export const LEGEND_FONT_SIZE = 12;

/** Theme-aware text style reused by axis, legend, and visualMap labels. */
export function getThemeTextStyle(theme: GrafanaTheme2) {
  return {
    color: theme.colors.text.primary,
    fontFamily: theme.typography.fontFamily,
  };
}

export interface CreateBaseOptionsArgs {
  /** Include an empty legend placeholder (pie/radar). */
  includeLegend?: boolean;
}

/**
 * Static, data-independent base pieces shared across chart families.
 * Tooltip (with the right trigger) and grid are supplied at render time by the panel.
 */
export function createBaseOptions({ includeLegend }: CreateBaseOptionsArgs = {}): Partial<ECBasicOption> {
  return {
    animationDuration: ANIMATION_DURATION,
    ...(includeLegend ? { legend: {} } : {}),
  };
}
