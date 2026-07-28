import { type EChartsType } from 'lib/echarts/echarts';
import { type TooltipModel, type TooltipSink } from 'lib/echarts/tooltip/model';
import { findHoveredPoint, type ProximityHit, type SeriesPoints } from 'lib/echarts/tooltip/proximity';
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
  /** Cursor position in window coordinates. */
  position: { x: number; y: number } | null;
  visible: boolean;
  /** Whether the user has click-to-pinned the tooltip (freezes content, enables interaction). */
  pinned: boolean;
  /**
   * The chart element that was clicked to pin, when the click landed on one
   * (ECharts element-level `click` params). Lets the overlay pick the clicked
   * row's footer source in multi-row ("All") tooltips, mirroring core's
   * hovered-series footer. `null` when pinned from an empty-grid click.
   */
  pinnedItem: { seriesIndex?: number; dataIndex?: number } | null;
  /**
   * The proximity-focused series, or `null` when none is within the focus band.
   *
   * Drives the bold ("active") row in multi-row "All" tooltips, mirroring core,
   * where the emphasised row is the vertically nearest series — not whichever
   * element ECharts happens to consider hovered. Kept separate from `model` so
   * it survives the two arriving in either order: in axis mode ECharts rebuilds
   * the model from its own mousemove handling, independently of this hook's.
   */
  activeSeriesIndex: number | null;
}

export interface EChartsTooltipOptions {
  /**
   * Per-series values enabling Grafana-parity proximity hover (see
   * `lib/echarts/tooltip/proximity`). Omit — or pass an empty array — to fall
   * back to ECharts' native hit-testing, which is what non-cartesian families
   * (pie, treemap, heatmap) want.
   */
  series?: readonly SeriesPoints[];
  /** Core's "Hover proximity" (px); see {@link findHoveredPoint}. */
  hoverProximity?: number;
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

const HIDDEN: EChartsTooltipState = {
  model: null,
  position: null,
  visible: false,
  pinned: false,
  pinnedItem: null,
  activeSeriesIndex: null,
};

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
    (hit: ProximityHit | null): boolean => {
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
    [cancelHide, update]
  );

  const reportTrigger = useCallback((trigger: string | undefined) => {
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
      if (latestRef.current.pinned) {
        return;
      }

      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) {
        return;
      }
      update({ position: { x: rect.left + event.offsetX, y: rect.top + event.offsetY } });

      const { series: seriesPoints, hoverProximity: proximity } = proximityRef.current;
      if (seriesPoints == null || seriesPoints.length === 0) {
        // Not a proximity-capable chart; ECharts' own hit-testing drives `sink`.
        return;
      }

      // ZRender offsets are already relative to the canvas, which is the
      // coordinate space the chart's pixel conversions use.
      const hit = findHoveredPoint(chart, { x: event.offsetX, y: event.offsetY }, seriesPoints, {
        hoverProximity: proximity,
      });

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

    const onMouseOver = (params: { seriesIndex?: number }) => {
      if (latestRef.current.pinned) {
        return;
      }
      cancelHide();
      // Native hit-testing families (bars, and anything with proximity off) get
      // their active/bold row from the element actually under the cursor, so the
      // hovered item — not the vertically-nearest one — is the one emphasised.
      if (!inProximityMode() && params?.seriesIndex != null) {
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
      const cur = latestRef.current;
      if (cur.pinned || !cur.visible || cur.model == null) {
        return;
      }
      cancelHide();

      // Pinning freezes the active point along with the content. In proximity
      // mode the click often lands on empty grid *near* a line, so ECharts
      // reports no element and `pinnedItem` is null — the proximity-focused
      // point is the one the user meant, and pinning it is what lets the footer
      // resolve. Re-asserting the highlight makes the marker owned by the
      // (persistent) action rather than ZRender's element hover, which clears as
      // soon as the cursor leaves the symbol.
      const focused = lastHitRef.current;
      if (focused != null && !chart.isDisposed()) {
        chart.dispatchAction({ type: 'highlight', ...focused });
      }
      update({ pinned: true, pinnedItem: pinnedItem ?? focused });
    };

    const onChartClick = (params: { seriesIndex?: number; dataIndex?: number }) => {
      const cur = latestRef.current;
      // The ZRender click may have pinned first (same user click); still record
      // the element so the footer resolves. A click while already interactively
      // pinned never reaches here un-dismissed (the outside-click handler runs
      // on mousedown, before click).
      if (cur.pinned && cur.pinnedItem == null) {
        update({ pinnedItem: { seriesIndex: params.seriesIndex, dataIndex: params.dataIndex } });
        return;
      }
      pinWith({ seriesIndex: params.seriesIndex, dataIndex: params.dataIndex });
    };

    const onZrClick = () => pinWith(null);

    zr.on('mousemove', onMove);
    zr.on('globalout', onGlobalOut);
    zr.on('click', onZrClick);
    // ECharts' event typings for element events are permissive; the handlers
    // ignore the params, so cast to the shared handler shape (see the brush
    // handler in EChart.tsx for the same pattern).
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    chart.on('mouseout', onMouseOut as (...args: unknown[]) => void);
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    chart.on('mouseover', onMouseOver as (...args: unknown[]) => void);
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    chart.on('click', onChartClick as (...args: unknown[]) => void);

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
      if (rafIdRef.current != null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      flushScheduledRef.current = false;
    };
  }, [chart, containerRef, cancelHide, focusPoint, update]);

  // While pinned, dismiss on a click outside the tooltip, on Escape, or when the
  // chart scrolls away underneath it. Clicks inside the tooltip (data links,
  // ad-hoc filter buttons) are ignored so the pinned tooltip stays interactive.
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
  }, [state.pinned, dismiss, containerRef]);

  return { state, sink, reportTrigger, dismiss };
}
