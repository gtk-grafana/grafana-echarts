import { css } from '@emotion/css';
import {
  DashboardCursorSync,
  DataHoverClearEvent,
  DataHoverEvent,
  DataHoverPayload,
  EventBus,
  Field,
  GrafanaTheme2,
  LinkModel,
} from '@grafana/data';
import { SortOrder } from '@grafana/schema';
import { IconButton, Portal, useStyles2 } from '@grafana/ui';
import { EChartsType } from 'echarts';
import {
  buildTooltipModel,
  computeTooltipPosition,
  EChartsTooltipParam,
  TooltipAnchor,
  TooltipBuildContext,
  TooltipKind,
  TooltipModel,
} from 'echarts/tooltip';
import { TooltipLinkResolver } from 'echarts/data/links';
import { ValueFormatter } from 'echarts/style';
import {
  getHoverTime,
  HOVER_THROTTLE_MS,
  shouldApplyCrosshair,
  shouldShowSyncedTooltip,
  throttle,
} from 'echarts/sync';
import { VizTooltipContent, VizTooltipFooter, VizTooltipHeader, VizTooltipWrapper } from 'grafana/VizTooltip';
import React, { CSSProperties, ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

const DEFAULT_MAX_WIDTH = 420;

/**
 * The Grafana tooltip box. Styling mirrors Core Grafana's uPlot tooltip wrapper
 * (`TooltipPlugin2`): elevated background, weak border, default radius, z2
 * shadow. Positioning is handled by the wrapper (`PositionedTooltip`).
 */
const getStyles = (theme: GrafanaTheme2, maxWidth?: number) => ({
  box: css({
    position: 'relative',
    borderRadius: theme.shape.radius.default,
    background: theme.colors.background.elevated,
    border: `1px solid ${theme.colors.border.weak}`,
    boxShadow: theme.shadows.z2,
    color: theme.colors.text.primary,
    userSelect: 'text',
    maxWidth: maxWidth ?? DEFAULT_MAX_WIDTH,
  }),
  closeButton: css({
    position: 'absolute',
    top: theme.spacing(0.5),
    right: theme.spacing(0.5),
    zIndex: 1,
  }),
});

interface GrafanaTooltipBoxProps {
  model: TooltipModel;
  isPinned: boolean;
  dataLinks: Array<LinkModel<Field>>;
  maxWidth?: number;
  maxHeight?: number;
  onClose: () => void;
}

const GrafanaTooltipBox: React.FC<GrafanaTooltipBoxProps> = ({
  model,
  isPinned,
  dataLinks,
  maxWidth,
  maxHeight,
  onClose,
}) => {
  const styles = useStyles2(getStyles, maxWidth);
  return (
    <div className={styles.box}>
      {isPinned && (
        <div className={styles.closeButton}>
          <IconButton name="times" aria-label="Close" tooltip="Close" size="sm" onClick={onClose} />
        </div>
      )}
      <VizTooltipWrapper>
        <VizTooltipHeader item={model.header} isPinned={isPinned} />
        <VizTooltipContent
          items={model.items}
          isPinned={isPinned}
          scrollable={maxHeight != null}
          maxHeight={maxHeight}
        />
        {isPinned && <VizTooltipFooter dataLinks={dataLinks} />}
      </VizTooltipWrapper>
    </div>
  );
};

interface PositionedTooltipProps extends GrafanaTooltipBoxProps {
  anchor: TooltipAnchor;
}

/**
 * Anchors the tooltip box to a viewport coordinate. The box is measured after
 * render so `computeTooltipPosition` can flip/clamp it against the viewport;
 * it is hidden for that first measuring pass to avoid a visible jump.
 *
 * When pinned, the box is interactive and an outside click or Escape closes it;
 * when hovering, pointer events pass through so the chart stays interactive.
 */
const PositionedTooltip: React.FC<PositionedTooltipProps> = ({ anchor, isPinned, onClose, ...boxProps }) => {
  const styles = useStyles2(getWrapperStyles);
  const boxRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>({ left: anchor.x, top: anchor.y, visibility: 'hidden' });

  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) {
      return;
    }
    const rect = el.getBoundingClientRect();
    const { left, top } = computeTooltipPosition(
      anchor,
      { width: rect.width, height: rect.height },
      { width: window.innerWidth, height: window.innerHeight }
    );
    setStyle({ left, top });
  }, [anchor, boxProps.model, isPinned]);

  useEffect(() => {
    if (!isPinned) {
      return;
    }
    const onMouseDown = (event: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isPinned, onClose]);

  return (
    <div
      ref={boxRef}
      className={styles.wrapper}
      style={{ ...style, pointerEvents: isPinned ? 'auto' : 'none' }}
    >
      <GrafanaTooltipBox isPinned={isPinned} onClose={onClose} {...boxProps} />
    </div>
  );
};

const getWrapperStyles = (theme: GrafanaTheme2) => ({
  wrapper: css({
    position: 'fixed',
    zIndex: theme.zIndex.tooltip,
  }),
});

interface UseGrafanaEChartsTooltipArgs {
  kind: TooltipKind;
  valueFormatter: ValueFormatter;
  timeZone: string;
  /** Radar indicator (axis) names, in option order. Ignored for other kinds. */
  radarIndicators: string[];
  /** Sort order applied to multi-series (axis) rows. */
  sort: SortOrder;
  /** Drop multi-series rows with a value of exactly 0. */
  hideZeros: boolean;
  /** Whether the heatmap X axis is time-based (header date vs numeric range). */
  xIsTime: boolean;
  /** Tooltip box max width (px); falls back to the default when unset. */
  maxWidth?: number;
  /** Scrollable content max height (px); content is not scrollable when unset. */
  maxHeight?: number;
  /** Resolves data links for the pinned tooltip from its hovered points. */
  resolveLinks: TooltipLinkResolver;
  /**
   * Panel-scoped event bus used to share the hovered position across panels
   * (shared crosshair / tooltip). When omitted, cursor sync is disabled.
   */
  eventBus?: EventBus;
  /** Reads the dashboard's current cursor sync mode ("Graph tooltip" setting). */
  getCursorSync?: () => DashboardCursorSync;
  /** Cursor sync only applies to cartesian time series; false disables it. */
  syncEnabled?: boolean;
}

interface GrafanaEChartsTooltip {
  /**
   * ECharts `tooltip.formatter`. Stashes the hovered params into React state and
   * returns an empty string so ECharts itself renders nothing; the Grafana
   * tooltip is drawn by the portal, positioned by us at the cursor.
   */
  formatter: (params: EChartsTooltipParam | EChartsTooltipParam[]) => string;
  /** Portal node to render inside the panel's React tree. */
  portal: ReactNode;
  /**
   * Wire the chart up: track the cursor, clear on leave, and pin on click.
   * Returns a cleanup to detach the listeners. Call once the chart is ready.
   */
  attach: (chart: EChartsType, container: HTMLElement) => () => void;
}

interface PinnedState {
  model: TooltipModel;
  anchor: TooltipAnchor;
}

/** Live cursor-sync config, kept in a ref so the attached listeners stay stable. */
interface CursorSyncConfig {
  eventBus?: EventBus;
  getMode: () => DashboardCursorSync;
  enabled: boolean;
}

/** Refs/callbacks the cursor-sync listeners share with the tooltip hook. */
interface CursorSyncContext {
  syncRef: { current: CursorSyncConfig };
  externalRef: { current: { active: boolean; mode: DashboardCursorSync } };
  localHoverRef: { current: boolean };
  pinnedRef: { current: boolean };
  coordsRef: { current: TooltipAnchor };
  clearHoverModel: () => void;
}

/** Minimal shape of the zrender mouse event fields we read. */
interface ZrMouseEvent {
  offsetX: number;
  offsetY: number;
}

/**
 * Wire up shared crosshair / tooltip sync for a cartesian chart, mirroring Core
 * Grafana's uPlot `EventBusPlugin`:
 *
 * - Publish (throttled) the hovered time on the panel event bus while the cursor
 *   is over the plot, and a clear event on leave. A single payload/event object
 *   is reused per move to avoid allocations on a busy dashboard.
 * - On hovers from other panels, move this chart's crosshair to the same time
 *   via `showTip` (only the line in Crosshair mode; line + tooltip box in
 *   Tooltip mode), and clear it via `hideTip`.
 *
 * Events are untagged so native uPlot panels (which ignore "uplot"-tagged
 * events) react to them, and incoming events are filtered by `origin` to ignore
 * this panel's own broadcasts. Returns a cleanup that detaches everything.
 */
function attachCursorSync(chart: EChartsType, container: HTMLElement, ctx: CursorSyncContext): () => void {
  const { syncRef, externalRef, localHoverRef, pinnedRef, coordsRef, clearHoverModel } = ctx;
  const zr = chart.getZr();

  // Reused across moves to avoid per-frame allocations (see EventBusPlugin).
  const point: DataHoverPayload['point'] = { time: null };
  const hoverEvent = new DataHoverEvent({ point });
  const clearEvent = new DataHoverClearEvent();
  const publishHover = throttle(() => syncRef.current.eventBus?.publish(hoverEvent), HOVER_THROTTLE_MS);
  const publishClear = throttle(() => syncRef.current.eventBus?.publish(clearEvent), HOVER_THROTTLE_MS);

  const onZrMove = (event: ZrMouseEvent) => {
    localHoverRef.current = true;
    // Local interaction always wins over an externally-driven crosshair.
    externalRef.current.active = false;
    const { enabled, getMode } = syncRef.current;
    if (!enabled || getMode() === DashboardCursorSync.Off) {
      return;
    }
    const { offsetX, offsetY } = event;
    // Outside the plot area behaves like a leave so other panels clear too.
    if (!chart.containPixel({ gridIndex: 0 }, [offsetX, offsetY])) {
      publishClear.run();
      return;
    }
    const time = chart.convertFromPixel({ xAxisIndex: 0 }, offsetX);
    if (typeof time !== 'number' || !Number.isFinite(time)) {
      return;
    }
    point.time = time;
    publishHover.run();
  };

  const onZrOut = () => {
    localHoverRef.current = false;
    const { enabled, getMode } = syncRef.current;
    if (enabled && getMode() !== DashboardCursorSync.Off) {
      publishClear.run();
    }
  };

  zr.on('mousemove', onZrMove);
  zr.on('globalout', onZrOut);

  const clearExternal = () => {
    if (!externalRef.current.active) {
      return;
    }
    externalRef.current = { active: false, mode: DashboardCursorSync.Off };
    chart.dispatchAction({ type: 'hideTip' });
    if (!pinnedRef.current) {
      clearHoverModel();
    }
  };

  const applyExternalHover = (payload?: DataHoverPayload) => {
    const { enabled, getMode } = syncRef.current;
    // The panel under the cursor owns the crosshair; ignore echoes while local.
    if (!enabled || localHoverRef.current) {
      return;
    }
    const mode = getMode();
    if (!shouldApplyCrosshair(mode)) {
      return;
    }
    const time = getHoverTime(payload);
    if (time == null) {
      clearExternal();
      return;
    }
    const x = chart.convertToPixel({ xAxisIndex: 0 }, time);
    if (typeof x !== 'number' || !Number.isFinite(x)) {
      // Hovered time is outside this panel's range; show nothing.
      clearExternal();
      return;
    }
    const y = chart.getHeight() / 2;
    externalRef.current = { active: true, mode };
    // Tooltip mode needs a screen anchor for the React box; the formatter (run
    // synchronously by showTip) reads coordsRef. Crosshair mode draws only the line.
    if (shouldShowSyncedTooltip(mode)) {
      const rect = container.getBoundingClientRect();
      coordsRef.current = { x: rect.left + x, y: rect.top + y };
    }
    chart.dispatchAction({ type: 'showTip', x, y });
  };

  const eventBus = syncRef.current.eventBus;
  const subscriptions = eventBus
    ? [
        eventBus.getStream(DataHoverEvent).subscribe({
          next: (event) => {
            if (event.origin !== eventBus) {
              applyExternalHover(event.payload);
            }
          },
        }),
        eventBus.getStream(DataHoverClearEvent).subscribe({
          next: (event) => {
            if (event.origin !== eventBus && !localHoverRef.current) {
              clearExternal();
            }
          },
        }),
      ]
    : [];

  return () => {
    zr.off('mousemove', onZrMove);
    zr.off('globalout', onZrOut);
    publishHover.cancel();
    publishClear.cancel();
    subscriptions.forEach((subscription) => subscription.unsubscribe());
  };
}

/**
 * Bridge ECharts' native tooltip to a Grafana-styled React tooltip rendered in a
 * portal. ECharts keeps doing hit-testing and axis-pointer drawing; we capture
 * the hovered content/coords, render Grafana's tooltip outside the chart, and
 * support click-to-pin (with data links) plus Escape/outside-click to dismiss.
 */
export function useGrafanaEChartsTooltip({
  kind,
  valueFormatter,
  timeZone,
  radarIndicators,
  sort,
  hideZeros,
  xIsTime,
  maxWidth,
  maxHeight,
  resolveLinks,
  eventBus,
  getCursorSync,
  syncEnabled,
}: UseGrafanaEChartsTooltipArgs): GrafanaEChartsTooltip {
  const [hoverModel, setHoverModel] = useState<TooltipModel | null>(null);
  const [position, setPosition] = useState<TooltipAnchor | null>(null);
  const [pinned, setPinned] = useState<PinnedState | null>(null);

  // The formatter/listeners are stable (baked into the ECharts option / attached
  // once), so the latest values they need are read from refs synced in effects.
  const ctxRef = useRef<TooltipBuildContext>({ kind, valueFormatter, timeZone, radarIndicators, sort, hideZeros, xIsTime });
  const pinnedRef = useRef(false);
  const hoverModelRef = useRef<TooltipModel | null>(null);
  const coordsRef = useRef<TooltipAnchor>({ x: 0, y: 0 });

  // Cursor-sync state, read by the (stable) attached listeners. `external`
  // tracks a hover driven by another panel; `localHover` is set while the
  // pointer is over this panel (so it ignores incoming events and drives them).
  const externalRef = useRef<{ active: boolean; mode: DashboardCursorSync }>({
    active: false,
    mode: DashboardCursorSync.Off,
  });
  const localHoverRef = useRef(false);
  const syncRef = useRef<CursorSyncConfig>({
    eventBus: undefined,
    getMode: () => DashboardCursorSync.Off,
    enabled: false,
  });

  // A layout effect (not a passive one) so the config is populated before the
  // panel's own layout effect attaches the listeners on first mount. Because the
  // hook runs before that effect is registered, this layout effect runs first.
  useLayoutEffect(() => {
    syncRef.current.eventBus = eventBus;
    syncRef.current.getMode = getCursorSync ?? (() => DashboardCursorSync.Off);
    syncRef.current.enabled = syncEnabled === true && eventBus != null;
  }, [eventBus, getCursorSync, syncEnabled]);

  useEffect(() => {
    ctxRef.current = { kind, valueFormatter, timeZone, radarIndicators, sort, hideZeros, xIsTime };
  }, [kind, valueFormatter, timeZone, radarIndicators, sort, hideZeros, xIsTime]);
  useEffect(() => {
    pinnedRef.current = pinned != null;
  }, [pinned]);

  const formatter = useCallback((params: EChartsTooltipParam | EChartsTooltipParam[]) => {
    const model = buildTooltipModel(params, ctxRef.current);
    hoverModelRef.current = model;
    // While pinned, the frozen tooltip wins; just keep the ref fresh.
    if (pinnedRef.current) {
      return '';
    }
    // A hover synced from another panel: in Crosshair mode draw only the line
    // (ECharts still renders the axis pointer), so suppress the React box.
    const external = externalRef.current;
    if (external.active && !shouldShowSyncedTooltip(external.mode)) {
      setHoverModel(null);
      return '';
    }
    // Local hover, or a synced Tooltip-mode hover whose anchor was set to the
    // remote point's screen position below.
    setHoverModel(model);
    setPosition({ ...coordsRef.current });
    return '';
  }, []);

  const unpin = useCallback(() => setPinned(null), []);

  const attach = useCallback((chart: EChartsType, container: HTMLElement) => {
    const zr = chart.getZr();

    const onMouseMove = (event: MouseEvent) => {
      coordsRef.current = { x: event.clientX, y: event.clientY };
      if (!pinnedRef.current && hoverModelRef.current) {
        setPosition({ x: event.clientX, y: event.clientY });
      }
    };
    const onMouseLeave = () => {
      if (!pinnedRef.current) {
        hoverModelRef.current = null;
        setHoverModel(null);
      }
    };
    const onClick = () => {
      const model = hoverModelRef.current;
      if (model && model.items.length > 0) {
        setPinned({ model, anchor: { ...coordsRef.current } });
        setHoverModel(null);
      }
    };

    container.addEventListener('mousemove', onMouseMove);
    container.addEventListener('mouseleave', onMouseLeave);
    zr.on('click', onClick);

    const detachSync = attachCursorSync(chart, container, {
      syncRef,
      externalRef,
      localHoverRef,
      pinnedRef,
      coordsRef,
      clearHoverModel: () => {
        hoverModelRef.current = null;
        setHoverModel(null);
      },
    });

    return () => {
      container.removeEventListener('mousemove', onMouseMove);
      container.removeEventListener('mouseleave', onMouseLeave);
      zr.off('click', onClick);
      detachSync();
    };
  }, []);

  const isPinned = pinned != null;
  const activeModel = pinned ? pinned.model : hoverModel;
  const activeAnchor = pinned ? pinned.anchor : position;
  // `resolveLinks` is a stable memo from the panel; only the pinned tooltip needs links.
  const dataLinks = pinned ? resolveLinks(pinned.model.refs) : [];

  const portal =
    activeModel && activeAnchor && activeModel.items.length > 0 ? (
      <Portal>
        <PositionedTooltip
          model={activeModel}
          anchor={activeAnchor}
          isPinned={isPinned}
          dataLinks={dataLinks}
          maxWidth={maxWidth}
          maxHeight={maxHeight}
          onClose={unpin}
        />
      </Portal>
    ) : null;

  return { formatter, portal, attach };
}
