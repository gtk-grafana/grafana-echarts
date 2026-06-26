import { css } from '@emotion/css';
import { Field, GrafanaTheme2, LinkModel } from '@grafana/data';
import { SortOrder } from '@grafana/schema';
import { IconButton, Portal, useStyles2 } from '@grafana/ui';
import { EChartsType } from 'echarts';
import {
  buildTooltipModel,
  computeTooltipPosition,
  EChartsTooltipParam,
  TooltipAnchor,
  TooltipBuildContext,
  TooltipItemRef,
  TooltipKind,
  TooltipModel,
} from 'echarts/options/tooltip';
import { ValueFormatter } from 'echarts/style';
import { VizTooltipContent, VizTooltipFooter, VizTooltipHeader, VizTooltipWrapper } from 'grafana/VizTooltip';
import React, { CSSProperties, ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/** Resolves the data links for a set of hovered points (used when pinned). */
export type TooltipLinkResolver = (refs: TooltipItemRef[]) => Array<LinkModel<Field>>;

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
  /** Tooltip box max width (px); falls back to the default when unset. */
  maxWidth?: number;
  /** Scrollable content max height (px); content is not scrollable when unset. */
  maxHeight?: number;
  /** Resolves data links for the pinned tooltip from its hovered points. */
  resolveLinks: TooltipLinkResolver;
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
  maxWidth,
  maxHeight,
  resolveLinks,
}: UseGrafanaEChartsTooltipArgs): GrafanaEChartsTooltip {
  const [hoverModel, setHoverModel] = useState<TooltipModel | null>(null);
  const [position, setPosition] = useState<TooltipAnchor | null>(null);
  const [pinned, setPinned] = useState<PinnedState | null>(null);

  // The formatter/listeners are stable (baked into the ECharts option / attached
  // once), so the latest values they need are read from refs synced in effects.
  const ctxRef = useRef<TooltipBuildContext>({ kind, valueFormatter, timeZone, radarIndicators, sort, hideZeros });
  const pinnedRef = useRef(false);
  const hoverModelRef = useRef<TooltipModel | null>(null);
  const coordsRef = useRef<TooltipAnchor>({ x: 0, y: 0 });

  useEffect(() => {
    ctxRef.current = { kind, valueFormatter, timeZone, radarIndicators, sort, hideZeros };
  }, [kind, valueFormatter, timeZone, radarIndicators, sort, hideZeros]);
  useEffect(() => {
    pinnedRef.current = pinned != null;
  }, [pinned]);

  const formatter = useCallback((params: EChartsTooltipParam | EChartsTooltipParam[]) => {
    const model = buildTooltipModel(params, ctxRef.current);
    hoverModelRef.current = model;
    // While pinned, the frozen tooltip wins; just keep the ref fresh.
    if (!pinnedRef.current) {
      setHoverModel(model);
      setPosition({ ...coordsRef.current });
    }
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

    return () => {
      container.removeEventListener('mousemove', onMouseMove);
      container.removeEventListener('mouseleave', onMouseLeave);
      zr.off('click', onClick);
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
