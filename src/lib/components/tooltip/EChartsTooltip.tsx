import { css, cx } from '@emotion/css';
import { type Field, type GrafanaTheme2, type LinkModel } from '@grafana/data';
import { TooltipDisplayMode, type VizTooltipOptions } from '@grafana/schema';
import {
  type AdHocFilterModel,
  getFieldDisplayLinks,
  IconButton,
  isTooltipScrollable,
  type PanelContext,
  Portal,
  usePanelContext,
  useStyles2,
  VizTooltipColorIndicator,
  VizTooltipColorPlacement,
  VizTooltipContent,
  VizTooltipFooter,
  VizTooltipHeader,
  type VizTooltipItem,
  VizTooltipWrapper,
} from '@grafana/ui';
import { type TooltipRow, type TooltipSource } from 'lib/echarts/tooltip/types';
import React, { useLayoutEffect, useRef } from 'react';
import { TOOLTIP_MARKER_ATTR, TOOLTIP_OFFSET } from './constants';
import { type EChartsTooltipState } from './types';

/**
 * `mode`/`maxWidth`/`maxHeight` are the panel's own Grafana tooltip options:
 * `mode` drives whether the content area scrolls, `maxWidth` bounds the box (long
 * labels wrap) and `maxHeight` enables the scroll in Multi mode.
 */
interface Props extends Pick<VizTooltipOptions, 'mode' | 'maxWidth' | 'maxHeight'> {
  state: EChartsTooltipState;
  /** Dismisses a pinned tooltip; wired to the close button. */
  dismiss: () => void;
}

/** "filter for" operator (`=`); `AdHocFilterModel['operator']` is `'=' | '!='`. */
const FILTER_FOR: AdHocFilterModel['operator'] = '=';

/**
 * Room core reserves for its window-edge math: `TooltipPlugin2` subtracts a
 * scrollbar's width from the viewport before deciding whether to flip.
 */
const SCROLLBAR_WIDTH = 16;

/**
 * Map a model row to a `VizTooltipItem`.
 *
 * The active (bold) row is the row's own `emphasis` when the model set one (pie
 * marks its hovered slice), otherwise the proximity-focused series. Core only
 * emphasises a row in Multi mode — in Single mode there is one row and bolding
 * it would just be noise — so `activeSeriesIndex` is passed as `null` there.
 */
function rowToItem(row: TooltipRow, activeSeriesIndex: number | null): VizTooltipItem {
  return {
    label: row.label,
    value: row.value,
    color: row.color,
    colorIndicator: VizTooltipColorIndicator.series,
    colorPlacement: VizTooltipColorPlacement.first,
    isActive: row.emphasis ?? (row.seriesIndex != null && row.seriesIndex === activeSeriesIndex),
  };
}

/** One "filter for" ad-hoc filter per field label, wired to the panel context. */
function buildAdHocFilters(field: Field, onAddAdHocFilter: PanelContext['onAddAdHocFilter']): AdHocFilterModel[] {
  if (onAddAdHocFilter == null || field.labels == null) {
    return [];
  }
  return Object.entries(field.labels).map(([key, value]) => ({
    key,
    value,
    operator: FILTER_FOR,
    onClick: () => onAddAdHocFilter({ key, value, operator: FILTER_FOR }),
  }));
}

/** Keep the first entry per key, preserving order. */
function dedupeBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const id = key(item);
    if (seen.has(id)) {
      return false;
    }
    seen.add(id);
    return true;
  });
}

/** The footer's data links across every source field, deduped like core's own. */
function collectDataLinks(sources: TooltipSource[]): Array<LinkModel<Field>> {
  const links = sources.flatMap((source) => getFieldDisplayLinks(source.field, source.rowIndex));
  return dedupeBy(links, (link) => `${link.title}/${link.href}`);
}

/** The footer's ad-hoc filters across every source field, deduped by key/value. */
function collectAdHocFilters(
  sources: TooltipSource[],
  onAddAdHocFilter: PanelContext['onAddAdHocFilter']
): AdHocFilterModel[] {
  const filters = sources.flatMap((source) => buildAdHocFilters(source.field, onAddAdHocFilter));
  return dedupeBy(filters, (filter) => `${filter.key}/${filter.value}`);
}

/**
 * The footer's source fields: the single focused item's (Single mode), else the
 * rows matching the clicked series (multi-row "All" tooltips) — mirroring core,
 * where the pinned footer belongs to the hovered series.
 *
 * Usually one source. A multi-value item (candlestick/boxplot) expands into one
 * row per packed dimension, each backed by its own field, and those rows all
 * share the item's series index — so all of them match and the footer shows the
 * union of their links.
 */
function resolveActiveSources(state: EChartsTooltipState): TooltipSource[] {
  const { model, pinnedItem } = state;
  if (model == null) {
    return [];
  }
  if (model.source != null) {
    return [model.source];
  }
  const seriesIndex = pinnedItem?.seriesIndex;
  if (seriesIndex == null) {
    return [];
  }
  return model.rows.flatMap((row) => (row.seriesIndex === seriesIndex && row.source != null ? [row.source] : []));
}

/**
 * Chrome copied from core's `TooltipPlugin2` wrapper so the tooltip is
 * indistinguishable from the core panels': elevated background, weak border,
 * default radius, z2 shadow (z3 pinned), no padding of its own (the VizTooltip
 * content pieces carry their padding), and transform-based positioning with no
 * transition.
 */
const getStyles = (theme: GrafanaTheme2) => ({
  wrapper: css({
    top: 0,
    left: 0,
    zIndex: theme.zIndex.tooltip,
    whiteSpace: 'pre',
    borderRadius: theme.shape.radius.default,
    position: 'fixed',
    background: theme.colors.background.elevated,
    border: `1px solid ${theme.colors.border.weak}`,
    boxShadow: theme.shadows.z2,
    userSelect: 'text',
  }),
  pinned: css({
    boxShadow: theme.shadows.z3,
  }),
  // Matches core's tooltip CloseButton placement (absolute top-right).
  closeButton: css({
    position: 'absolute',
    margin: 0,
    right: 5,
    top: 6,
    zIndex: 1,
  }),
});

/**
 * Position the tooltip beside the cursor like core's `TooltipPlugin2`: offset by
 * `TOOLTIP_OFFSET`, and when it would overflow the viewport (minus a scrollbar's
 * width), flip to the cursor's other side via `translate(-100%)`.
 */
function cursorTransform(position: { x: number; y: number }, size: { width: number; height: number }): string {
  const winWid = window.innerWidth - SCROLLBAR_WIDTH;
  const winHgt = window.innerHeight - SCROLLBAR_WIDTH;
  const width = size.width + TOOLTIP_OFFSET.x;
  const height = size.height + TOOLTIP_OFFSET.y;

  const flipX = position.x + width > winWid && position.x - width >= 0;
  const flipY = position.y + height > winHgt && position.y - height >= 0;

  const shiftX = position.x + (flipX ? -TOOLTIP_OFFSET.x : TOOLTIP_OFFSET.x);
  const shiftY = position.y + (flipY ? -TOOLTIP_OFFSET.y : TOOLTIP_OFFSET.y);
  const reflectX = flipX ? ' translateX(-100%)' : '';
  const reflectY = flipY ? ' translateY(-100%)' : '';

  return `translateX(${shiftX}px)${reflectX} translateY(${shiftY}px)${reflectY}`;
}

/**
 * Renders the ECharts hover state with `@grafana/ui`'s `VizTooltip` pieces,
 * visually matching the core Grafana panel tooltips (timeseries/barchart). It is
 * purely presentational — it consumes {@link EChartsTooltipState} and knows
 * nothing about ECharts — so the React tooltip layer stays isolated from the
 * chart code.
 *
 * When pinned, the tooltip is interactive, shows a close button, and a footer
 * with the focused field's data links and label-based ad-hoc filters.
 * Annotations are not wired yet — see the `@todo` below.
 */
export const EChartsTooltip: React.FC<Props> = ({ state, dismiss, mode, maxWidth, maxHeight }) => {
  // Hooks must run before any early return (Rules of Hooks).
  const { onAddAdHocFilter } = usePanelContext();
  const styles = useStyles2(getStyles);
  const wrapperRef = useRef<HTMLDivElement>(null);
  // Latest placement, so the ResizeObserver below always positions against the
  // current cursor without being torn down on every mouse move.
  const placeRef = useRef<() => void>(() => undefined);

  const { model, position, visible, pinned } = state;
  const active = visible && model != null && position != null;

  // Positioned imperatively, as core's `TooltipPlugin2` does: writing the
  // transform straight to the node keeps the cursor-follow off React's render
  // path. Going through state instead would re-render the whole tooltip — footer
  // and data links included — on every mouse move.
  useLayoutEffect(() => {
    placeRef.current = () => {
      const dom = wrapperRef.current;
      if (dom == null || position == null) {
        return;
      }
      dom.style.transform = cursorTransform(position, { width: dom.offsetWidth, height: dom.offsetHeight });
    };
    placeRef.current();
  }, [position]);

  // Re-place when the content resizes, so the edge-flip math reacts to a change
  // of row count (mirrors TooltipPlugin2's ResizeObserver on its wrapper).
  useLayoutEffect(() => {
    const dom = wrapperRef.current;
    if (!active || dom == null) {
      return;
    }
    const observer = new ResizeObserver(() => placeRef.current());
    observer.observe(dom);
    return () => observer.disconnect();
  }, [active]);

  if (!active) {
    return null;
  }

  const hasHeader = model.header != null && (model.header.label !== '' || model.header.value !== '');
  if (!hasHeader && model.rows.length === 0) {
    return null;
  }

  // Core only emphasises a row in Multi mode; in Single there is one row and
  // bolding it would just be noise. A series index also only identifies a row
  // when rows map 1:1 to series — a multi-value item (candlestick/boxplot)
  // expands into several rows sharing one series index, so bolding "the" active
  // row would bold all of them. Fall back to no active row in that case.
  const activeSeriesIndex = mode === TooltipDisplayMode.Multi ? state.activeSeriesIndex : null;
  const activeRowCount = model.rows.filter((row) => row.seriesIndex === activeSeriesIndex).length;
  const items = model.rows.map((row) => rowToItem(row, activeRowCount === 1 ? activeSeriesIndex : null));

  // The footer is interactive, so it is only shown when pinned (the tooltip only
  // receives pointer events when pinned). Mirrors core Grafana, which shows the
  // links/filters footer for the focused series once pinned.
  let footer: React.ReactNode = null;
  if (pinned) {
    const sources = resolveActiveSources(state);
    const dataLinks = collectDataLinks(sources);
    const adHocFilters = collectAdHocFilters(sources, onAddAdHocFilter);
    if (dataLinks.length > 0 || adHocFilters.length > 0) {
      // @todo pass `annotate` once Grafana externalizes the annotation API for
      // plugins (VizTooltipFooter supports it; core wires it from PanelContext).
      footer = <VizTooltipFooter dataLinks={dataLinks} adHocFilters={adHocFilters} />;
    }
  }
  return (
    <Portal>
      <div
        ref={wrapperRef}
        className={cx(styles.wrapper, pinned && styles.pinned)}
        style={{
          // Only a pinned tooltip is interactive. While hovering it must stay
          // click-through, or it would swallow the pointer and flicker as the
          // cursor crosses it (core does the same).
          pointerEvents: pinned ? 'auto' : 'none',
          maxWidth: maxWidth ?? 'none',
        }}
        // Marks this subtree for the outside-click dismiss handler, so a click
        // *inside* a pinned tooltip (a data link, a "filter for" button) is not
        // treated as a click outside it.
        {...{ [TOOLTIP_MARKER_ATTR]: '' }}
        aria-live="polite"
        aria-atomic="true"
      >
        {pinned && <IconButton aria-label="Close" className={styles.closeButton} name="times" onClick={dismiss} />}
        <VizTooltipWrapper>
          <VizTooltipHeader item={model.header} isPinned={pinned} />
          <VizTooltipContent
            items={items}
            isPinned={pinned}
            scrollable={isTooltipScrollable({ mode, maxHeight })}
            maxHeight={maxHeight}
          />
          {footer}
        </VizTooltipWrapper>
      </div>
    </Portal>
  );
};
