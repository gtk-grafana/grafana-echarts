import { TooltipAnchor, TooltipSize } from './types';

/** Gap (px) between the cursor and the tooltip box, and from the viewport edge. */
const TOOLTIP_CURSOR_OFFSET = 12;
const TOOLTIP_VIEWPORT_MARGIN = 8;

/**
 * Position the tooltip box relative to the cursor, mirroring Core Grafana's uPlot tooltip.
 */
export function computeTooltipPosition(
  anchor: TooltipAnchor,
  size: TooltipSize,
  viewport: TooltipSize
): { left: number; top: number } {
  let left = anchor.x - size.width - TOOLTIP_CURSOR_OFFSET;
  let top = anchor.y + TOOLTIP_CURSOR_OFFSET;

  if (left < TOOLTIP_VIEWPORT_MARGIN) {
    left = anchor.x + TOOLTIP_CURSOR_OFFSET;
  }

  if (top + size.height > viewport.height - TOOLTIP_VIEWPORT_MARGIN) {
    top = anchor.y - size.height - TOOLTIP_CURSOR_OFFSET;
  }

  left = Math.max(TOOLTIP_VIEWPORT_MARGIN, Math.min(left, viewport.width - size.width - TOOLTIP_VIEWPORT_MARGIN));
  top = Math.max(TOOLTIP_VIEWPORT_MARGIN, Math.min(top, viewport.height - size.height - TOOLTIP_VIEWPORT_MARGIN));

  return { left, top };
}
