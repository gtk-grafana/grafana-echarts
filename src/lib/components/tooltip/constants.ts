/** Gap (px) between the cursor and the tooltip; matches core's `TOOLTIP_OFFSET`. */
export const TOOLTIP_OFFSET = { x: 10, y: 10 };

/**
 * Data attribute marking the rendered tooltip DOM. The outside-click dismiss
 * handler uses it to tell a click inside the (pinned) tooltip from one outside.
 */
export const TOOLTIP_MARKER_ATTR = 'data-echarts-tooltip';
