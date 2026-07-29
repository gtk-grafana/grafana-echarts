import { type HeatmapSeriesType } from 'editor/types';
import { collectTimeSeriesFields } from 'lib/echarts/converters/frames';
import { heatmapLayoutDefault } from 'lib/echarts/options/constants';
import { DEFAULT_CHART_LEGEND } from 'lib/echarts/options/legend';
import { getFieldValueFormatters } from 'lib/echarts/style';
import { indexedFormatterResolver } from 'lib/echarts/tooltip/model';
import { buildBinnedHeatmapLegendItems, buildBinnedHeatmapOption, getOverlayFrames } from './binnedHeatmap';
import { buildMatrixHeatmapOption } from './matrixHeatmap';
import {
  type ChartContext,
  type ChartModule,
  type EChartBinnedHeatmapOption,
  type EChartMatrixHeatmapOption,
} from './types';

/**
 * The heatmap panel family. The persisted `seriesType: 'heatmap'` routes here
 * (see `resolveChartModule`); the concrete rendering is picked by the
 * `heatmapLayout` panel option:
 * - `binned` (default): dataplane heatmap frames drawn as interval cells on
 *   continuous axes via a custom series (see `buildBinnedHeatmapOption`).
 * - `matrix`: a category × category grid via the native ECharts heatmap series
 *   (see `buildMatrixHeatmapOption`; not yet implemented).
 */
export const heatmapChartModule: ChartModule = {
  legend: DEFAULT_CHART_LEGEND,
  buildLegendItems(ctx, calcs) {
    return buildBinnedHeatmapLegendItems(ctx, calcs);
  },

  // The cell layer is series index 0 (it carries its own per-cell tooltip
  // formatter); the cartesian overlays follow at index 1..N. Align a formatter
  // per series so each overlay row honors its field's unit/decimals overrides,
  // matching the cartesian panel. Overlay fields are collected in the same order
  // the overlay series are emitted (see `buildBinnedHeatmapOption`).
  getTooltipValueFormatter(ctx) {
    const overlayFields = collectTimeSeriesFields(getOverlayFrames(ctx));
    const overlayFormatters = getFieldValueFormatters(overlayFields, ctx.theme, ctx.timeZone);
    const formatters = [ctx.formatValue, ...overlayFormatters];
    return indexedFormatterResolver(formatters, ctx.formatValue, 'seriesIndex');
  },

  buildOption(
    ctx: ChartContext<HeatmapSeriesType>,
    base
  ): EChartBinnedHeatmapOption | EChartMatrixHeatmapOption | null {
    const layout = ctx.options.heatmapLayout ?? heatmapLayoutDefault;
    if (layout === 'matrix') {
      return buildMatrixHeatmapOption(ctx, base);
    }
    return buildBinnedHeatmapOption(ctx, base);
  },
};
