import { TooltipDisplayMode } from '@grafana/schema';
import { debug, LOG_LEVELS } from 'development';
import { type ECBasicOption } from 'echarts/types/dist/shared';
import { panelTypeToAxis } from 'lib/echarts/axes/converters';
import { resolveChartModule } from 'lib/echarts/charts/registry';
import { type ChartContext } from 'lib/echarts/charts/types';
import { framesHaveTimeField } from 'lib/echarts/converters/frames';
import { getTimeBrushOption } from 'lib/echarts/timeBrush';
import { stripHiddenValueFields } from 'lib/grafana/fields/fieldConfig';
import {
  getCrosshairAxisPointer,
  getNoTooltipOption,
  getTooltipOption,
  grafanaTooltipModeToEChartsTrigger,
} from 'lib/echarts/tooltip';

/**
 * Assemble the full ECharts option a panel feeds to `setOption`.
 *
 * This is the React-free counterpart to `Panel.tsx`: it resolves the chart
 * module, builds its option, and layers on the tooltip and (for non-category
 * axes) crosshair axisPointer. Keeping the assembly here isolates the ECharts
 * option shape from the component (per AGENTS.md) and lets tests snapshot the
 * exact option the panel renders. Returns `null` when no chart module matches
 * the series type or the module produces no option.
 */
export function buildPanelChartOption(
  rawCtx: ChartContext,
  { isGrafanaLegend }: { isGrafanaLegend: boolean }
): ECBasicOption {
  const chartModule = resolveChartModule(rawCtx.seriesType);
  if (!chartModule) {
    debug('Invalid chart module', LOG_LEVELS.error, rawCtx);
    throw new Error(`Invalid chart module for ${rawCtx.seriesType}`);
  }

  // Drop value fields hidden via the legend visibility toggle before building.
  // The hidden set is read from `fieldConfig` (see `stripHiddenValueFields` /
  // `getHiddenSeriesNames`), not from Grafana-applied `hideFrom.viz`, so an
  // un-toggle restores the series immediately. Doing it once here keeps series,
  // axes, and tooltip formatters consistent for the per-field families
  // (cartesian/radar/heatmap overlays). The DOM legend is built separately in
  // `Panel.tsx` from the original frames, so hidden series remain (greyed).
  //
  // Row/series families that read hidden slices by name internally (the pie)
  // opt out via `readsHiddenSeriesInternally`: they hide by *category* name, and
  // this pre-strip hides by *numeric field* name, so it would drop the single
  // value field the pie needs — leaving no data and throwing below.
  const ctx: ChartContext = chartModule.readsHiddenSeriesInternally
    ? rawCtx
    : { ...rawCtx, frames: stripHiddenValueFields(rawCtx.frames, rawCtx.fieldConfig) };

  // Axis type is data-driven for the cartesian family: Numeric frames render on a category axis, which changes the tooltip trigger and drops the time crosshair.
  const hasTimeField = framesHaveTimeField(ctx.frames);
  const axisType = panelTypeToAxis(ctx, hasTimeField);
  const tooltipMode = ctx.options.tooltip?.mode ?? TooltipDisplayMode.Single;
  const tooltipOption = getTooltipOption(
    grafanaTooltipModeToEChartsTrigger(axisType, tooltipMode),
    tooltipMode,
    // Per-series resolver so each row honors its field's unit/decimals overrides.
    chartModule.getTooltipValueFormatter(ctx),
    ctx.theme
  );

  const echartOption = chartModule.buildOption(ctx, { isGrafanaLegend });
  if (!echartOption) {
    debug('Invalid chart option', LOG_LEVELS.error, ctx);
    throw new Error(`Invalid chart option resolved for ${ctx.seriesType}`);
  }

  // Only cartesian-grid charts (non-category axes) have an axis to draw the crosshair on.
  // @todo clean up nested ternary
  const axisPointer =
    axisType !== 'category'
      ? tooltipMode === TooltipDisplayMode.None
        ? getNoTooltipOption()
        : getCrosshairAxisPointer()
      : undefined;

  // Drag-to-zoom is only meaningful on a time axis, where the brush selection
  // maps to an absolute time range the dashboard can adopt. The cursor is armed
  // programmatically in Panel.tsx after `setOption`.
  const isTimeAxis = hasTimeField && axisType === 'time';

  return {
    ...echartOption,
    tooltip: tooltipOption,
    animation: ctx.options.animation?.enabled,
    ...(axisPointer ? { axisPointer } : {}),
    ...(isTimeAxis ? { brush: getTimeBrushOption(ctx.theme) } : {}),
  };
}
