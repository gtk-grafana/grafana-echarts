import { type AbsoluteTimeRange } from '@grafana/data';
import { debug, LOG_LEVELS } from 'development';
import { type ChartContext, type ChartModule } from 'lib/echarts/charts/types';
import { type EChartsType, init } from 'lib/echarts/echarts';
import { buildPanelChartOption } from 'lib/echarts/options/panelOption';
import {
  type BrushEndEvent,
  brushEndToTimeRange,
  type BrushXAxisInfo,
  CLEAR_TIME_BRUSH_ACTION,
  DISABLE_TIME_BRUSH_ACTION,
  ENABLE_TIME_BRUSH_ACTION,
} from 'lib/echarts/timeBrush';
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

interface Props {
  chartContext: ChartContext;
  chartModule: ChartModule;
  /** True when the panel renders a Grafana DOM legend instead of ECharts' native legend. */
  isGrafanaLegend: boolean;
  onChangeTimeRange: (timeRange: AbsoluteTimeRange) => void;
  /** Chart-area size allocated by VizLayout. */
  width: number;
  height: number;
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
  width,
  height,
}) => {
  const panelDOMRef = useRef<HTMLDivElement>(null);
  // The chart instance is created on mount (see the layout effect below) and
  // held in state so the option/resize effects re-run once it exists.
  const [chart, setChart] = useState<EChartsType | null>(null);

  // Latest time-range setter, read from the brush handler (attached once per
  // chart instance) so it always calls the current prop without re-binding.
  const onChangeTimeRangeRef = useRef(onChangeTimeRange);
  useEffect(() => {
    onChangeTimeRangeRef.current = onChangeTimeRange;
  }, [onChangeTimeRange]);

  useLayoutEffect(() => {
    const dom = panelDOMRef.current;
    if (!dom) {
      return;
    }

    const instance = init(dom);
    setChart(instance);

    return () => {
      instance.dispose();
      setChart(null);
    };
  }, []);

  useEffect(() => {
    if (!chart) {
      return;
    }

    const option = buildPanelChartOption(chartContext, { isGrafanaLegend });

    if (!option) {
      debug('No echart option', LOG_LEVELS.error, chartContext);
      throw new Error('No echart option!');
    }

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
  }, [chart, chartContext, isGrafanaLegend]);

  useEffect(() => {
    if (!chart) {
      return;
    }
    // Resize to the box VizLayout allocated; ECharts does not auto-track DOM size.
    // https://echarts.apache.org/en/api.html#echartsInstance.resize
    chart.resize({ width, height });
  }, [chart, width, height]);

  // Translate a completed time-axis drag-select into a dashboard time-range
  // change. Bound once per instance (the option effect (re-)arms the cursor);
  // the handler reads the latest setter via ref. Grafana then refetches and the
  // panel re-renders with the new range pinned on the axis.
  useEffect(() => {
    if (!chart) {
      return;
    }

    const handleBrushEnd = (event: BrushEndEvent) => {
      // Candlestick/boxplot render on a category axis, whose `coordRange` is in
      // category-index units; read the rendered x-axis so those indices can be
      // mapped back to timestamps. `getOption` normalizes `xAxis` to an array.
      // @todo remove type assertion
      const option = chart.getOption() as { xAxis?: BrushXAxisInfo[] };
      const range = brushEndToTimeRange(event, option?.xAxis?.[0]);
      // Clear the selection highlight so it does not linger through the refetch.
      chart.dispatchAction(CLEAR_TIME_BRUSH_ACTION);
      if (range) {
        onChangeTimeRangeRef.current(range);
      }
    };

    // eCharts types here are cryptic and/or missing definitions for all of the chart events, so we must typecast for now
    // See the comment in lib/echarts/timeBrush.ts
    chart.on('brushEnd', handleBrushEnd as (...args: unknown[]) => void);
    return () => {
      // On unmount the layout effect's cleanup disposes the instance before this
      // passive cleanup runs, so guard against calling `off` on a disposed chart
      // (dispose already drops its listeners). https://echarts.apache.org/en/api.html#echartsInstance.isDisposed
      if (!chart.isDisposed()) {
        chart.off('brushEnd', handleBrushEnd);
      }
    };
  }, [chart]);

  return <div ref={panelDOMRef} style={{ width, height }} />;
};
