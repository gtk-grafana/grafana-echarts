import { type GrafanaTheme2 } from '@grafana/data';
import { getThemeTextStyle } from 'lib/echarts/options/base';

/**
 * Shared themed-label helpers, hoisted from the part-to-whole (pie) options so
 * the cartesian and radar families can style their labels identically. ECharts'
 * default series label draws a blurred drop shadow and a contrast stroke in its
 * own font; these helpers apply the Grafana theme and zero those out so labels
 * match the rest of Grafana, with opt-in switches to re-enable each.
 */

/**
 * Label overflow handling, mirroring ECharts `label.overflow`: `none` (no
 * handling — the default), `truncate` (ellipsis at `width`), `break` (wrap at
 * word boundaries), `breakAll` (wrap at any character). `none` is treated as
 * unset so no key is written. Aliased per family (e.g. `PieLabelOverflow`).
 * https://echarts.apache.org/en/option.html#series-pie.label.overflow
 */
export type LabelOverflow = 'none' | 'truncate' | 'break' | 'breakAll';

/**
 * Themed-label overrides: an explicit `color` (overriding the theme text color)
 * and switches that re-enable the ECharts label text shadow / stroke this helper
 * zeroes by default, plus the legibility overrides (font size, overflow, width).
 */
export interface ThemedLabelStyleOptions {
  /** Override the theme text color. */
  color?: string;
  /** Re-enable the label drop shadow. */
  textShadow?: boolean;
  /** Re-enable the label contrast stroke. */
  textStroke?: boolean;
  /** Override the theme label font size. */
  fontSize?: number;
  /** Label overflow handling; `none` is treated as unset. */
  overflow?: LabelOverflow;
  /** Label wrap/clip width in px, paired with `overflow`. */
  width?: number;
}

/** Re-enabled label text-shadow blur radius (px) when the shadow switch is on. */
const LABEL_TEXT_SHADOW_BLUR = 3;
/** Re-enabled label text-stroke width (px) when the stroke switch is on. */
const LABEL_TEXT_BORDER_WIDTH = 2;

/**
 * Themed series label: Grafana's font family and primary text color, with the
 * default ECharts text shadow/stroke zeroed out. Advanced options override this:
 * `color` replaces the theme text color, and the `textShadow` / `textStroke`
 * switches re-enable the zeroed shadow/stroke (drawing a subtle drop shadow /
 * contrast stroke against the panel background). With no options (the default)
 * the output is the flat, theme-colored label. Legibility overrides (font size,
 * overflow/width) are omitted at their defaults so the theme size / no-wrap
 * behavior stands.
 * https://echarts.apache.org/en/option.html#series-pie.label
 */
export function getThemedLabelStyle(theme: GrafanaTheme2, opts: ThemedLabelStyleOptions = {}) {
  const { color, textShadow = false, textStroke = false, fontSize, overflow, width } = opts;
  return {
    ...getThemeTextStyle(theme),
    // An explicit label color overrides the theme text color from getThemeTextStyle.
    ...(color ? { color } : {}),
    // Default: zeroed (flat) shadow/stroke. The switches re-enable each, drawing
    // a subtle drop shadow / contrast stroke against the panel background.
    textShadowBlur: textShadow ? LABEL_TEXT_SHADOW_BLUR : 0,
    textShadowColor: textShadow ? theme.colors.background.canvas : 'transparent',
    textBorderWidth: textStroke ? LABEL_TEXT_BORDER_WIDTH : 0,
    ...(textStroke ? { textBorderColor: theme.colors.background.canvas } : {}),
    // Legibility overrides, omitted at the default. `overflow: 'none'` is the
    // ECharts default, so it is treated as unset.
    ...(fontSize ? { fontSize } : {}),
    ...(overflow && overflow !== 'none' ? { overflow } : {}),
    ...(width ? { width } : {}),
  };
}

/**
 * Contrast text color for a label drawn on top of a colored fill (e.g. an
 * `inside` slice label). Wraps Grafana core's `theme.colors.getContrastText` so
 * every family picks the same readable color for a given background.
 */
export function resolveContrastLabelColor(theme: GrafanaTheme2, bgColor: string): string {
  return theme.colors.getContrastText(bgColor);
}
