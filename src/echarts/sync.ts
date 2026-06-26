import { DashboardCursorSync, DataHoverPayload } from '@grafana/data';

/**
 * Shared crosshair / tooltip sync, mirroring Core Grafana's uPlot panels.
 *
 * Panels exchange the hovered x value (time) over the dashboard event bus
 * (`DataHoverEvent` / `DataHoverClearEvent`). The dashboard's "Graph tooltip"
 * setting (`DashboardCursorSync`) decides whether a received hover only moves
 * the crosshair (`Crosshair`) or also shows the tooltip (`Tooltip`).
 *
 * The payload shape matches `@grafana/ui`'s `EventBusPlugin`, so an ECharts
 * panel stays interoperable with native uPlot panels on the same dashboard.
 */

/**
 * Throttle interval (ms) for publishing hover events. Matches Core Grafana's
 * uPlot `EventBusPlugin`, keeping the bus quiet during fast mouse moves so a
 * dashboard full of synced panels stays responsive.
 */
export const HOVER_THROTTLE_MS = 100;

/** Read the hovered x value (time in ms) from a hover payload, or null. */
export function getHoverTime(payload: DataHoverPayload | undefined): number | null {
  const time = payload?.point?.time;
  return typeof time === 'number' && Number.isFinite(time) ? time : null;
}

/** A received hover updates the crosshair in both Crosshair and Tooltip modes. */
export function shouldApplyCrosshair(mode: DashboardCursorSync): boolean {
  return mode === DashboardCursorSync.Crosshair || mode === DashboardCursorSync.Tooltip;
}

/** The synced tooltip box is only shown in Tooltip mode (Crosshair = line only). */
export function shouldShowSyncedTooltip(mode: DashboardCursorSync): boolean {
  return mode === DashboardCursorSync.Tooltip;
}

/** A throttled callback handle: `run` requests an invocation, `cancel` clears any pending one. */
export interface Throttled {
  run: () => void;
  cancel: () => void;
}

/**
 * Leading + trailing throttle: the first call fires immediately, subsequent
 * calls within `wait` are coalesced into a single trailing invocation. The
 * callback closes over a mutable payload, so the trailing call always publishes
 * the latest hover position without allocating per move.
 */
export function throttle(fn: () => void, wait: number): Throttled {
  let last = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const invoke = () => {
    last = Date.now();
    fn();
  };

  return {
    run() {
      const remaining = wait - (Date.now() - last);
      if (remaining <= 0) {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        invoke();
      } else if (timer == null) {
        timer = setTimeout(() => {
          timer = null;
          invoke();
        }, remaining);
      }
    },
    cancel() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}
