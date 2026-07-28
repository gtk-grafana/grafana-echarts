import { dateTimeFormat } from '@grafana/data';
import { type TimeZone, TooltipDisplayMode } from '@grafana/schema';
import { type TooltipOption } from 'echarts/types/dist/shared';
import { type EChartsAxisType } from 'lib/echarts/axes/converters';
import { type ChartContext, type ChartModule } from 'lib/echarts/charts/types';
import { buildTooltipModel, NOOP_TOOLTIP_SINK } from 'lib/echarts/tooltip/model';
import { getSilentTooltipOption, grafanaTooltipModeToEChartsTrigger } from 'lib/echarts/tooltip/option';

/**
 * Format the hovered x value for the header with Grafana's time formatting:
 * item-trigger (Single) params carry the raw `[time, value]` tuple, and
 * axis-trigger `axisValueLabel` uses ECharts' own time format — both are
 * replaced so the header honors the dashboard time zone (core tooltip parity).
 */
function makeHeaderValueFormatter(timeZone: TimeZone | undefined, multiValueDimensions: string[] | undefined) {
  return (item: { value?: unknown; name?: string }) => {
    // A multi-value item's `value` starts with its *data index*, not the x value,
    // so reading `value[0]` would format index 1 as 1970-01-01. Those items carry
    // the x in `name`.
    const xValue: unknown = Array.isArray(item.value) ? item.value[0] : undefined;
    const raw: unknown = multiValueDimensions != null ? item.name : xValue;
    const time = typeof raw === 'string' ? Date.parse(raw) : raw;
    return typeof time === 'number' && !Number.isNaN(time) ? dateTimeFormat(time, { timeZone }) : undefined;
  };
}

/**
 * Assemble the panel-level tooltip: the ECharts `trigger` for this axis type and
 * Grafana tooltip mode, plus the `formatter` that turns each hovered item into a
 * {@link TooltipModel} for the React overlay. The box itself renders nothing —
 * see {@link getSilentTooltipOption}.
 *
 * The resolved `mode` comes back out because it may be *clamped* here: families
 * with no meaningful "All" tooltip fall back to Single, and the caller's
 * axisPointer has to reflect that rather than the requested mode.
 */
export function buildPanelTooltip(
  ctx: ChartContext,
  chartModule: ChartModule,
  axisType: EChartsAxisType
): { option: TooltipOption; mode: TooltipDisplayMode } {
  // Families with no meaningful "All" tooltip clamp a persisted `multi` back to
  // Single: their editor no longer offers it, but a dashboard saved before that
  // still carries the value (see `ChartModule.singleTooltipOnly`).
  const requested = ctx.options.tooltip?.mode ?? TooltipDisplayMode.Single;
  const mode =
    chartModule.singleTooltipOnly && requested === TooltipDisplayMode.Multi ? TooltipDisplayMode.Single : requested;

  // Per-series resolver so each row honors its field's unit/decimals overrides.
  const resolveValueFormatter = chartModule.getTooltipValueFormatter(ctx);
  // Optional per-family field resolver so hovered items can surface their
  // field's data links / ad-hoc filters in the tooltip footer.
  const resolveField = chartModule.getTooltipFieldResolver?.(ctx);
  // Common tooltip parity: hide zero-value rows and sort by value, but only in
  // the multi-row "All" tooltip (mirrors `commonOptionsBuilder.addTooltipOptions`).
  const rowOptions =
    mode === TooltipDisplayMode.Multi
      ? { sort: ctx.options.tooltip?.sort, hideZeros: ctx.options.tooltip?.hideZeros }
      : undefined;
  // Multi-value families (candlestick/boxplot) pack several values per item, so
  // the tooltip lists each dimension instead of just the last.
  const multiValueDimensions = chartModule.getTooltipDimensions?.(ctx);
  const formatHeaderValue =
    axisType === 'time' ? makeHeaderValueFormatter(ctx.timeZone, multiValueDimensions) : undefined;

  const option = getSilentTooltipOption(
    grafanaTooltipModeToEChartsTrigger(axisType, mode),
    mode,
    (params) =>
      buildTooltipModel(params, resolveValueFormatter, {
        rowOptions,
        resolveField,
        formatHeaderValue,
        multiValueDimensions,
      }),
    ctx.tooltipSink ?? NOOP_TOOLTIP_SINK
  );

  return { option, mode };
}
