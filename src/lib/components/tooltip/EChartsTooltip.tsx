import { css } from '@emotion/css';
import { type Field, type GrafanaTheme2 } from '@grafana/data';
import { type TooltipDisplayMode } from '@grafana/schema';
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
  VizTooltipContainer,
  VizTooltipContent,
  VizTooltipFooter,
  VizTooltipHeader,
  type VizTooltipItem,
  VizTooltipWrapper,
} from '@grafana/ui';
import { type TooltipRow, type TooltipSource } from 'lib/echarts/tooltip/model';
import React from 'react';
import { type EChartsTooltipState } from './useEChartsTooltip';

interface Props {
  state: EChartsTooltipState;
  /** Dismisses a pinned tooltip; wired to the close button. */
  dismiss: () => void;
  /** Tooltip display mode; drives whether the content area scrolls. */
  mode: TooltipDisplayMode;
  /** Max content width in px (Grafana `tooltip.maxWidth`); long labels wrap. */
  maxWidth?: number;
  /** Max content height in px (Grafana `tooltip.maxHeight`); enables scroll in Multi mode. */
  maxHeight?: number;
}

/** "filter for" operator (`=`); `AdHocFilterModel['operator']` is `'=' | '!='`. */
const FILTER_FOR: AdHocFilterModel['operator'] = '=';

// /**
//  * Room core reserves for its window-edge math: `TooltipPlugin2` subtracts a
//  * scrollbar's width from the viewport before deciding whether to flip.
//  */
// const SCROLLBAR_WIDTH = 16;

/** Map a model row to a `VizTooltipItem`; `emphasis` becomes the active (bold) row. */
function rowToItem(row: TooltipRow): VizTooltipItem {
  return {
    label: row.label,
    value: row.value,
    color: row.color,
    colorIndicator: VizTooltipColorIndicator.series,
    colorPlacement: VizTooltipColorPlacement.first,
    isActive: row.emphasis,
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

/**
 * The footer's source field: the single focused item's (Single mode), else the
 * row matching the clicked series (multi-row "All" tooltips) — mirroring core,
 * where the pinned footer belongs to the hovered series.
 */
function resolveActiveSource(state: EChartsTooltipState): TooltipSource | undefined {
  const { model, pinnedItem } = state;
  if (model == null) {
    return undefined;
  }
  if (model.source != null) {
    return model.source;
  }
  if (pinnedItem?.seriesIndex != null) {
    return model.rows.find((row) => row.seriesIndex === pinnedItem.seriesIndex && row.source != null)?.source;
  }
  return undefined;
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

// /**
//  * Position the tooltip beside the cursor like core's `TooltipPlugin2`: offset by
//  * `TOOLTIP_OFFSET`, and when it would overflow the viewport (minus a scrollbar's
//  * width), flip to the cursor's other side via `translate(-100%)`.
//  */
// function cursorTransform(position: { x: number; y: number }, size: { width: number; height: number }): string {
//   const winWid = window.innerWidth - SCROLLBAR_WIDTH;
//   const winHgt = window.innerHeight - SCROLLBAR_WIDTH;
//   const width = size.width + TOOLTIP_OFFSET.x;
//   const height = size.height + TOOLTIP_OFFSET.y;
//
//   const flipX = position.x + width > winWid && position.x - width >= 0;
//   const flipY = position.y + height > winHgt && position.y - height >= 0;
//
//   const shiftX = position.x + (flipX ? -TOOLTIP_OFFSET.x : TOOLTIP_OFFSET.x);
//   const shiftY = position.y + (flipY ? -TOOLTIP_OFFSET.y : TOOLTIP_OFFSET.y);
//   const reflectX = flipX ? ' translateX(-100%)' : '';
//   const reflectY = flipY ? ' translateY(-100%)' : '';
//
//   return `translateX(${shiftX}px)${reflectX} translateY(${shiftY}px)${reflectY}`;
// }

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
  // const wrapperRef = useRef<HTMLDivElement>(null);
  // const [size, setSize] = useState({ width: 0, height: 0 });

  const { model, position, visible, pinned } = state;
  const active = visible && model != null && position != null;

  // Track the rendered size so the edge-flip math reacts to content changes
  // (mirrors TooltipPlugin2's ResizeObserver on its wrapper).
  // useLayoutEffect(() => {
  //   const dom = wrapperRef.current;
  //   if (!active || dom == null) {
  //     return;
  //   }
  //   // const observer = new ResizeObserver((entries) => {
  //   //   // for (const entry of entries) {
  //   //   //   // const next = { width: entry.contentRect.width, height: entry.contentRect.height };
  //   //   //   // setSize((prev) => (prev.width === next.width && prev.height === next.height ? prev : next));
  //   //   // }
  //   // });
  //   // observer.observe(dom);
  //   // return () => observer.disconnect();
  // }, [active]);

  if (!active) {
    return null;
  }

  const hasHeader = model.header != null && (model.header.label !== '' || model.header.value !== '');
  if (!hasHeader && model.rows.length === 0) {
    return null;
  }

  const items = model.rows.map(rowToItem);

  // The footer is interactive, so it is only shown when pinned (the tooltip only
  // receives pointer events when pinned). Mirrors core Grafana, which shows the
  // links/filters footer for the focused series once pinned.
  let footer: React.ReactNode = null;
  if (pinned) {
    const source = resolveActiveSource(state);
    if (source != null) {
      const dataLinks = getFieldDisplayLinks(source.field, source.rowIndex);
      const adHocFilters = buildAdHocFilters(source.field, onAddAdHocFilter);
      if (dataLinks.length > 0 || adHocFilters.length > 0) {
        // @todo pass `annotate` once Grafana externalizes the annotation API for
        // plugins (VizTooltipFooter supports it; core wires it from PanelContext).
        footer = <VizTooltipFooter dataLinks={dataLinks} adHocFilters={adHocFilters} />;
      }
    }
  }
  console.log('model', model);
  console.log('position', position);

  return (
    <Portal>
      <VizTooltipContainer
        position={position}
        offset={{
          x: 0,
          y: 0,
        }}
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
      </VizTooltipContainer>
    </Portal>
  );
};
