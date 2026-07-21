import { type EChartsType } from 'lib/echarts/echarts';
import { type TooltipModel, type TooltipSink } from 'lib/echarts/tooltip/model';
import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';

/**
 * How long (ms) an item-triggered tooltip lingers after the cursor leaves its
 * element before hiding. A short grace period prevents a flicker-to-hidden when
 * the cursor crosses the gap between two adjacent items (the next item's hover
 * cancels the pending hide). Mirrors core Grafana's ~100ms un-render defer in
 * `TooltipPlugin2`.
 */
const HIDE_DELAY_MS = 120;

/** Gap (px) between the cursor and the tooltip; matches core's `TOOLTIP_OFFSET`. */
export const TOOLTIP_OFFSET = { x: 10, y: 10 };

/**
 * Data attribute marking the rendered tooltip DOM. The outside-click dismiss
 * handler uses it to tell a click inside the (pinned) tooltip from one outside.
 */
export const TOOLTIP_MARKER_ATTR = 'data-echarts-tooltip';

export interface EChartsTooltipState {
  /** The hovered content, or `null` when nothing is hovered. */
  model: TooltipModel | null;
  /** Cursor position in window coordinates (for `VizTooltipContainer`). */
  position: { x: number; y: number } | null;
  visible: boolean;
  /** Whether the user has click-to-pinned the tooltip (freezes content, enables interaction). */
  pinned: boolean;
}

export interface EChartsTooltipController {
  state: EChartsTooltipState;
  /** Stable sink passed into `buildPanelChartOption`; receives hovered content each move. */
  sink: TooltipSink;
  /** Report the resolved ECharts tooltip `trigger` after each `setOption` (drives hide behavior). */
  reportTrigger: (trigger: string | undefined) => void;
  /** Dismiss a pinned tooltip (used by the overlay's close affordances). */
  dismiss: () => void;
}

const HIDDEN: EChartsTooltipState = { model: null, position: null, visible: false, pinned: false };

/**
 * Bridges ECharts hover into React tooltip state. ECharts' (invisible) tooltip
 * `formatter` pushes the hovered {@link TooltipModel} through {@link
 * EChartsTooltipController.sink}; this hook tracks the cursor (via ZRender mouse
 * events) and show/hide/pin, and exposes the state the `EChartsTooltip` overlay
 * renders. It imports nothing from `@grafana/ui` — presentation lives in the
 * overlay component — keeping the ECharts↔React bridge small.
 *
 * Show/hide model:
 * - `sink` → show (and update content); cancels any pending hide.
 * - ZRender `mousemove` → track cursor position.
 * - `mouseout` → hide after {@link HIDE_DELAY_MS}, but only for item-triggered
 *   tooltips; axis ("All") tooltips persist across the whole grid and hide only
 *   on `globalout`.
 * - ZRender `globalout` (cursor leaves the canvas) → hide immediately.
 * A pinned tooltip ignores all hover updates until dismissed.
 */
export function useEChartsTooltip(
  chart: EChartsType | null,
  containerRef: RefObject<HTMLElement | null>
): EChartsTooltipController {
  const [state, setState] = useState<EChartsTooltipState>(HIDDEN);

  // The live truth, mutated by the high-frequency event handlers and flushed to
  // React state on a single animation frame to avoid a render per mouse move.
  const latestRef = useRef<EChartsTooltipState>(HIDDEN);
  // A boolean gate (not the frame id) so a coalesced flush is tracked correctly
  // even if `requestAnimationFrame` runs its callback synchronously; the id is
  // kept only so it can be cancelled on unmount.
  const flushScheduledRef = useRef(false);
  const rafIdRef = useRef<number | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerRef = useRef<string | undefined>(undefined);

  const flush = useCallback(() => {
    if (flushScheduledRef.current) {
      return;
    }
    flushScheduledRef.current = true;
    rafIdRef.current = requestAnimationFrame(() => {
      flushScheduledRef.current = false;
      rafIdRef.current = null;
      setState(latestRef.current);
    });
  }, []);

  const update = useCallback(
    (patch: Partial<EChartsTooltipState>) => {
      latestRef.current = { ...latestRef.current, ...patch };
      flush();
    },
    [flush]
  );

  const cancelHide = useCallback(() => {
    if (hideTimerRef.current != null) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const sink = useCallback<TooltipSink>(
    (model) => {
      if (latestRef.current.pinned) {
        return;
      }
      cancelHide();
      update({ model, visible: true });
    },
    [cancelHide, update]
  );

  const reportTrigger = useCallback((trigger: string | undefined) => {
    triggerRef.current = trigger;
  }, []);

  const dismiss = useCallback(() => {
    cancelHide();
    update({ pinned: false, visible: false, model: null });
  }, [cancelHide, update]);

  useEffect(() => {
    if (!chart) {
      return;
    }
    const zr = chart.getZr();

    const onMove = (event: { offsetX: number; offsetY: number }) => {
      if (latestRef.current.pinned) {
        return;
      }
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) {
        return;
      }
      update({ position: { x: rect.left + event.offsetX, y: rect.top + event.offsetY } });
    };

    const onGlobalOut = () => {
      if (latestRef.current.pinned) {
        return;
      }
      cancelHide();
      update({ visible: false });
    };

    const onMouseOut = () => {
      if (latestRef.current.pinned) {
        return;
      }
      // Axis-triggered ("All") tooltips stay open across the whole grid; ECharts
      // fires `mouseout` when the cursor leaves each series element, which is not
      // a leave of the tooltip. Only `globalout` hides those.
      if (triggerRef.current === 'axis') {
        return;
      }
      cancelHide();
      hideTimerRef.current = setTimeout(() => {
        hideTimerRef.current = null;
        update({ visible: false });
      }, HIDE_DELAY_MS);
    };

    const onMouseOver = () => {
      if (!latestRef.current.pinned) {
        cancelHide();
      }
    };

    // Click pins the current tooltip (freezes content + position and enables
    // interaction). Unpinning is handled by the outside-click / Escape effect
    // below. Only a click over a shown tooltip pins; a drag still brushes the
    // time axis (ECharts fires `click` only on a press without drag).
    const onClick = () => {
      const cur = latestRef.current;
      if (!cur.pinned && cur.visible && cur.model != null) {
        cancelHide();
        update({ pinned: true });
      }
    };

    zr.on('mousemove', onMove);
    zr.on('globalout', onGlobalOut);
    // ECharts' event typings for element events are permissive; the handlers
    // ignore the params, so cast to the shared handler shape (see the brush
    // handler in EChart.tsx for the same pattern).
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    chart.on('mouseout', onMouseOut as (...args: unknown[]) => void);
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    chart.on('mouseover', onMouseOver as (...args: unknown[]) => void);
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    chart.on('click', onClick as (...args: unknown[]) => void);

    return () => {
      // On unmount EChart disposes the instance in its layout-effect cleanup,
      // which drops zr/instance listeners; guard against a disposed instance.
      // https://echarts.apache.org/en/api.html#echartsInstance.isDisposed
      if (!chart.isDisposed()) {
        zr.off('mousemove', onMove);
        zr.off('globalout', onGlobalOut);
        chart.off('mouseout', onMouseOut);
        chart.off('mouseover', onMouseOver);
        chart.off('click', onClick);
      }
      cancelHide();
      if (rafIdRef.current != null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      flushScheduledRef.current = false;
    };
  }, [chart, containerRef, cancelHide, update]);

  // While pinned, dismiss on a click outside the tooltip or on Escape. Clicks
  // inside the tooltip (data links, ad-hoc filter buttons) are ignored so the
  // pinned tooltip stays interactive.
  useEffect(() => {
    if (!state.pinned) {
      return;
    }
    const onDocMouseDown = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest(`[${TOOLTIP_MARKER_ATTR}]`)) {
        return;
      }
      dismiss();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        dismiss();
      }
    };
    // Capture phase so an outside press dismisses before other handlers act on it.
    document.addEventListener('mousedown', onDocMouseDown, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [state.pinned, dismiss]);

  return { state, sink, reportTrigger, dismiss };
}
