import { TooltipDisplayMode } from '@grafana/schema';
import { debug, LOG_LEVELS } from 'development';
import { type ECBasicOption } from 'echarts/types/dist/shared';
import { pieSeriesTypes } from 'editor/pie';
import { panelTypeToAxis } from 'lib/echarts/axes/converters';
import { resolveChartModule } from 'lib/echarts/charts/registry';
import { type ChartContext } from 'lib/echarts/charts/types';
import { framesHaveTimeField } from 'lib/echarts/converters/frames';
import { applyPieEditorModeDefaults } from 'lib/echarts/options/pie';
import { getTimeBrushOption } from 'lib/echarts/timeBrush';
import {
  buildTooltipModel,
  getCrosshairAxisPointer,
  getNoTooltipOption,
  getSilentTooltipOption,
  grafanaTooltipModeToEChartsTrigger,
  NOOP_TOOLTIP_SINK,
  type TooltipSink,
} from 'lib/echarts/tooltip';
import { stripHiddenValueFields } from 'lib/grafana/fields/fieldConfig';

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
  { isGrafanaLegend, tooltipSink }: { isGrafanaLegend: boolean; tooltipSink?: TooltipSink }
): ECBasicOption {
  const chartModule = resolveChartModule(rawCtx.seriesType);
  if (!chartModule) {
    debug('Invalid chart module', LOG_LEVELS.error, rawCtx);
    throw new Error(`Invalid chart module for ${rawCtx.seriesType}`);
  }

  // The React overlay's sink, threaded onto the context so per-series formatters
  // (pie/hierarchy/heatmap) emit through the same channel as the top-level one.
  const sink = tooltipSink ?? NOOP_TOOLTIP_SINK;

  // Drop value fields hidden via the legend visibility toggle before building.
  // The pie is excluded: it hides slices by *category* name and reads hidden state internally (see `resolvePieSlices`).
  // The pie also normalizes its options by editor mode here (before both the
  // series build and the `animation` read below) so Default mode renders the
  // plain pie regardless of any stored Advanced values (see `applyPieEditorModeDefaults`).
  const ctx: ChartContext = pieSeriesTypes.includes(rawCtx.seriesType)
    ? { ...rawCtx, tooltipSink: sink, options: applyPieEditorModeDefaults(rawCtx.options) }
    : { ...rawCtx, tooltipSink: sink, frames: stripHiddenValueFields(rawCtx.frames, rawCtx.fieldConfig) };

  // Axis type is data-driven for the cartesian family: Numeric frames render on a category axis, which changes the tooltip trigger and drops the time crosshair.
  const hasTimeField = framesHaveTimeField(ctx.frames);
  const axisType = panelTypeToAxis(ctx, hasTimeField);
  const tooltipMode = ctx.options.tooltip?.mode ?? TooltipDisplayMode.Single;
  // Per-series resolver so each row honors its field's unit/decimals overrides.
  const resolveValueFormatter = chartModule.getTooltipValueFormatter(ctx);
  // Optional per-family field resolver so a single hovered item can surface its
  // field's data links / ad-hoc filters in the tooltip footer.
  const resolveField = chartModule.getTooltipFieldResolver?.(ctx);
  // Common tooltip parity: hide zero-value rows and sort by value, but only in
  // the multi-row "All" tooltip (mirrors `commonOptionsBuilder.addTooltipOptions`).
  const rowOptions =
    tooltipMode === TooltipDisplayMode.Multi
      ? { sort: ctx.options.tooltip?.sort, hideZeros: ctx.options.tooltip?.hideZeros }
      : undefined;
  const tooltipOption = getSilentTooltipOption(
    grafanaTooltipModeToEChartsTrigger(axisType, tooltipMode),
    tooltipMode,
    (params) => buildTooltipModel(params, resolveValueFormatter, rowOptions, resolveField),
    sink
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
