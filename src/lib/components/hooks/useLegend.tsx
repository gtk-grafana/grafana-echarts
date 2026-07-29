import { type EventBus, type FieldConfigSource } from '@grafana/data';
import { type VizLegendOptions } from '@grafana/schema';
import {
  PanelContextProvider,
  SeriesVisibilityChangeBehavior,
  usePanelContext,
  type VizLayoutLegendProps,
  type VizLegendItem,
  VizLayout,
  VizLegend,
} from '@grafana/ui';
import { partToWholeSeriesTypes } from 'editor/pie';
import { type SeriesType } from 'editor/types';
import { isMultiValueSeriesType } from 'lib/echarts/charts/narrowing';
import { type ChartContext, type ChartModule } from 'lib/echarts/charts/types';
import React, { useCallback, useMemo } from 'react';
import { useLegendItems } from './useLegendItems';
import { useSeriesColorChange } from './useSeriesColorChange';
import { useSeriesVisibility } from './useSeriesVisibility';

interface Options {
  chartModule: ChartModule;
  chartContext: ChartContext;
  /** Chart-family defaults merged under the user's `options.legend`. */
  resolvedLegend: VizLegendOptions;
  /** True when the Grafana DOM legend is the one rendering (not ECharts' native). */
  isVizLegend: boolean;
  seriesType: SeriesType;
  fieldConfig: FieldConfigSource;
  onFieldConfigChange: (config: FieldConfigSource) => void;
  eventBus: EventBus;
}

/**
 * The panel's Grafana DOM legend: its items, and the render prop `VizLayout`
 * takes.
 *
 * Owns the interaction wiring too, because `VizLegend` reads both handlers off
 * `PanelContext` rather than props: a color pick and a visibility toggle are
 * persisted as field-config overrides (see `useSeriesColorChange` /
 * `useSeriesVisibility`), which is what makes them survive a reload.
 *
 * `items` is returned alongside `renderLegend` so the caller can decide whether
 * to give `VizLayout` a legend at all — an empty legend still reserves layout.
 */
export function useLegend({
  chartModule,
  chartContext,
  resolvedLegend,
  isVizLegend,
  seriesType,
  fieldConfig,
  onFieldConfigChange,
  eventBus,
}: Options): { items: VizLegendItem[]; renderLegend: () => React.ReactElement<VizLayoutLegendProps> } {
  const panelContext = usePanelContext();
  const items = useLegendItems(chartModule, chartContext, resolvedLegend, isVizLegend);
  const onSeriesColorChange = useSeriesColorChange(fieldConfig, onFieldConfigChange);
  const onToggleSeriesVisibility = useSeriesVisibility(fieldConfig, onFieldConfigChange, items);

  const legendContextValue = useMemo(
    () => ({
      ...panelContext,
      eventBus,
      onSeriesColorChange,
      onToggleSeriesVisibility,
    }),
    [panelContext, eventBus, onSeriesColorChange, onToggleSeriesVisibility]
  );

  // Part-to-whole slices (pie/funnel) and candlestick/boxplot series map to
  // legend items individually (not 1:1 with fields), so each click toggles that
  // one item (Hide behavior) rather than the isolate-others default used by
  // per-field families.
  const seriesVisibilityChangeBehavior =
    partToWholeSeriesTypes.includes(seriesType) || isMultiValueSeriesType(seriesType)
      ? SeriesVisibilityChangeBehavior.Hide
      : SeriesVisibilityChangeBehavior.Isolate;

  const renderLegend = useCallback(
    () => (
      <VizLayout.Legend placement={resolvedLegend.placement} width={resolvedLegend.width}>
        <PanelContextProvider value={legendContextValue}>
          <VizLegend
            items={items}
            displayMode={resolvedLegend.displayMode}
            placement={resolvedLegend.placement}
            seriesVisibilityChangeBehavior={seriesVisibilityChangeBehavior}
            sortBy={resolvedLegend.sortBy}
            sortDesc={resolvedLegend.sortDesc}
            isSortable={true}
            limit={resolvedLegend.limit}
          />
        </PanelContextProvider>
      </VizLayout.Legend>
    ),
    [legendContextValue, items, resolvedLegend, seriesVisibilityChangeBehavior]
  );

  return { items, renderLegend };
}
