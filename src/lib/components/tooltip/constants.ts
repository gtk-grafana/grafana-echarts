/** Gap (px) between the cursor and the tooltip; matches core's `TOOLTIP_OFFSET`. */
export const TOOLTIP_OFFSET = { x: 10, y: 10 };

/**
 * Data attribute marking the rendered tooltip DOM. The outside-click dismiss
 * handler uses it to tell a click inside the (pinned) tooltip from one outside.
 */
export const TOOLTIP_MARKER_ATTR = 'data-echarts-tooltip';

/**
 * Data attribute marking panel chrome that must **not** dismiss a pinned tooltip.
 *
 * Distinct from {@link TOOLTIP_MARKER_ATTR}, which marks the tooltip's own DOM: this is
 * for controls that sit outside it and are operated *while reading it*. The time slider
 * is the case — pressing play or dragging the handle is an outside click, so without
 * this the pin the user set in order to watch a value change is dismissed by the very
 * gesture that starts it changing.
 */
export const TOOLTIP_KEEP_PINNED_ATTR = 'data-echarts-keep-pinned';
