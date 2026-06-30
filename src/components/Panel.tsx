import { css } from '@emotion/css';
import { Field, FieldType, GrafanaTheme2, PanelProps } from '@grafana/data';
import { PanelDataErrorView } from '@grafana/runtime';
import { LegendPlacement, SortOrder, TooltipDisplayMode } from '@grafana/schema';
import { useStyles2, useTheme2, usePanelContext } from '@grafana/ui';
import { EChartsType, init } from 'echarts';
import { resolveChartModule } from 'echarts/charts/registry';
import { ChartContext } from 'echarts/charts/types';
import { isTableLegend } from 'echarts/options/legend';
import { getCrosshairAxisPointer, getTooltipOption, tooltipTriggerForMode } from 'echarts/tooltip';
import { getValueFormatter, ValueFormatter } from 'echarts/style';
import { seriesTypePath } from 'editor/series';
import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { PanelOptions } from 'types';
import { useGrafanaEChartsTooltip } from './EChartsTooltip';
import { LegendTable } from './LegendTable';

interface Props extends PanelProps<PanelOptions> {}

const DEFAULT_LEGEND_WIDTH = 240;
const MIN_LEGEND_HEIGHT = 80;
const MAX_LEGEND_HEIGHT = 200;

const getLayout = (width: number, height: number, placement: LegendPlacement, tableLegend: boolean) => {
  if (!tableLegend) {
    return { chartWidth: width, chartHeight: height, legendWidth: width, legendHeight: 0 };
  }

  if (placement === 'right') {
    const legendWidth = Math.min(DEFAULT_LEGEND_WIDTH, Math.floor(width / 2));
    return { chartWidth: width - legendWidth, chartHeight: height, legendWidth, legendHeight: height };
  }

  const legendHeight = Math.min(Math.max(Math.round(height * 0.35), MIN_LEGEND_HEIGHT), MAX_LEGEND_HEIGHT);
  return { chartWidth: width, chartHeight: height - legendHeight, legendWidth: width, legendHeight };
};

const getRepresentativeFormatter = (
  series: PanelProps<PanelOptions>['data']['series'],
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
  const { sync } = usePanelContext();
  const panelDOMRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<EChartsType | null>(null);
  const seriesType = options[seriesTypePath];

  const chartModule = useMemo(
    () => resolveChartModule(seriesType, data.series),
    [seriesType, data.series]
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

  const placement: LegendPlacement = options.legend?.placement === 'right' ? 'right' : 'bottom';
  const tableLegend = Boolean(
    chartModule?.supportsTableLegend && isTableLegend(options.legend)
  );
  const { chartWidth, chartHeight, legendWidth, legendHeight } = getLayout(width, height, placement, tableLegend);
  const styles = useStyles2(getStyles, height, width, placement);

  const legendItems = useMemo(() => {
    if (!tableLegend || !chartModule?.buildLegendItems) {
      return [];
    }
    return chartModule.buildLegendItems(chartContext, options.legend?.calcs ?? []);
  }, [tableLegend, chartModule, chartContext, options.legend?.calcs]);

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

    const echartOption = chartModule.buildOption(chartContext, { tableLegend });

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
  }, [
    chartModule,
    chartContext,
    tableLegend,
    tooltipFormatter,
    tooltipKind,
    tooltipMode,
  ]);

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
      {tableLegend && (
        <LegendTable
          items={legendItems}
          placement={placement}
          width={legendWidth}
          height={legendHeight}
          limit={options.legend?.limit}
        />
      )}
    </div>
  );
};
