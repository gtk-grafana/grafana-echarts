import { css } from '@emotion/css';
import { DataFrame, Field, FieldType, GrafanaTheme2, PanelProps } from '@grafana/data';
import { PanelDataErrorView } from '@grafana/runtime';
import { LegendDisplayMode, LegendPlacement, SortOrder, TooltipDisplayMode } from '@grafana/schema';
import {
  PanelContextProvider,
  SeriesVisibilityChangeMode,
  usePanelContext,
  useStyles2,
  useTheme2,
} from '@grafana/ui';
import { EChartsType, init } from 'echarts';
import { resolveChartModule } from 'echarts/charts/registry';
import { ChartContext } from 'echarts/charts/types';
import { getPanelLayout } from 'echarts/layout/layout';
import { isLegendVisible, resolveLegendOptions } from 'echarts/options/legend';
import { getCrosshairAxisPointer, getTooltipOption, tooltipTriggerForMode } from 'echarts/tooltip';
import { getValueFormatter, ValueFormatter } from 'echarts/style';
import { seriesTypePath } from 'editor/series';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { PanelOptions } from 'types';
import { useGrafanaEChartsTooltip } from './EChartsTooltip';
import { Legend } from './Legend';

interface Props extends PanelProps<PanelOptions> {}


const getRepresentativeFormatter = (
  series: DataFrame[],
  theme: GrafanaTheme2,
  timeZone: string
): ValueFormatter => {
  let numericField: Field | undefined;
  for (const frame of series) {
    numericField = frame.fields.find((field) => field.type === FieldType.number);
    if (numericField) {
      break;
    }
  }

  if (!numericField) {
    return (value) => String(value ?? '');
  }

  return getValueFormatter(numericField, theme, timeZone);
};

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

export const Panel: React.FC<Props> = ({ options, data, width, height, fieldConfig, id, timeZone, eventBus }) => {
  const theme = useTheme2();
  const panelContext = usePanelContext();
  const { sync } = panelContext;
  const panelDOMRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<EChartsType | null>(null);
  const seriesType = options[seriesTypePath];

  const chartModule = useMemo(
    () => resolveChartModule(seriesType, data.series),
    [seriesType, data.series]
  );

  const resolvedLegend = useMemo(
    () => (chartModule ? resolveLegendOptions(chartModule, options) : undefined),
    [chartModule, options]
  );

  const domLegend = Boolean(
    resolvedLegend && isLegendVisible(resolvedLegend) && chartModule?.buildLegendItems
  );

  const formatValue = useMemo(
    () => getRepresentativeFormatter(data.series, theme, timeZone),
    [data.series, theme, timeZone]
  );

  const chartContext: ChartContext = useMemo(
    () => ({
      frames: data.series,
      theme,
      timeZone,
      options,
      seriesType,
      formatValue,
    }),
    [data.series, theme, timeZone, options, seriesType, formatValue]
  );

  const placement: LegendPlacement = resolvedLegend?.placement === 'right' ? 'right' : 'bottom';
  const { chartWidth, chartHeight, legendWidth, legendHeight } = getPanelLayout(
    width,
    height,
    resolvedLegend ?? { showLegend: false, displayMode: LegendDisplayMode.Hidden, placement: 'bottom', calcs: [] },
    domLegend
  );
  const styles = useStyles2(getStyles, height, width, placement);

  const legendItems = useMemo(() => {
    if (!domLegend || !chartModule?.buildLegendItems || !resolvedLegend) {
      return [];
    }
    return chartModule.buildLegendItems(chartContext, resolvedLegend.calcs ?? []);
  }, [domLegend, chartModule, chartContext, resolvedLegend]);

  const tooltipKind = chartModule?.tooltipKind ?? 'timeseries';
  const tooltipExtras = useMemo(
    () => chartModule?.getTooltipExtras?.(chartContext) ?? { radarIndicators: [], xIsTime: true, syncEnabled: false },
    [chartModule, chartContext]
  );

  const tooltipMode = options.tooltip?.mode ?? TooltipDisplayMode.Single;
  const tooltipSort = options.tooltip?.sort ?? SortOrder.None;
  const tooltipHideZeros = options.tooltip?.hideZeros ?? false;
  const tooltipMaxWidth = options.tooltip?.maxWidth;
  const tooltipMaxHeight = options.tooltip?.maxHeight;

  const resolveLinks = useMemo(
    () => chartModule?.resolveLinks?.(chartContext) ?? (() => []),
    [chartModule, chartContext]
  );

  const {
    formatter: tooltipFormatter,
    portal: tooltipPortal,
    attach: tooltipAttach,
  } = useGrafanaEChartsTooltip({
    kind: tooltipKind,
    valueFormatter: formatValue,
    timeZone,
    radarIndicators: tooltipExtras.radarIndicators,
    sort: tooltipSort,
    hideZeros: tooltipHideZeros,
    xIsTime: tooltipExtras.xIsTime,
    maxWidth: tooltipMaxWidth,
    maxHeight: tooltipMaxHeight,
    resolveLinks,
    eventBus,
    getCursorSync: sync,
    syncEnabled: tooltipExtras.syncEnabled,
  });

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
    if (!panelDOMRef.current) {
      return;
    }

    const chart = init(panelDOMRef.current);
    panelRef.current = chart;
    const detachTooltip = tooltipAttach(chart, panelDOMRef.current);
    return () => {
      detachTooltip();
      chart.dispose();
    };
  }, [tooltipAttach]);

  useEffect(() => {
    if (!panelRef.current || !chartModule) {
      return;
    }

    panelRef.current.clear();

    const tooltipOption = {
      ...getTooltipOption(tooltipTriggerForMode(tooltipKind, tooltipMode), tooltipMode),
      formatter: tooltipFormatter,
    };

    const echartOption = chartModule.buildOption(chartContext, { domLegend });

    if (!echartOption) {
      return;
    }

    const axisPointer =
      tooltipKind === 'timeseries' || tooltipKind === 'heatmap'
        ? tooltipMode === TooltipDisplayMode.None
          ? { show: false }
          : getCrosshairAxisPointer()
        : undefined;

    panelRef.current.setOption({
      ...echartOption,
      tooltip: tooltipOption,
      ...(axisPointer ? { axisPointer } : {}),
    });
  }, [chartModule, chartContext, domLegend, tooltipFormatter, tooltipKind, tooltipMode]);

  useEffect(() => {
    if (!panelRef.current) {
      return;
    }
    panelRef.current.resize({ width: chartWidth, height: chartHeight });
  }, [chartWidth, chartHeight]);

  if (data.series.length === 0) {
    return <PanelDataErrorView fieldConfig={fieldConfig} panelId={id} data={data} needsStringField />;
  }

  return (
    <div className={styles.wrapper}>
      <div ref={panelDOMRef} className={styles.panelContainer} style={{ width: chartWidth, height: chartHeight }}></div>
      {tooltipPortal}
      {domLegend && resolvedLegend && (
        <PanelContextProvider value={legendContextValue}>
          <Legend
            items={legendItems}
            legend={resolvedLegend}
            width={legendWidth}
            height={legendHeight}
          />
        </PanelContextProvider>
      )}
    </div>
  );
};
