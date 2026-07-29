import { type VizLegendOptions } from '@grafana/schema';
import { type VizLegendItem } from '@grafana/ui';
import { type ChartContext, type ChartModule } from 'lib/echarts/charts/types';
import { useMemo } from 'react';

/**
 * The legend rows for the current data, built by the chart family (each maps its
 * own marks to items — fields, slices, or packed dimensions). Empty when the
 * legend is hidden, so the panel skips the work entirely rather than building
 * items nothing renders.
 */
export function useLegendItems(
  chartModule: ChartModule,
  chartContext: ChartContext,
  resolvedLegend: VizLegendOptions,
  isVizLegend: boolean
): VizLegendItem[] {
  return useMemo(() => {
    if (!isVizLegend) {
      return [];
    }
    return chartModule.buildLegendItems(chartContext, resolvedLegend.calcs ?? []);
  }, [isVizLegend, chartModule, chartContext, resolvedLegend]);
}
