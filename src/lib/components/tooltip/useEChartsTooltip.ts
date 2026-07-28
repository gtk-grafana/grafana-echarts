import { type ECElementEvent } from 'echarts/core';
import { type EChartsType } from 'lib/echarts/echarts';
import { findHoveredPoint, type ProximityHit } from 'lib/echarts/tooltip/proximity';
import { type EChartsTooltipTrigger, type TooltipSink } from 'lib/echarts/tooltip/types';
import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';
import { type EChartsTooltipController, type EChartsTooltipOptions, type EChartsTooltipState } from './types';

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

const HIDDEN: EChartsTooltipState = {
  model: null,
  position: null,
  visible: false,
  pinned: false,
  pinnedItem: null,
  activeSeriesIndex: null,
};

/**
 * State written at mouse-move frequency but rendered at most once per animation
 * frame. `latestRef` is the live truth the event handlers read and patch through
 * `update`; `state` is what React renders, set from a coalesced frame so a burst
 * of moves costs one render.
 */
function useRafState<T>(initial: T) {
  const [state, setState] = useState<T>(initial);
  const latestRef = useRef<T>(initial);
  // A boolean gate (not the frame id) so a coalesced flush is tracked correctly
  // even if `requestAnimationFrame` runs its callback synchronously; the id is
  // kept only so it can be cancelled on unmount.
  const flushScheduledRef = useRef(false);
  const rafIdRef = useRef<number | null>(null);

  const update = useCallback((patch: Partial<T>) => {
    latestRef.current = { ...latestRef.current, ...patch };
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

  // Cancelling the pending frame belongs to this hook, not to whichever effect
  // happens to schedule one: an effect that early-returns (as the chart effect
  // does while `chart` is null) would never run its cleanup, leaking a frame
  // scheduled before the chart existed.
  useEffect(
    () => () => {
      if (rafIdRef.current != null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      flushScheduledRef.current = false;
    },
    []
  );

  return { state, latestRef, update };
}

/**
 * While pinned, dismiss on a click outside the tooltip, on Escape, or when the
 * chart scrolls away underneath it. Clicks inside the tooltip (data links,
 * ad-hoc filter buttons) are ignored so the pinned tooltip stays interactive.
 */
function usePinnedDismiss(pinned: boolean, dismiss: () => void, containerRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!pinned) {
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
    // A pinned tooltip is positioned in viewport coordinates, so once the chart
    // scrolls it no longer points at the datapoint it describes. Only scrolls of
    // an *ancestor* of the chart move it: this deliberately ignores scrolling
    // within the tooltip's own content, which stays open (mirrors core's
    // `e.target.contains(plot.root)` test).
    const onScroll = (event: Event) => {
      const target = event.target;
      const container = containerRef.current;
      if (container != null && target instanceof Node && target.contains(container)) {
        dismiss();
      }
    };
    // Capture phase so an outside press dismisses before other handlers act on
    // it, and so scrolls of nested containers (which do not bubble) are seen.
    document.addEventListener('mousedown', onDocMouseDown, true);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown, true);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [pinned, dismiss, containerRef]);
}

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
 * - ZRender `mousemove` → track cursor position, and in proximity mode resolve
 *   which point is hovered (see below).
 * - `mouseout` → hide after {@link HIDE_DELAY_MS}, but only for item-triggered
 *   tooltips; axis ("All") tooltips persist across the whole grid and hide only
 *   on `globalout`. Skipped entirely in proximity mode, where `mousemove` owns
 *   show *and* hide.
 * - ZRender `globalout` (cursor leaves the canvas) → hide immediately.
 * A pinned tooltip ignores all hover updates until dismissed.
 *
 * Proximity mode: when {@link EChartsTooltipOptions.series} is supplied, hover
 * is resolved by {@link findHoveredPoint} instead of ECharts' hit-testing, so
 * the tooltip appears when the cursor is merely *near* a series — core Grafana's
 * behaviour — rather than only when it is on a symbol or the line stroke. The
 * resolved point is replayed into ECharts as a `showTip` action, which runs the
 * usual `tooltip.formatter` and so reaches this hook's `sink` through exactly
 * the same path as a native hover.
 */
export function useEChartsTooltip(
  chart: EChartsType | null,
  containerRef: RefObject<HTMLElement | null>,
  { series, hoverProximity }: EChartsTooltipOptions = {}
): EChartsTooltipController {
  const { state, latestRef, update } = useRafState<EChartsTooltipState>(HIDDEN);

  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerRef = useRef<EChartsTooltipTrigger>(undefined);

  // Proximity inputs are read through a ref so a new `series` array identity (a
  // fresh one is built on every data change) doesn't re-bind the ZRender
  // listeners below.
  const proximityRef = useRef({ series, hoverProximity });
  useEffect(() => {
    proximityRef.current = { series, hoverProximity };
  }, [series, hoverProximity]);

  // The point last replayed into ECharts, so an unchanged hover doesn't
  // re-dispatch. `showTip` re-runs the formatter every time it is called, which
  // would otherwise push an identical model on every mouse move.
  const lastHitRef = useRef<Pick<ProximityHit, 'seriesIndex' | 'dataIndex'> | null>(null);

  // New data invalidates the cached indices — the same `dataIndex` now points at
  // a different point, so the dedupe above must not suppress the next dispatch.
  useEffect(() => {
    lastHitRef.current = null;
  }, [series]);

  // The live cursor and proximity hit, tracked on every move *including while
  // pinned*. A pinned tooltip freezes what it renders, but clicking another
  // point has to re-pin onto that point — which needs where the cursor actually
  // is now, not where the frozen pin sits.
  const livePositionRef = useRef<EChartsTooltipState['position']>(null);
  const liveHitRef = useRef<Pick<ProximityHit, 'seriesIndex' | 'dataIndex'> | null>(null);

  const cancelHide = useCallback(() => {
    if (hideTimerRef.current != null) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  /**
   * Move the emphasised datapoint to `hit` (or clear it), returning whether it
   * actually changed so callers can skip redundant work.
   *
   * ECharts' `highlight` action applies the series' `emphasis` state to that
   * point, which enlarges the symbol in the series colour — and, for a dense
   * line whose symbols aren't rendered, creates one on the fly. That is the
   * marker core draws on the focused point. `downplay` reverts the previous one;
   * without it the emphasis would accumulate across every point hovered.
   */
  const focusPoint = useCallback(
    (hit: Pick<ProximityHit, 'seriesIndex' | 'dataIndex'> | null): boolean => {
      const previous = lastHitRef.current;
      const next = hit == null ? null : { seriesIndex: hit.seriesIndex, dataIndex: hit.dataIndex };
      if (previous?.seriesIndex === next?.seriesIndex && previous?.dataIndex === next?.dataIndex) {
        return false;
      }
      lastHitRef.current = next;

      if (chart != null && !chart.isDisposed()) {
        if (previous != null) {
          chart.dispatchAction({ type: 'downplay', ...previous });
        }
        if (next != null) {
          chart.dispatchAction({ type: 'highlight', ...next });
        }
      }
      update({ activeSeriesIndex: next?.seriesIndex ?? null });
      return true;
    },
    [chart, update]
  );

  const sink = useCallback<TooltipSink>(
    (model) => {
      if (latestRef.current.pinned) {
        return;
      }
      cancelHide();
      update({ model, visible: true });
    },
    [cancelHide, latestRef, update]
  );

  const reportTrigger = useCallback((trigger: EChartsTooltipTrigger) => {
    triggerRef.current = trigger;
  }, []);

  const dismiss = useCallback(() => {
    cancelHide();
    // Drop the emphasis and forget the replayed point, so the next move over the
    // same datapoint re-shows the tooltip instead of being deduped away.
    focusPoint(null);
    update({ pinned: false, pinnedItem: null, visible: false, model: null });
  }, [cancelHide, focusPoint, update]);

  useEffect(() => {
    if (!chart) {
      return;
    }
    const zr = chart.getZr();

    const onMove = (event: { offsetX: number; offsetY: number }) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) {
        return;
      }
      const position = { x: rect.left + event.offsetX, y: rect.top + event.offsetY };
      livePositionRef.current = position;

      const { series: seriesPoints, hoverProximity: proximity } = proximityRef.current;
      // ZRender offsets are already relative to the canvas, which is the
      // coordinate space the chart's pixel conversions use.
      const hit =
        seriesPoints != null && seriesPoints.length > 0
          ? findHoveredPoint(chart, { x: event.offsetX, y: event.offsetY }, seriesPoints, {
              hoverProximity: proximity,
            })
          : null;
      // Only the index pair: `pinnedItem` is built from this, and the proximity
      // `distance` is an internal detail that has no business in tooltip state.
      liveHitRef.current = hit == null ? null : { seriesIndex: hit.seriesIndex, dataIndex: hit.dataIndex };

      // Pinned: content, position and the active point all stay frozen. Only the
      // live refs above keep tracking, so a click can re-pin onto a new point.
      if (latestRef.current.pinned) {
        return;
      }

      update({ position });

      if (seriesPoints == null || seriesPoints.length === 0) {
        // Not a proximity-capable chart; ECharts' own hit-testing drives `sink`.
        return;
      }

      // Axis-triggered ("All") tooltips list every series and are shown/hidden by
      // ECharts itself across the whole grid, so proximity must not drive
      // visibility here — core keeps the All tooltip up even with no series in
      // the focus band. It only decides which row is emphasised.
      const axisTriggered = triggerRef.current === 'axis';

      if (hit == null) {
        focusPoint(null);
        if (axisTriggered) {
          return;
        }
        // Nothing within the focus band. Core shows no Single tooltip here, and
        // hiding immediately (rather than after HIDE_DELAY_MS) is right because
        // the cursor is still inside the plot — there is no gap to bridge.
        cancelHide();
        update({ visible: false });
        return;
      }

      const changed = focusPoint(hit);
      if (axisTriggered || !changed) {
        // Either ECharts owns the content, or the same point is still hovered
        // and the position update above is all that's needed.
        return;
      }
      // Runs `tooltip.formatter` synchronously, so `sink` fires before this
      // returns and shows the tooltip.
      chart.dispatchAction({ type: 'showTip', seriesIndex: hit.seriesIndex, dataIndex: hit.dataIndex });
    };

    const onGlobalOut = () => {
      if (latestRef.current.pinned) {
        return;
      }
      focusPoint(null);
      cancelHide();
      update({ visible: false });
    };

    const inProximityMode = () => {
      const { series: seriesPoints } = proximityRef.current;
      return seriesPoints != null && seriesPoints.length > 0;
    };

    const onMouseOut = () => {
      if (latestRef.current.pinned) {
        return;
      }
      // Without proximity, ECharts' own element hit-testing owns which item is
      // hovered (e.g. bars), so leaving an element clears the active row it drove.
      if (!inProximityMode()) {
        update({ activeSeriesIndex: null });
      }
      // Axis-triggered ("All") tooltips stay open across the whole grid; ECharts
      // fires `mouseout` when the cursor leaves each series element, which is not
      // a leave of the tooltip. Only `globalout` hides those.
      if (triggerRef.current === 'axis') {
        return;
      }
      // In proximity mode `mousemove` decides visibility on every move, so this
      // element-level leave says nothing useful — the cursor has left a symbol
      // but is very likely still within the focus band of the same line.
      if (inProximityMode()) {
        return;
      }
      cancelHide();
      hideTimerRef.current = setTimeout(() => {
        hideTimerRef.current = null;
        update({ visible: false });
      }, HIDE_DELAY_MS);
    };

    const onMouseOver = (params: ECElementEvent) => {
      if (latestRef.current.pinned) {
        return;
      }
      cancelHide();
      // Native hit-testing families (bars, and anything with proximity off) get
      // their active/bold row from the element actually under the cursor, so the
      // hovered item — not the vertically-nearest one — is the one emphasised.
      if (!inProximityMode() && params.seriesIndex != null) {
        update({ activeSeriesIndex: params.seriesIndex });
      }
    };

    // Click pins the current tooltip (freezes content + position and enables
    // interaction). Unpinning is handled by the outside-click / Escape effect
    // below. A drag still brushes the time axis (ZRender only synthesizes
    // `click` on a press without movement).
    //
    // Two click sources cooperate:
    // - the element-level chart `click` carries the clicked item's
    //   `seriesIndex`/`dataIndex`, recorded so the overlay can pick that row's
    //   footer source in "All" tooltips (core's hovered-series footer);
    // - the ZRender canvas `click` catches empty-grid clicks, so an axis
    //   tooltip can be pinned anywhere on the plot.
    // On an element click both fire; whichever runs first pins, and the element
    // handler still records the item on the same tick.
    const pinWith = (pinnedItem: EChartsTooltipState['pinnedItem']) => {
      // In proximity mode the click often lands on empty grid *near* a line, so
      // ECharts reports no element and `pinnedItem` is null — the
      // proximity-focused point is the one the user meant, and pinning it is
      // what lets the footer resolve.
      const target = pinnedItem ?? liveHitRef.current;

      // Re-pin, not just "pin": the previous pin (if any) was dismissed by the
      // outside-click handler on mousedown, so content, position and the active
      // point all have to be rebuilt for the newly clicked item rather than
      // reused. Clearing `pinned` first lets `sink` accept the replayed content.
      latestRef.current = { ...latestRef.current, pinned: false };
      cancelHide();

      // The frozen position belongs to the old pin; the cursor is what the new
      // one should sit beside.
      if (livePositionRef.current != null) {
        update({ position: livePositionRef.current });
      }

      if (target?.seriesIndex != null && !chart.isDisposed()) {
        // Re-asserting the highlight makes the marker owned by the (persistent)
        // action rather than ZRender's element hover, which clears as soon as
        // the cursor leaves the symbol.
        focusPoint({ seriesIndex: target.seriesIndex, dataIndex: target.dataIndex });
        chart.dispatchAction({ type: 'highlight', seriesIndex: target.seriesIndex, dataIndex: target.dataIndex });
        // Runs `tooltip.formatter` synchronously, so `sink` has refreshed the
        // model by the time this returns.
        chart.dispatchAction({ type: 'showTip', seriesIndex: target.seriesIndex, dataIndex: target.dataIndex });
      }

      // Nothing resolved to show (e.g. a click on empty grid after the previous
      // pin was dismissed): stay unpinned rather than freezing a stale tooltip.
      const cur = latestRef.current;
      if (!cur.visible || cur.model == null) {
        return;
      }
      update({ pinned: true, pinnedItem: target });
    };

    const onChartClick = (params: ECElementEvent) => {
      const cur = latestRef.current;
      // The ZRender click runs first and may already have pinned this same user
      // click, from the proximity-focused point — which outranks whichever
      // element ECharts happened to hit. Only record the element it found.
      if (cur.pinned) {
        if (cur.pinnedItem == null) {
          update({ pinnedItem: { seriesIndex: params.seriesIndex, dataIndex: params.dataIndex } });
        }
        return;
      }
      pinWith({ seriesIndex: params.seriesIndex, dataIndex: params.dataIndex });
    };

    const onZrClick = () => pinWith(null);

    zr.on('mousemove', onMove);
    zr.on('globalout', onGlobalOut);
    zr.on('click', onZrClick);
    chart.on('mouseout', onMouseOut);
    chart.on('mouseover', onMouseOver);
    chart.on('click', onChartClick);

    return () => {
      // On unmount EChart disposes the instance in its layout-effect cleanup,
      // which drops zr/instance listeners; guard against a disposed instance.
      // https://echarts.apache.org/en/api.html#echartsInstance.isDisposed
      if (!chart.isDisposed()) {
        zr.off('mousemove', onMove);
        zr.off('globalout', onGlobalOut);
        zr.off('click', onZrClick);
        chart.off('mouseout', onMouseOut);
        chart.off('mouseover', onMouseOver);
        chart.off('click', onChartClick);
      }
      cancelHide();
    };
  }, [chart, containerRef, cancelHide, focusPoint, latestRef, update]);

  usePinnedDismiss(state.pinned, dismiss, containerRef);

  return { state, sink, reportTrigger, dismiss };
}
