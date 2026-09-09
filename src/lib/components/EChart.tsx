import { type AbsoluteTimeRange, type FieldConfigSource } from '@grafana/data';
import { TooltipDisplayMode } from '@grafana/schema';
import { type ChartContext, type ChartModule } from 'lib/echarts/charts/types';
import { type EChartsType, init } from 'lib/echarts/echarts';
import { collectProximitySeries } from 'lib/echarts/tooltip/proximity';
import React, { type MutableRefObject, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { type PanelOptions } from 'types';
import { useBrushTimeZoom } from './hooks/useBrushTimeZoom';
import { useChartOption } from './hooks/useChartOption';
import { useChartResize } from './hooks/useChartResize';
import { useRelationsPersistence } from './hooks/useRelationsPersistence';
import { EChartsTooltip } from './tooltip/EChartsTooltip';
import { useEChartsTooltip } from './tooltip/useEChartsTooltip';

interface Props {
  chartContext: ChartContext;
  chartModule: ChartModule;
  /** True when the panel renders a Grafana DOM legend instead of ECharts' native legend. */
  isGrafanaLegend: boolean;
  onChangeTimeRange: (timeRange: AbsoluteTimeRange) => void;
  /**
   * Write-backs for interactions that are edits rather than view state — a dragged
   * node's position and, when asked for, the panned/zoomed view. Bound here rather
   * than in `Panel` because they need the live instance, which is this component's
   * state; `Panel` holds only a ref. See `useRelationsPersistence`.
   */
  onFieldConfigChange: (fieldConfig: FieldConfigSource) => void;
  onOptionsChange: (options: PanelOptions) => void;
  /** Chart-area size allocated by VizLayout. */
  width: number;
  height: number;
  /**
   * Filled with the ECharts instance for the panel's siblings — the Grafana DOM
   * legend is rendered by `VizLayout`, outside this component, and its hover
   * emphasis has to dispatch onto this chart (see `useLegendHighlight`).
   */
  instanceRef?: MutableRefObject<EChartsType | null>;
}

/**
 * Owns the ECharts instance and its React lifecycle: init/dispose, option
 * rebuilds, resize, and the time-axis brush handler. Rendered inside
 * VizLayout's render prop so it receives the chart-area size.
 */
export const EChart: React.FC<Props> = ({
  chartContext,
  chartModule,
  isGrafanaLegend,
  onChangeTimeRange,
  onFieldConfigChange,
  onOptionsChange,
  width,
  height,
  instanceRef,
}) => {
  const panelDOMRef = useRef<HTMLDivElement>(null);
  // The chart instance is created on mount (see the layout effect below) and
  // held in state so the option/resize/brush hooks re-run once it exists.
  const [chart, setChart] = useState<EChartsType | null>(null);

  const tooltipMode = chartContext.options.tooltip?.mode ?? TooltipDisplayMode.Single;

  // Per-series values enabling Grafana-parity proximity hover; `undefined` for
  // the families and modes that keep ECharts' native hit-testing.
  const proximitySeries = useMemo(
    () => collectProximitySeries(chartContext.frames, chartContext.seriesType, tooltipMode),
    [chartContext.frames, chartContext.seriesType, tooltipMode]
  );

  // React tooltip overlay: ECharts' (invisible) tooltip formatter feeds hovered
  // content to this controller's `sink`; the controller tracks cursor/show/hide
  // and the `EChartsTooltip` renders it with `@grafana/ui`'s VizTooltip. The
  // chart mount node doubles as the coordinate origin for cursor positions.
  // `tooltipSink`/`reportTooltipTrigger` are stable across renders.
  const {
    sink: tooltipSink,
    reportTrigger: reportTooltipTrigger,
    state: tooltipState,
    dismiss: dismissTooltip,
  } = useEChartsTooltip(chart, panelDOMRef, { series: proximitySeries });

  useLayoutEffect(() => {
    const dom = panelDOMRef.current;
    if (!dom) {
      return;
    }

    // Do not pass `useDirtyRect: true` here. It was tried and reverted: it
    // corrupts the initial draw (line paths and gridlines missing from the region
    // a resize exposes) because the resize effect below fires while the load
    // animation is still running, and zrender's dirty regions are stale by then.
    // It also measured as no gain — `setOption` runs with `notMerge`, so every
    // repaint invalidates everything and there is no partial repaint to skip.
    // See docs/performance.md and `pnpm run bench:dirty-rect`.
    // https://echarts.apache.org/en/api.html#echarts.init
    const instance = init(dom);
    setChart(instance);
    if (instanceRef) {
      instanceRef.current = instance;
    }

    return () => {
      instance.dispose();
      setChart(null);
      if (instanceRef) {
        instanceRef.current = null;
      }
    };
  }, [instanceRef]);

  useChartOption(chart, chartContext, { isGrafanaLegend, tooltipSink, reportTooltipTrigger });
  useChartResize(chart, width, height);
  useBrushTimeZoom(chart, onChangeTimeRange);
  useRelationsPersistence(chart, { chartContext, onFieldConfigChange, onOptionsChange });

  return (
    <>
      <div ref={panelDOMRef} style={{ width, height }} />
      <EChartsTooltip
        state={tooltipState}
        dismiss={dismissTooltip}
        mode={tooltipMode}
        maxWidth={chartContext.options.tooltip?.maxWidth}
        maxHeight={chartContext.options.tooltip?.maxHeight}
      />
    </>
  );
};
