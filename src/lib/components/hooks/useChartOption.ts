import { debug, LOG_LEVELS } from 'development';
import { type ChartContext, type EChartBuildOption } from 'lib/echarts/charts/types';
import { type EChartsType } from 'lib/echarts/echarts';
import { buildPanelChartOption } from 'lib/echarts/options/panelOption';
import { readLiveRelationsView, type RelationsViewState } from 'lib/echarts/relations/options/view';
import { ENABLE_TIME_BRUSH_ACTION } from 'lib/echarts/timeBrush';
import { getTooltipTrigger } from 'lib/echarts/tooltip/option';
import { type TooltipSink } from 'lib/echarts/tooltip/types';
import { useEffect, useRef } from 'react';
import { type EChartsTooltipController } from '../tooltip/types';

interface Options {
  /** True when the panel renders a Grafana DOM legend instead of ECharts' native legend. */
  isGrafanaLegend: boolean;
  /** Width in pixels that Grafana allocated to the ECharts plot. */
  plotWidth: number;
  /** Height in pixels that Grafana allocated to the ECharts plot. */
  plotHeight: number;
  /** Receives hovered tooltip content; threaded into the option's formatters. */
  tooltipSink: TooltipSink;
  /** Told the resolved `trigger` after each rebuild, which drives hide behavior. */
  reportTooltipTrigger: EChartsTooltipController['reportTrigger'];
}

type ViewVariant = 'graph' | 'sankey';

/** Return the Relations variants that own a roamable view. */
function getViewVariant(chartContext: ChartContext): ViewVariant | undefined {
  return chartContext.seriesType === 'graph' || chartContext.seriesType === 'sankey'
    ? chartContext.seriesType
    : undefined;
}

/** Apply only the transient view to the newly built first series. */
function applyRelationsView(option: EChartBuildOption, view: RelationsViewState): void {
  const first = Array.isArray(option.series) ? option.series[0] : option.series;
  if (first == null || (first.type !== 'graph' && first.type !== 'sankey')) {
    return;
  }
  if (view.zoom != null) {
    first.zoom = view.zoom;
  }
  if (view.center != null) {
    first.center = view.center;
  }
}

/**
 * Rebuild the panel's ECharts option and push it to the instance whenever the
 * chart context changes.
 *
 * `chartContext` is memoized upstream (Panel.tsx), so this effect — and the
 * option build inside it — skips incidental hover, legend, and size re-renders.
 * Building in an effect rather than a `useMemo` keeps the work off the render path.
 */
export function useChartOption(
  chart: EChartsType | null,
  chartContext: ChartContext,
  { isGrafanaLegend, plotWidth, plotHeight, tooltipSink, reportTooltipTrigger }: Options
): void {
  const optionsRef = useRef({ isGrafanaLegend, plotWidth, plotHeight, tooltipSink, reportTooltipTrigger });
  const variantRef = useRef<ViewVariant | undefined>(getViewVariant(chartContext));
  const interactedViewRef = useRef<{ variant: ViewVariant; view?: RelationsViewState }>();
  useEffect(() => {
    optionsRef.current = { isGrafanaLegend, plotWidth, plotHeight, tooltipSink, reportTooltipTrigger };
  }, [isGrafanaLegend, plotHeight, plotWidth, reportTooltipTrigger, tooltipSink]);
  useEffect(() => {
    variantRef.current = getViewVariant(chartContext);
  }, [chartContext]);

  useEffect(() => {
    interactedViewRef.current = undefined;
    if (!chart) {
      return;
    }

    const markInteracted = (variant: ViewVariant) => {
      if (variantRef.current === variant && !chart.isDisposed()) {
        interactedViewRef.current = { variant, view: readLiveRelationsView(chart) };
      }
    };
    const onGraphRoam = () => markInteracted('graph');
    const onSankeyRoam = () => markInteracted('sankey');
    chart.on('graphroam', onGraphRoam);
    chart.on('sankeyroam', onSankeyRoam);

    return () => {
      if (!chart.isDisposed()) {
        chart.off('graphroam', onGraphRoam);
        chart.off('sankeyroam', onSankeyRoam);
      }
    };
  }, [chart]);

  useEffect(() => {
    if (!chart) {
      return;
    }

    const current = optionsRef.current;
    const variant = getViewVariant(chartContext);
    const interacted = interactedViewRef.current;
    if (interacted != null && interacted.variant !== variant) {
      interactedViewRef.current = undefined;
    } else if (interacted != null) {
      const liveView = readLiveRelationsView(chart);
      if (liveView != null) {
        interacted.view = liveView;
      }
    }
    const option = buildPanelChartOption(chartContext, current);

    // Nothing to draw from this data: clear the canvas and leave the panel empty
    // rather than throwing, which would replace the panel with an error boundary.
    // A response the family cannot *read* throws from inside the build instead, so
    // the user sees a message rather than a blank panel — see `buildPanelChartOption`.
    if (!option) {
      debug('No echart option', LOG_LEVELS.debug, chartContext);
      chart.clear();
      return;
    }

    const retained = interactedViewRef.current;
    if (retained != null && retained.variant === variant && retained.view != null) {
      applyRelationsView(option, retained.view);
    }

    // Tell the tooltip controller the resolved trigger so it hides item tooltips
    // on `mouseout` but keeps axis ("All") tooltips open across the grid.
    current.reportTooltipTrigger(getTooltipTrigger(option));

    // `notMerge` replaces the previous option outright (removing any components
    // the new option omits) instead of merging into it. This effect rebuilds the
    // whole option on every change and the panel switches across chart families
    // with different structures (grid/axes, visualMap, radar), so a merge would
    // leave stale components behind. Replacing in place also keeps the instance
    // warm for transitions, unlike a full chart.clear() + setOption reset.
    // https://echarts.apache.org/en/api.html#echartsInstance.setOption
    chart.setOption(option, { notMerge: true });

    // `notMerge` recreates the brush component, so arm it after each brush rebuild.
    // Removing the component disposes its controller and releases the pan mutex.
    if ('brush' in option) {
      chart.dispatchAction(ENABLE_TIME_BRUSH_ACTION);
    }
    // `tooltipSink`/`reportTooltipTrigger` are stable (see useEChartsTooltip), so
    // this effect still only re-runs on chart, context, size, or legend changes.
  }, [chart, chartContext, isGrafanaLegend, tooltipSink, reportTooltipTrigger]);
}
