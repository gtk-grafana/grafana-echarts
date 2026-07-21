import { type Field } from '@grafana/data';
import { type TooltipDisplayMode } from '@grafana/schema';
import {
  type AdHocFilterModel,
  getFieldDisplayLinks,
  isTooltipScrollable,
  type PanelContext,
  Portal,
  usePanelContext,
  VizTooltipColorIndicator,
  VizTooltipColorPlacement,
  VizTooltipContainer,
  VizTooltipContent,
  VizTooltipFooter,
  VizTooltipHeader,
  type VizTooltipItem,
  VizTooltipWrapper,
} from '@grafana/ui';
import { type TooltipRow } from 'lib/echarts/tooltip/model';
import React from 'react';
import { type EChartsTooltipState, TOOLTIP_MARKER_ATTR, TOOLTIP_OFFSET } from './useEChartsTooltip';

interface Props {
  state: EChartsTooltipState;
  /** Tooltip display mode; drives whether the content area scrolls. */
  mode: TooltipDisplayMode;
  /** Max content width in px (Grafana `tooltip.maxWidth`); long labels wrap. */
  maxWidth?: number;
  /** Max content height in px (Grafana `tooltip.maxHeight`); enables scroll in Multi mode. */
  maxHeight?: number;
}

/** "filter for" operator (`=`); `AdHocFilterModel['operator']` is `'=' | '!='`. */
const FILTER_FOR: AdHocFilterModel['operator'] = '=';

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
 * Renders the ECharts hover state with `@grafana/ui`'s `VizTooltip`, matching the
 * core Grafana panel tooltips (timeseries/barchart). It is purely presentational
 * — it consumes {@link EChartsTooltipState} and knows nothing about ECharts — so
 * the React tooltip layer stays isolated from the chart code. Positioned by
 * `VizTooltipContainer` (fixed + viewport-clamped) inside a `Portal`.
 *
 * When pinned, the tooltip is interactive and shows a footer of the hovered
 * field's data links and label-based ad-hoc filters. Annotations are not wired
 * yet — see the `@todo` below.
 */
export const EChartsTooltip: React.FC<Props> = ({ state, mode, maxWidth, maxHeight }) => {
  // `usePanelContext` must run before any early return (Rules of Hooks).
  const { onAddAdHocFilter } = usePanelContext();
  const { model, position, visible, pinned } = state;

  if (!visible || model == null || position == null) {
    return null;
  }

  const hasHeader = model.header != null && model.header !== '';
  if (!hasHeader && model.rows.length === 0) {
    return null;
  }

  const items = model.rows.map(rowToItem);

  // The footer is interactive, so it is only shown when pinned (the tooltip only
  // receives pointer events when pinned). Mirrors core Grafana, which shows the
  // links/filters footer for a focused series once pinned.
  let footer: React.ReactNode = null;
  if (pinned && model.source != null) {
    const dataLinks = getFieldDisplayLinks(model.source.field, model.source.rowIndex);
    const adHocFilters = buildAdHocFilters(model.source.field, onAddAdHocFilter);
    if (dataLinks.length > 0 || adHocFilters.length > 0) {
      // @todo pass `annotate` once Grafana externalizes the annotation API for
      // plugins (VizTooltipFooter supports it; core wires it from PanelContext).
      footer = <VizTooltipFooter dataLinks={dataLinks} adHocFilters={adHocFilters} />;
    }
  }

  return (
    <Portal>
      <VizTooltipContainer position={position} offset={TOOLTIP_OFFSET} allowPointerEvents={pinned}>
        <div {...{ [TOOLTIP_MARKER_ATTR]: '' }} style={{ maxWidth: maxWidth != null ? `${maxWidth}px` : undefined }}>
          <VizTooltipWrapper>
            {hasHeader && <VizTooltipHeader item={{ label: model.header!, value: '' }} isPinned={pinned} />}
            <VizTooltipContent
              items={items}
              isPinned={pinned}
              scrollable={isTooltipScrollable({ mode, maxHeight })}
              maxHeight={maxHeight}
            />
            {footer}
          </VizTooltipWrapper>
        </div>
      </VizTooltipContainer>
    </Portal>
  );
};
