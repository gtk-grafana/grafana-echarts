import { type PanelProps } from '@grafana/data';
import { PanelDataErrorView } from '@grafana/runtime';
import { useTheme2, VizLayout } from '@grafana/ui';
import { seriesTypePath } from 'editor/constants';
import { resolveChartModule } from 'lib/echarts/charts/registry';
import { type ChartContext } from 'lib/echarts/charts/types';
import { isLegendVisible, resolveLegendOptions } from 'lib/echarts/options/legend';
import { getRepresentativeFormatter } from 'lib/grafana/formatter';
import React, { useMemo } from 'react';
import { type PanelOptions } from 'types';
import { EChart } from './EChart';
import { useLegend } from './hooks/useLegend';
import { type ChartFamily, resolveSeriesType } from 'lib/echarts/charts/autoSeriesType';

interface Props extends PanelProps<PanelOptions> {
  /** The nested plugin's chart family, used to resolve an `'Auto'` series type. */
  family: ChartFamily;
}

export const Panel: React.FC<Props> = ({
  family,
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
  onFieldConfigChange,
  replaceVariables,
}) => {
  const theme = useTheme2();
  // Panel-level series type may be `'Auto'`/unset (e.g. a freshly added panel).
  // Resolve it to a concrete type once — from the data and scoped to this panel's
  // family — so both the chart module and the ChartContext below see a real
  // series type (downstream axis/build code throws on a non-concrete one).
  const rawSeriesType = options[seriesTypePath];
  const seriesType = useMemo(
    () => resolveSeriesType(rawSeriesType, data.series, family),
    [rawSeriesType, data.series, family]
  );

  const chartModule = useMemo(() => resolveChartModule(seriesType), [seriesType]);

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
      fieldConfig,
      replaceVariables,
    }),
    [data.series, theme, timeZone, timeRange, options, seriesType, formatValue, fieldConfig, replaceVariables]
  );

  const { items: legendItems, renderLegend } = useLegend({
    chartModule,
    chartContext,
    resolvedLegend,
    isVizLegend,
    seriesType,
    fieldConfig,
    onFieldConfigChange,
    eventBus,
  });

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
