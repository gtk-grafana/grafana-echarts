import { TooltipDisplayMode } from '@grafana/schema';
import { type ECBasicOption } from 'echarts/types/dist/shared';
import { panelTypeToAxis } from 'lib/echarts/axes/converters';
import { resolveChartModule } from 'lib/echarts/charts/registry';
import { type ChartContext } from 'lib/echarts/charts/types';
import { framesHaveTimeField } from 'lib/echarts/converters/frames';
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
  ctx: ChartContext,
  { isGrafanaLegend }: { isGrafanaLegend: boolean }
): ECBasicOption {
  const chartModule = resolveChartModule(ctx.seriesType);
  if (!chartModule) {
    throw new Error(`Invalid chart module ${chartModule} for ${ctx.seriesType}`)
  }

  // Axis type is data-driven for the cartesian family: Numeric frames (no time
  // field) render on a category axis, which changes the tooltip trigger and
  // drops the time crosshair below.
  const axisType = panelTypeToAxis(ctx.seriesType, framesHaveTimeField(ctx.frames));
  const tooltipMode = ctx.options.tooltip?.mode ?? TooltipDisplayMode.Single;
  const tooltipOption = getTooltipOption(
    grafanaTooltipModeToEChartsTrigger(axisType, tooltipMode),
    tooltipMode,
    ctx.formatValue,
    ctx.theme
  );

  const echartOption = chartModule.buildOption(ctx, { isGrafanaLegend });
  if (!echartOption) {
    console.error('Invalid chart option', ctx);
    throw new Error(`Invalid chart option resolved for ${chartModule} for ${ctx.seriesType}`);
  }

  // Only cartesian-grid charts (non-category axes) have an axis to draw the crosshair on.
  // @todo clean up nested ternary
  const axisPointer =
    axisType !== 'category'
      ? tooltipMode === TooltipDisplayMode.None
        ? getNoTooltipOption()
        : getCrosshairAxisPointer()
      : undefined;

  return {
    ...echartOption,
    tooltip: tooltipOption,
    animation: ctx.options.animation?.enabled,
    ...(axisPointer ? { axisPointer } : {}),
  };
}
