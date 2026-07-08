import { css } from '@emotion/css';
import { type GrafanaTheme2, type PanelProps } from '@grafana/data';
import { PanelDataErrorView } from '@grafana/runtime';
import { LegendDisplayMode, type LegendPlacement } from '@grafana/schema';
import {
  PanelContextProvider,
  type SeriesVisibilityChangeMode,
  usePanelContext,
  useStyles2,
  useTheme2,
} from '@grafana/ui';
import { debug, LOG_LEVELS } from 'development';
import { seriesTypePath } from 'editor/constants';
import { resolveChartModule } from 'lib/echarts/charts/registry';
import { type ChartContext } from 'lib/echarts/charts/types';
import { type EChartsType, init } from 'lib/echarts/echarts';
import { getPanelLayout } from 'lib/echarts/layout/layout';
import { isLegendVisible, resolveLegendOptions } from 'lib/echarts/options/legend';
import { buildPanelChartOption } from 'lib/echarts/options/panelOption';
import {
  type BrushEndEvent,
  brushEndToTimeRange,
  CLEAR_TIME_BRUSH_ACTION,
  DISABLE_TIME_BRUSH_ACTION,
  ENABLE_TIME_BRUSH_ACTION,
} from 'lib/echarts/timeBrush';
import { getRepresentativeFormatter } from 'lib/grafana/formatter';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { type PanelOptions } from 'types';
import { Legend } from './Legend';

interface Props extends PanelProps<PanelOptions> {}

const getStyles = (theme: GrafanaTheme2, height: number, width: number, placement: LegendPlacement) => {
  return {
    wrapper: css({
      position: 'relative',
      display: 'flex',
      flexDirection: placement === 'right' ? 'row' : 'column',
      height,
      width,
    }),
    panelContainer: css({}),
  };
};

export const Panel: React.FC<Props> = ({
  options,
  data,
  width,
  height,
  fieldConfig,
  id,
  timeZone,
  eventBus,
  timeRange,
  onChangeTimeRange,
}) => {
  const theme = useTheme2();
  const panelContext = usePanelContext();
  const panelDOMRef = useRef<HTMLDivElement>(null);
  // The chart instance is created on mount (see the layout effect below) and
  // held in state so the option/resize effects re-run once it exists.
  const [chart, setChart] = useState<EChartsType | null>(null);
  const seriesType = options[seriesTypePath];

  // Latest time-range setter, read from the brush handler (attached once per
  // chart instance) so it always calls the current prop without re-binding.
  const onChangeTimeRangeRef = useRef(onChangeTimeRange);
  useEffect(() => {
    onChangeTimeRangeRef.current = onChangeTimeRange;
  }, [onChangeTimeRange]);

  const chartModule = useMemo(() => resolveChartModule(seriesType), [seriesType]);

  const resolvedLegend = useMemo(
    () => (chartModule ? resolveLegendOptions(chartModule, options) : undefined),
    [chartModule, options]
  );

  const isVizLegend = Boolean(resolvedLegend && isLegendVisible(resolvedLegend) && chartModule?.buildLegendItems);

  const formatValue = useMemo(
    () => getRepresentativeFormatter(data.series, theme, timeZone),
    [data.series, theme, timeZone]
  );

  const chartContext: ChartContext = useMemo(
    () => ({
      frames: data.series,
      theme,
      timeZone,
      timeRange,
      options,
      seriesType,
      formatValue,
    }),
    [data.series, theme, timeZone, timeRange, options, seriesType, formatValue]
  );

  const placement: LegendPlacement = resolvedLegend?.placement === 'right' ? 'right' : 'bottom';
  const { chartWidth, chartHeight, legendWidth, legendHeight } = getPanelLayout(
    width,
    height,
    resolvedLegend ?? { showLegend: false, displayMode: LegendDisplayMode.Hidden, placement: 'bottom', calcs: [] },
    isVizLegend
  );
  const styles = useStyles2(getStyles, height, width, placement);

  const legendItems = useMemo(() => {
    if (!isVizLegend || !chartModule?.buildLegendItems || !resolvedLegend) {
      return [];
    }
    return chartModule.buildLegendItems(chartContext, resolvedLegend.calcs ?? []);
  }, [isVizLegend, chartModule, chartContext, resolvedLegend]);

  const onSeriesColorChange = useCallback((_label: string, _color: string) => {
    // @todo requires fieldConfig override write-back (PanelContext not available to community panels)
  }, []);

  const onToggleSeriesVisibility = useCallback(
    (_label: string | string[] | null, _mode: SeriesVisibilityChangeMode) => {
      // @todo requires series visibility state
    },
    []
  );

  const legendContextValue = useMemo(
    () => ({
      ...panelContext,
      eventBus,
      onSeriesColorChange,
      onToggleSeriesVisibility,
    }),
    [panelContext, eventBus, onSeriesColorChange, onToggleSeriesVisibility]
  );

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
    if (!chart || !chartModule) {
      return;
    }

    const option = buildPanelChartOption(chartContext, { isGrafanaLegend: isVizLegend });

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
  }, [chart, chartModule, chartContext, isVizLegend]);

  useEffect(() => {
    if (!chart) {
      return;
    }
    chart.resize({ width: chartWidth, height: chartHeight });
  }, [chart, chartWidth, chartHeight]);

  // Translate a completed time-axis drag-select into a dashboard time-range
  // change. Bound once per instance (the option effect (re-)arms the cursor);
  // the handler reads the latest setter via ref. Grafana then refetches and the
  // panel re-renders with the new range pinned on the axis.
  useEffect(() => {
    if (!chart) {
      return;
    }

    const handleBrushEnd = (event: BrushEndEvent) => {
      const range = brushEndToTimeRange(event);
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

  if (data.series.length === 0) {
    return <PanelDataErrorView fieldConfig={fieldConfig} panelId={id} data={data} needsStringField />;
  }

  return (
    <div className={styles.wrapper}>
      <div ref={panelDOMRef} className={styles.panelContainer} style={{ width: chartWidth, height: chartHeight }}></div>
      {isVizLegend && resolvedLegend && (
        <PanelContextProvider value={legendContextValue}>
          <Legend items={legendItems} legend={resolvedLegend} width={legendWidth} height={legendHeight} />
        </PanelContextProvider>
      )}
    </div>
  );
};
