import { TooltipDisplayMode } from '@grafana/schema';
import { debug, LOG_LEVELS } from 'development';
import { type ECBasicOption } from 'echarts/types/dist/shared';
import { partToWholeSeriesTypes } from 'editor/pie';
import { panelTypeToAxis } from 'lib/echarts/axes/converters';
import { resolveChartModule } from 'lib/echarts/charts/registry';
import { type ChartContext } from 'lib/echarts/charts/types';
import { framesHaveTimeField } from 'lib/echarts/converters/frames';
import { applyPartToWholeEditorModeDefaults } from 'lib/echarts/options/pie';
import { resolveAnimation } from 'lib/echarts/performance/resolvers';
import { getTimeBrushOption } from 'lib/echarts/timeBrush';
import { NOOP_TOOLTIP_SINK, type TooltipSink } from 'lib/echarts/tooltip/model';
import { getCrosshairAxisPointer, getNoTooltipOption } from 'lib/echarts/tooltip/option';
import { buildPanelTooltip } from 'lib/echarts/tooltip/panelTooltip';
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
  // The part-to-whole family (pie/funnel) is excluded: it hides slices by
  // *category* name and reads hidden state internally (see `resolvePieSlices`).
  // It also normalizes its options by editor mode here (before both the series
  // build and the `animation` read below) so Default mode drops any stored pie
  // Advanced values (and resets the shared `animation`); the funnel's layout
  // options are Default-visible and pass through untouched (see
  // `applyPartToWholeEditorModeDefaults`).
  const ctx: ChartContext = partToWholeSeriesTypes.includes(rawCtx.seriesType)
    ? { ...rawCtx, tooltipSink: sink, options: applyPartToWholeEditorModeDefaults(rawCtx.options) }
    : { ...rawCtx, tooltipSink: sink, frames: stripHiddenValueFields(rawCtx.frames, rawCtx.fieldConfig) };

  // Axis type is data-driven for the cartesian family: Numeric frames render on a category axis, which changes the tooltip trigger and drops the time crosshair.
  const hasTimeField = framesHaveTimeField(ctx.frames);
  const axisType = panelTypeToAxis(ctx, hasTimeField);
  const { option: tooltipOption, mode: tooltipMode } = buildPanelTooltip(ctx, chartModule, axisType);

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
    // Animation is opt-in and off by default for every family — density
    // thresholds were tried and could not fire early enough to help. See
    // `resolveAnimation`.
    animation: resolveAnimation(ctx.options),
    ...(axisPointer ? { axisPointer } : {}),
    ...(isTimeAxis ? { brush: getTimeBrushOption(ctx.theme) } : {}),
  };
}
