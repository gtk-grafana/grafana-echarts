import { TooltipDisplayMode } from '@grafana/schema';
import { debug, LOG_LEVELS } from 'development';
import { type ECBasicOption } from 'echarts/types/dist/shared';
import { partToWholeSeriesTypes } from 'editor/pie';
import { panelTypeToAxis } from 'lib/echarts/axes/converters';
import { isRelationsSeriesType } from 'lib/echarts/charts/narrowing';
import { resolveChartModule } from 'lib/echarts/charts/registry';
import { type ChartContext } from 'lib/echarts/charts/types';
import { framesHaveTimeField } from 'lib/echarts/converters/frames';
import { applyEditorModeDefaults } from 'lib/echarts/options/editorMode';
import { resolveAnimation } from 'lib/echarts/performance/resolvers';
import { getTimeBrushOption } from 'lib/echarts/timeBrush';
import { NOOP_TOOLTIP_SINK } from 'lib/echarts/tooltip/model';
import { type TooltipSink } from 'lib/echarts/tooltip/types';
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
 * exact option the panel renders.
 *
 * Returns `null` when no chart module matches the series type or the module
 * derives no chart from the data, so the caller can leave the panel empty. A
 * response the family cannot read *at all* is a different case: the module throws
 * with an explanation, because a blank panel would hide a fixable problem (see
 * `frameToRelationsGraph`).
 */
export function buildPanelChartOption(
  rawCtx: ChartContext,
  { isGrafanaLegend, tooltipSink }: { isGrafanaLegend: boolean; tooltipSink?: TooltipSink }
): ECBasicOption | null {
  const chartModule = resolveChartModule(rawCtx.seriesType);
  if (!chartModule) {
    debug('Invalid chart module', LOG_LEVELS.error, rawCtx);
    return null;
  }

  // Normalize options by editor mode for every family (before both the series
  // build and the `animation` read below) so Default mode renders the plain
  // chart regardless of any stored Advanced values. The dispatch is identity for
  // families with no Advanced tier, so this is a no-op for them (see
  // `applyEditorModeDefaults`). This generalizes what was the pie-only
  // `applyPartToWholeEditorModeDefaults`, which also closes the cartesian
  // normalization gap noted in `docs/performance.md`.
  const options = applyEditorModeDefaults(rawCtx.seriesType, rawCtx.options);

  // The React overlay's sink, threaded onto the context so per-series formatters
  // (pie/hierarchy/heatmap) emit through the same channel as the top-level one.
  const sink = tooltipSink ?? NOOP_TOOLTIP_SINK;

  // Drop value fields hidden via the legend visibility toggle before building.
  //
  // Two families opt out and hide their own marks instead, for different reasons:
  //
  // - **part-to-whole** (pie/funnel slices — see `resolvePieSlices`) because its
  //   legend rows are frame *rows*, so the override names categories and never
  //   matches a field. Stripping would be actively wrong, not merely useless: the
  //   `byNames` matcher is in *exclude* mode, so a list of category names marks
  //   every real numeric field hidden and the stat column that sizes and colours
  //   the chart would be deleted.
  // - **relations** (graph/sankey/chord) because deleting a mark's column destroys
  //   the information its reader needs. A node's field carries the fact that it was
  //   hidden; remove the field and `frameToGraphWide` simply *re-derives* the node
  //   from the edges that still name it, so the node comes back. Hiding a node also
  //   has to take its incident edges with it, which is a graph question a
  //   column-level strip cannot express. Both happen in `withoutHiddenMarks`, off
  //   each mark's own `custom.hideFrom.viz`.
  //
  // Editor-mode normalization already ran generically above
  // (`applyEditorModeDefaults`), so both branches use the normalized `options`.
  const hidesItsOwnMarks =
    partToWholeSeriesTypes.includes(rawCtx.seriesType) || isRelationsSeriesType(rawCtx.seriesType);
  const ctx: ChartContext = hidesItsOwnMarks
    ? { ...rawCtx, tooltipSink: sink, options }
    : { ...rawCtx, tooltipSink: sink, options, frames: stripHiddenValueFields(rawCtx.frames, rawCtx.fieldConfig) };

  // Axis type is data-driven for the cartesian family: Numeric frames render on a category axis, which changes the tooltip trigger and drops the time crosshair.
  const hasTimeField = framesHaveTimeField(ctx.frames);
  const axisType = panelTypeToAxis(ctx, hasTimeField);
  const { option: tooltipOption, mode: tooltipMode } = buildPanelTooltip(ctx, chartModule, axisType);

  // No option means "nothing to draw from this data" — an empty response, or one
  // whose shape carries no chart. Every other family already falls back to the
  // no-data view for that, so this does too rather than throwing.
  const echartOption = chartModule.buildOption(ctx, { isGrafanaLegend });
  if (!echartOption) {
    debug('No chart option resolved', LOG_LEVELS.debug, ctx);
    return null;
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
  // programmatically in Panel.tsx after `setOption`. Families whose time axis is
  // not a cartesian grid axis opt out (see `ChartModule.disableTimeBrush`).
  const isTimeAxis = hasTimeField && axisType === 'time' && !chartModule.disableTimeBrush;

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
