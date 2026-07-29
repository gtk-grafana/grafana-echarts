import { debug, LOG_LEVELS } from 'development';
import { type ChartContext } from 'lib/echarts/charts/types';
import { type EChartsType } from 'lib/echarts/echarts';
import { buildPanelChartOption } from 'lib/echarts/options/panelOption';
import { DISABLE_TIME_BRUSH_ACTION, ENABLE_TIME_BRUSH_ACTION } from 'lib/echarts/timeBrush';
import { getTooltipTrigger } from 'lib/echarts/tooltip/option';
import { type TooltipSink } from 'lib/echarts/tooltip/types';
import { useEffect } from 'react';
import { type EChartsTooltipController } from '../tooltip/types';

interface Options {
  /** True when the panel renders a Grafana DOM legend instead of ECharts' native legend. */
  isGrafanaLegend: boolean;
  /** Receives hovered tooltip content; threaded into the option's formatters. */
  tooltipSink: TooltipSink;
  /** Told the resolved `trigger` after each rebuild, which drives hide behavior. */
  reportTooltipTrigger: EChartsTooltipController['reportTrigger'];
}

/**
 * Rebuild the panel's ECharts option and push it to the instance whenever the
 * chart context changes.
 *
 * `chartContext` is memoized upstream (Panel.tsx), so this effect — and the
 * option build inside it — already skips incidental re-renders (resize, hover,
 * legend). Building in an effect rather than a `useMemo` keeps the work off the
 * render path.
 */
export function useChartOption(
  chart: EChartsType | null,
  chartContext: ChartContext,
  { isGrafanaLegend, tooltipSink, reportTooltipTrigger }: Options
): void {
  useEffect(() => {
    if (!chart) {
      return;
    }

    const option = buildPanelChartOption(chartContext, { isGrafanaLegend, tooltipSink });

    if (!option) {
      debug('No echart option', LOG_LEVELS.error, chartContext);
      throw new Error('No echart option!');
    }

    // Tell the tooltip controller the resolved trigger so it hides item tooltips
    // on `mouseout` but keeps axis ("All") tooltips open across the grid.
    reportTooltipTrigger(getTooltipTrigger(option));

    // `notMerge` replaces the previous option outright (removing any components
    // the new option omits) instead of merging into it. This effect rebuilds the
    // whole option on every change and the panel switches across chart families
    // with different structures (grid/axes, visualMap, radar), so a merge would
    // leave stale components behind. Replacing in place also keeps the instance
    // warm for transitions, unlike a full chart.clear() + setOption reset.
    // https://echarts.apache.org/en/api.html#echartsInstance.setOption
    chart.setOption(option, { notMerge: true });

    // Arm (or clear) the permanent time-span brush cursor after each rebuild;
    // `notMerge` recreates the brush component, so the cursor must be re-armed.
    // A `brush` option is only present for time-axis charts (see panelOption).
    chart.dispatchAction('brush' in option ? ENABLE_TIME_BRUSH_ACTION : DISABLE_TIME_BRUSH_ACTION);
    // `tooltipSink`/`reportTooltipTrigger` are stable (see useEChartsTooltip), so
    // this effect still only re-runs on chart/context/legend changes.
  }, [chart, chartContext, isGrafanaLegend, tooltipSink, reportTooltipTrigger]);
}
