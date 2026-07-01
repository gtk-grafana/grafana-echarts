import { css } from '@emotion/css';
import { DataFrame, Field, FieldType, GrafanaTheme2, PanelProps } from '@grafana/data';
import { PanelDataErrorView } from '@grafana/runtime';
import { LegendDisplayMode, LegendPlacement, TooltipDisplayMode } from '@grafana/schema';
import { PanelContextProvider, SeriesVisibilityChangeMode, usePanelContext, useStyles2, useTheme2 } from '@grafana/ui';
import { debug, LOG_LEVELS } from 'development';
import { EChartsType, init } from 'echarts';
import { panelTypeToAxis } from 'echarts/axes/converters';
import { resolveChartModule } from 'echarts/charts/registry';
import { ChartContext } from 'echarts/charts/types';
import { getPanelLayout } from 'echarts/layout/layout';
import { isLegendVisible, resolveLegendOptions } from 'echarts/options/legend';
import { getValueFormatter, ValueFormatter } from 'echarts/style';
import { getCrosshairAxisPointer, getTooltipOption, grafanaTooltipModeToEChartsTrigger } from 'echarts/tooltip';
import { seriesTypePath } from 'editor/series';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { PanelOptions } from 'types';
import { Legend } from './Legend';

interface Props extends PanelProps<PanelOptions> {}

const getRepresentativeFormatter = (series: DataFrame[], theme: GrafanaTheme2, timeZone: string): ValueFormatter => {
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
  const panelDOMRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<EChartsType | null>(null);
  const seriesType = options[seriesTypePath];

  const chartModule = useMemo(() => resolveChartModule(seriesType, data.series), [seriesType, data.series]);

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
    isVizLegend
  );
  const styles = useStyles2(getStyles, height, width, placement);

  const legendItems = useMemo(() => {
    if (!isVizLegend || !chartModule?.buildLegendItems || !resolvedLegend) {
      return [];
    }
    return chartModule.buildLegendItems(chartContext, resolvedLegend.calcs ?? []);
  }, [isVizLegend, chartModule, chartContext, resolvedLegend]);

  const tooltipMode = options.tooltip?.mode ?? TooltipDisplayMode.Single;

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
    return () => {
      chart.dispose();
    };
  }, []);

  useEffect(() => {
    if (!panelRef.current || !chartModule) {
      return;
    }

    panelRef.current.clear();

    const axisType = panelTypeToAxis(seriesType);
    const tooltipOption = getTooltipOption(
      grafanaTooltipModeToEChartsTrigger(axisType, tooltipMode),
      tooltipMode,
      formatValue
    );

    const echartOption = chartModule.buildOption(chartContext, { isGrafanaLegend: isVizLegend });

    if (!echartOption) {
      debug('No echart option', LOG_LEVELS.error, chartContext);
      throw new Error('No echart option!');
    }

    // Only cartesian-grid charts (non-category axes) have an axis to draw the crosshair on.
    const axisPointer =
      axisType !== 'category'
        ? tooltipMode === TooltipDisplayMode.None
          ? { show: false }
          : getCrosshairAxisPointer()
        : undefined;

    panelRef.current.setOption({
      ...echartOption,
      tooltip: tooltipOption,
      ...(axisPointer ? { axisPointer } : {}),
    });
  }, [chartModule, chartContext, isVizLegend, formatValue, seriesType, tooltipMode]);

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
      {isVizLegend && resolvedLegend && (
        <PanelContextProvider value={legendContextValue}>
          <Legend items={legendItems} legend={resolvedLegend} width={legendWidth} height={legendHeight} />
        </PanelContextProvider>
      )}
    </div>
  );
};
