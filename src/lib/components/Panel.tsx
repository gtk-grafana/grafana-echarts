import { type PanelProps } from '@grafana/data';
import { PanelDataErrorView } from '@grafana/runtime';
import {
  PanelContextProvider,
  type SeriesVisibilityChangeMode,
  usePanelContext,
  useTheme2,
  VizLayout,
  VizLegend,
} from '@grafana/ui';
import { seriesTypePath } from 'editor/constants';
import { resolveChartModule, resolveSeriesType } from 'lib/echarts/charts/registry';
import { type ChartContext } from 'lib/echarts/charts/types';
import { isLegendVisible, resolveLegendOptions } from 'lib/echarts/options/legend';
import { getRepresentativeFormatter } from 'lib/grafana/formatter';
import React, { useCallback, useMemo } from 'react';
import { type PanelOptions } from 'types';
import { EChart } from './EChart';

interface Props extends PanelProps<PanelOptions> {}

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
  // Panel-level series type may be `'Auto'`/unset (e.g. a freshly added panel
  // that never went through a suggestion); resolve it to a concrete type once,
  // from the data, so both the chart module and the ChartContext below see a
  // real series type (downstream axis/build code throws on a non-concrete one).
  const rawSeriesType = options[seriesTypePath];
  const seriesType = useMemo(() => resolveSeriesType(rawSeriesType, data.series), [rawSeriesType, data.series]);

  const chartModule = useMemo(() => resolveChartModule(seriesType, data.series), [seriesType, data.series]);

  const resolvedLegend = useMemo(() => resolveLegendOptions(chartModule, options), [chartModule, options]);

  const isVizLegend = isLegendVisible(resolvedLegend);

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

  const legendItems = useMemo(() => {
    if (!isVizLegend) {
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

  const renderLegend = useCallback(
    () => (
      <VizLayout.Legend placement={resolvedLegend.placement} width={resolvedLegend.width}>
        <PanelContextProvider value={legendContextValue}>
          <VizLegend
            items={legendItems}
            displayMode={resolvedLegend.displayMode}
            placement={resolvedLegend.placement}
            sortBy={resolvedLegend.sortBy}
            sortDesc={resolvedLegend.sortDesc}
            isSortable={true}
            limit={resolvedLegend.limit}
          />
        </PanelContextProvider>
      </VizLayout.Legend>
    ),
    [legendContextValue, legendItems, resolvedLegend]
  );

  if (data.series.length === 0) {
    return <PanelDataErrorView fieldConfig={fieldConfig} panelId={id} data={data} needsStringField />;
  }

  return (
    <VizLayout width={width} height={height} legend={legendItems.length > 0 ? renderLegend() : null}>
      {(vizWidth: number, vizHeight: number) => (
        <EChart
          chartContext={chartContext}
          chartModule={chartModule}
          isGrafanaLegend={isVizLegend}
          onChangeTimeRange={onChangeTimeRange}
          width={vizWidth}
          height={vizHeight}
        />
      )}
    </VizLayout>
  );
};
