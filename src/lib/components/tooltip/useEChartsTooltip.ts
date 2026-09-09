import { debug, LOG_LEVELS } from 'development';
import { type ECElementEvent } from 'echarts/core';
import { type EChartsType } from 'lib/echarts/echarts';
import { revealEdgeLabelsFor } from 'lib/echarts/features/edgeLabelLayout';
import { findHoveredPoint } from 'lib/echarts/tooltip/proximity';
import { type EChartsTooltipTrigger, type TooltipModel, type TooltipSink } from 'lib/echarts/tooltip/types';
import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';
import { TOOLTIP_MARKER_ATTR } from './constants';
import { type EChartsTooltipController, type EChartsTooltipOptions, type EChartsTooltipState } from './types';

/**
 * A chart item addressed for highlight/pin: the series, the row within it, and —
 * for graph-like series (graph / sankey / chord) — which of the series' two data
 * tables that row belongs to. See {@link EChartsTooltipState.pinnedItem}.
 */
type TooltipTarget = NonNullable<EChartsTooltipState['pinnedItem']>;

/** Whether two targets address the same chart item (either may be absent). */
const isSameTarget = (a: TooltipTarget | null, b: TooltipTarget | null): boolean =>
  a?.seriesIndex === b?.seriesIndex && a?.dataIndex === b?.dataIndex && a?.dataType === b?.dataType;

/**
 * Whether a target addresses a graph-like series' *edge* table rather than its
 * nodes. Edges are the case `showTip` cannot reach; see {@link replayTip}.
 */
const isEdgeTarget = (target: TooltipTarget | null): boolean => target?.dataType === 'edge';

/**
 * How long (ms) an item-triggered tooltip lingers after the cursor leaves its
 * element before hiding. A short grace period prevents a flicker-to-hidden when
 * the cursor crosses the gap between two adjacent items (the next item's hover
 * cancels the pending hide). Mirrors core Grafana's ~100ms un-render defer in
 * `TooltipPlugin2`.
 */
const HIDE_DELAY_MS = 120;

/**
 * The nothing-hovered state: no content, no position, not visible, not pinned.
 * Both the hook's initial state and the shape every hide path patches back
 * toward.
 */
const HIDDEN: EChartsTooltipState = {
  model: null,
  position: null,
  visible: false,
  pinned: false,
  pinnedItem: null,
  activeSeriesIndex: null,
};

/**
 * Replay a point into ECharts as a `showTip`, so the (silent) tooltip formatter
 * re-runs and the sink receives that item's model. The pin path needs this to
 * rebuild content for a newly clicked item — proximity especially, where the
 * click often lands on empty grid rather than on an element.
 *
 * Not every coordinate system can service it. ECharts resolves an
 * index-addressed `showTip` through `findPointFromSeries`, which calls
 * `coordSys.dataToPoint(values)` with one argument, while
 * `Parallel.prototype.dataToPoint(value, dim)` also requires the dimension and
 * throws on `undefined`. (Radar escapes this by defining `getTooltipPosition`,
 * which is checked first; parallel defines neither.)
 *
 * Swallowing that leaves the pin itself intact: the hover that preceded the
 * click already put the clicked item's model in state, so the tooltip pins with
 * the right content and its data-link footer renders. Only re-pinning straight
 * from one line to another is affected — the outside-click dismiss clears the
 * model first, and with no replay to refill it that click lands unpinned. Moving
 * the cursor re-hovers and the next click pins.
 *
 * The positional form (`showTip` with x/y) is deliberately *not* used as a
 * fallback: it is a no-op for parallel. ECharts routes it through
 * `updateAxisPointer` and an axis-tooltip lookup that a parallel coordinate
 * system has nothing to answer with, so it emits nothing even when
 * `findHover` lands squarely on the polyline (verified against a live chart).
 *
 * **It also cannot address an edge.** A graph-like series (graph / sankey /
 * chord) exposes two data tables, and `dataType` picks between them — but
 * `showTip` never forwards it: `findPointFromSeries` calls `seriesModel.getData()`
 * with no argument, so it always resolves the *node* at `dataIndex` and hands
 * that element to `_showSeriesItemTooltip`. Replaying a clicked edge therefore
 * silently produces an unrelated node's tooltip. `pinWith` skips the replay for
 * edges and reuses the model the hover already produced instead.
 * (`highlight`/`downplay` do honour `payload.dataType`, so those are passed it.)
 */
function replayTip(chart: EChartsType, target: TooltipTarget) {
  try {
    chart.dispatchAction({ type: 'showTip', seriesIndex: target.seriesIndex, dataIndex: target.dataIndex });
  } catch (e) {
    // Coordinate system can't resolve a bare (seriesIndex, dataIndex); see above.
    // Parallel chart throws this when pinning a tooltip when one is already pinned
    debug('Coordinate system cannot resolve', LOG_LEVELS.warn, {
      seriesIndex: target.seriesIndex,
      dataIndex: target.dataIndex,
      e,
    });
  }
}

/**
 * rAF (requestAnimationFrame) state.
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
  const lastHitRef = useRef<TooltipTarget | null>(null);

  // The most recent model the (invisible) ECharts formatter produced, kept even
  // while pinned. Re-pinning onto an item that `showTip` cannot address — an edge
  // of a graph-like series — restores content from here instead. See `pinWith`.
  const liveModelRef = useRef<TooltipModel | null>(null);

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
  const liveHitRef = useRef<TooltipTarget | null>(null);

  // The mark the cursor is on right now (`null` for none), written by the hover handlers
  // and read once the whole event has been dispatched — see `settleFocus`.
  const hoveredRef = useRef<TooltipTarget | null>(null);

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
   *
   * `dataType` rides along because both actions honour it — ECharts' state
   * handler resolves `seriesModel.getData(payload.dataType)` — so a hovered edge
   * emphasises that edge rather than the node sharing its index.
   */
  const focusPoint = useCallback(
    (hit: TooltipTarget | null): boolean => {
      const previous = lastHitRef.current;
      const next =
        hit == null ? null : { seriesIndex: hit.seriesIndex, dataIndex: hit.dataIndex, dataType: hit.dataType };
      if (
        previous?.seriesIndex === next?.seriesIndex &&
        previous?.dataIndex === next?.dataIndex &&
        previous?.dataType === next?.dataType
      ) {
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

  /**
   * The entry point ECharts' invisible `tooltip.formatter` calls with the hovered
   * content: adopts the model and shows the tooltip, cancelling any pending hide.
   * Ignored while pinned, so a hover elsewhere cannot overwrite frozen content.
   */
  const sink = useCallback<TooltipSink>(
    (model) => {
      // Recorded before the pinned check: ECharts keeps hit-testing and running
      // its formatter while the React tooltip is frozen, so this stays the
      // last-hovered item's content — which is what `pinWith` re-pins from when
      // the click lands on an item `showTip` cannot replay.
      liveModelRef.current = model;
      if (latestRef.current.pinned) {
        return;
      }
      cancelHide();
      update({ model, visible: true });
    },
    [cancelHide, latestRef, update]
  );

  /**
   * Records whether the panel's tooltip is item- or axis-triggered, which the
   * hover handlers below branch on. Pushed in by `useChartOption` after each
   * option rebuild, since ECharts exposes no accessor for the resolved trigger.
   */
  const reportTrigger = useCallback((trigger: EChartsTooltipTrigger) => {
    triggerRef.current = trigger;
  }, []);

  const dismiss = useCallback(() => {
    cancelHide();
    // Drop the emphasis and forget the replayed point, so the next move over the
    // same datapoint re-shows the tooltip instead of being deduped away.
    focusPoint(null);
    // Nothing is focused now, so a hidden edge value revealed by the pin goes back — the
    // hover handlers own this the rest of the time, but a dismiss can arrive (Escape, an
    // outside click) with no chart event behind it.
    if (chart != null && !chart.isDisposed()) {
      revealEdgeLabelsFor(chart.getZr(), null);
    }
    update({ pinned: false, pinnedItem: null, visible: false, model: null });
  }, [cancelHide, chart, focusPoint, update]);

  useEffect(() => {
    if (!chart) {
      return;
    }
    const zr = chart.getZr();

    /**
     * Move the emphasis from `previous` to `next`, either of which may be nothing.
     *
     * Both actions matter. `highlight` alone usually strips the emphasis from wherever it
     * was — `blurSeries` traverses the whole series group and resets every element's state
     * before un-blurring the new focus set — but it returns early for a series that sets no
     * `emphasis.focus`, and there is nothing to highlight at all when `next` is nothing. So
     * the outgoing mark is downplayed explicitly, which covers both. Re-lighting the mark
     * that already has it is skipped rather than special-cased away, since a downplay of the
     * incoming mark would drop the very emphasis being asserted.
     */
    const applyFocus = (next: TooltipTarget | null, previous: TooltipTarget | null) => {
      if (chart.isDisposed()) {
        return;
      }
      if (previous?.seriesIndex != null && !isSameTarget(previous, next)) {
        chart.dispatchAction({
          type: 'downplay',
          seriesIndex: previous.seriesIndex,
          dataIndex: previous.dataIndex,
          dataType: previous.dataType,
        });
      }
      if (next?.seriesIndex != null) {
        chart.dispatchAction({
          type: 'highlight',
          seriesIndex: next.seriesIndex,
          dataIndex: next.dataIndex,
          dataType: next.dataType,
        });
      }
    };

    /**
     * Put the emphasis back on the pinned mark, because **the cursor keeps taking it away**.
     * A pinned tooltip freezes its content and position, and its emphasis is part of what it
     * froze: the panel must not show one node's tooltip beside another node's neighbourhood.
     * Measured on a pinned four-node graph, hovering a non-neighbour reproduced the
     * *unpinned* hover state exactly while the tooltip still named the pinned node.
     *
     * Two ECharts behaviours fight this, both in `echarts/lib/util/states.js` and both
     * reached from `bindMouseEvent`'s ZRender listeners rather than from any action, so
     * neither is visible to this hook's state:
     *
     * - **`mouseout` erases the fade.** `handleGlobalMouseOutForHighDown` opens with an
     *   unconditional `allLeaveBlur(api)`. It has no notion of a highlight that came from
     *   `dispatchAction` rather than from the cursor, so leaving *any* element clears it.
     * - **`mouseover` moves the fade.** `handleGlobalMouseOverForHighDown` calls
     *   `blurSeries(hovered…)` and emphasises the hovered element.
     *
     * Unpinned, both of those are simply the hover behaviour, and nothing here competes with
     * them: a fade that follows the cursor is what a cursor is for.
     *
     * **Deferred to a microtask, which is the fix for the flicker rather than a detail of
     * it.** This has to land after ECharts' handler, and it used to wait a frame to be sure
     * of that — but ZRender paints on a frame too, and it gets there first, so every
     * corrected hover was drawn wrong once before it was drawn right. A microtask runs after
     * every handler of the same DOM event (ECharts binds `bindMouseEvent` at init and the
     * instance-level listeners this hook uses before it, so its handler has certainly run)
     * and still before the frame, so the wrong state is never painted. It also coalesces the
     * pair of events a move between two marks emits — `mouseout` of the old and `mouseover`
     * of the new, dispatched together — into the single question "what is hovered now".
     */
    let settleScheduled = false;
    const scheduleSettle = () => {
      if (settleScheduled) {
        return;
      }
      settleScheduled = true;
      queueMicrotask(() => {
        settleScheduled = false;
        if (chart.isDisposed()) {
          return;
        }
        settleFocus();
      });
    };

    const settleFocus = () => {
      // A graph's hidden edge values belong to whichever mark is focused, and this is the one
      // place that knows both halves of that — the cursor, and a pin that outranks it. A
      // no-op for every chart with no hidden edge values, which is most of them.
      revealEdgeLabelsFor(zr, latestRef.current.pinned ? latestRef.current.pinnedItem : hoveredRef.current);
      if (!latestRef.current.pinned) {
        // Nobody is competing with the cursor, so ECharts' own hover emphasis is the
        // behaviour — and the only behaviour, since nothing was dispatched to contradict it.
        return;
      }
      // The pin owns the emphasis for as long as it lasts, so whatever the cursor just took
      // goes straight back.
      applyFocus(latestRef.current.pinnedItem, hoveredRef.current);
    };

    /**
     * ZRender `mousemove`: tracks the cursor in window coordinates so the overlay
     * can follow it, and in proximity mode also resolves the nearest point and
     * replays it into ECharts — making this handler the owner of show, hide and
     * emphasis for proximity charts.
     */
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

    /**
     * ZRender `globalout` (the cursor left the canvas entirely): hides at once,
     * with no grace period, since there is no adjacent element the cursor could be
     * crossing toward. The only hide path for axis ("All") tooltips.
     */
    const onGlobalOut = () => {
      hoveredRef.current = null;
      if (latestRef.current.pinned) {
        // Leaving the canvas is a `mouseout` of whatever element the cursor was on,
        // so the pinned emphasis has just been cleared here too.
        scheduleSettle();
        return;
      }
      focusPoint(null);
      cancelHide();
      update({ visible: false });
    };

    /**
     * Whether this chart resolves hover by proximity rather than by ECharts'
     * element hit-testing — read live from the ref, because `series` arrives after
     * the listeners below are bound and changes on every data update.
     */
    const inProximityMode = () => {
      const { series: seriesPoints } = proximityRef.current;
      return seriesPoints != null && seriesPoints.length > 0;
    };

    /**
     * Chart `mouseout` (the cursor left a series element): schedules the deferred
     * hide for item-triggered tooltips. A no-op for axis tooltips and in proximity
     * mode, where `globalout` and `onMove` respectively own hiding instead.
     */
    const onMouseOut = () => {
      // Nothing is hovered *yet*; a move onto an adjacent mark reports its `mouseover`
      // in this same dispatch, and `settleFocus` reads the ref once both have run.
      hoveredRef.current = null;
      scheduleSettle();
      if (latestRef.current.pinned) {
        // The pin owns the emphasis, and ECharts has just cleared it — see `settleFocus`.
        // Everything below is hide behaviour, which a pinned tooltip has none of.
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

    /**
     * Chart `mouseover` (the cursor entered a series element): cancels a pending
     * hide so moving between adjacent items never flickers, and outside proximity
     * mode marks the entered series as the active (bold) row.
     */
    const onMouseOver = (params: ECElementEvent) => {
      // ECharts has just moved the emphasis and the adjacency fade onto this mark, which
      // stands unless a pin outranks it — recorded for `settleFocus` to answer that.
      hoveredRef.current = {
        seriesIndex: params.seriesIndex,
        dataIndex: params.dataIndex,
        dataType: params.dataType,
      };
      scheduleSettle();
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
        focusPoint(target);
        chart.dispatchAction({
          type: 'highlight',
          seriesIndex: target.seriesIndex,
          dataIndex: target.dataIndex,
          dataType: target.dataType,
        });
        if (isEdgeTarget(target)) {
          // `showTip` cannot address an edge — it would resolve the node at the
          // same `dataIndex` and pin a tooltip for an unrelated node (see
          // `replayTip`). The hover that preceded this click already pushed the
          // edge's own model through `sink`, so re-pin from that instead.
          if (liveModelRef.current != null) {
            update({ model: liveModelRef.current, visible: true });
          }
        } else {
          // Runs `tooltip.formatter` synchronously, so `sink` has refreshed the
          // model by the time this returns.
          replayTip(chart, target);
        }
      }

      // Nothing resolved to show (e.g. a click on empty grid after the previous
      // pin was dismissed): stay unpinned rather than freezing a stale tooltip.
      const cur = latestRef.current;
      if (!cur.visible || cur.model == null) {
        return;
      }
      update({ pinned: true, pinnedItem: target });
      // The pin is the focused mark now, and asserting it re-applies element states — which
      // is what would otherwise drop a hidden edge value the hover had revealed, with no
      // event left to put it back until the cursor moves. See `settleFocus`.
      scheduleSettle();
    };

    /**
     * Chart `click` (an element was clicked): pins the tooltip onto that item,
     * unless the ZRender click already pinned this same user click — in which case
     * it only contributes the `seriesIndex`/`dataIndex` ZRender could not report.
     */
    const onChartClick = (params: ECElementEvent) => {
      const cur = latestRef.current;
      // The ZRender click runs first and may already have pinned this same user
      // click, from the proximity-focused point — which outranks whichever
      // element ECharts happened to hit. Only record the element it found.
      if (cur.pinned) {
        if (cur.pinnedItem == null) {
          update({
            pinnedItem: { seriesIndex: params.seriesIndex, dataIndex: params.dataIndex, dataType: params.dataType },
          });
        }
        return;
      }
      // `dataType` is what makes a clicked edge distinguishable from the node at
      // the same `dataIndex`; without it the pin resolves the wrong item.
      pinWith({ seriesIndex: params.seriesIndex, dataIndex: params.dataIndex, dataType: params.dataType });
    };

    const onZrClick = () => {
      // Both clicks fire for a click on an element and the order is not
      // guaranteed. If the element handler already pinned this same user click,
      // leave it alone: it knows the `seriesIndex`/`dataIndex`/`dataType` ZRender
      // cannot report, and re-pinning here would discard them. Mirrors the
      // `cur.pinned` guard in `onChartClick`.
      if (latestRef.current.pinned) {
        return;
      }
      pinWith(null);
    };

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
