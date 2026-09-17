import { LoadingState } from '@grafana/data';
import { PanelDataErrorView } from '@grafana/runtime';
import { useTheme2 } from '@grafana/ui';
import { seriesTypePath } from 'editor/constants';
import { resolveSeriesType } from 'lib/echarts/charts/autoSeriesType';
import { resolveChartModule } from 'lib/echarts/charts/registry';
import { type ChartContext } from 'lib/echarts/charts/types';
import { isLegendVisible, resolveLegendOptions } from 'lib/echarts/options/legend';
import { getRepresentativeFormatter } from 'lib/grafana/formatter';
import React, { useMemo, useState } from 'react';
import { ChartContent } from './ChartContent';
import { resolveTimelineIndex } from './ChartTimeSlider';
import { type PanelComponentProps } from './types';

export const PanelContent: React.FC<PanelComponentProps> = ({
  family,
  options,
  data,
  width,
  height,
  fieldConfig,
  timeZone,
  eventBus,
  timeRange,
  onChangeTimeRange,
  onFieldConfigChange,
  onOptionsChange,
  replaceVariables,
  id,
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

  // Everything but the time selection. Split out because the selection is only meaningful
  // against the timeline below, so a context carrying both would be circular — and would
  // rebuild the whole stop list on every scrub.
  const baseContext: ChartContext = useMemo(
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

  // The stops this render can be stepped through, or `null` for no slider. Relations can
  // supply them for both panels and preset previews. See `ChartModule.getTimeline`.
  const timeline = useMemo(() => chartModule.getTimeline?.(baseContext) ?? null, [chartModule, baseContext]);

  /**
   * The selected timestamp: **transient panel state**, never a saved option — scrubbing a
   * dashboard somebody is only reading must not mark it dirty. That is the line
   * `useRelationsPersistence` draws between an edit and a view.
   *
   * A timestamp rather than an index, re-clamped every render, because the dashboard
   * refreshes underneath it; see `resolveTimelineIndex`.
   */
  const [pickedTime, setPickedTime] = useState<number | null>(null);
  const selectedTime = timeline != null ? timeline[resolveTimelineIndex(timeline, pickedTime)] : null;

  const chartContext: ChartContext = useMemo(() => ({ ...baseContext, selectedTime }), [baseContext, selectedTime]);

  // Some Grafana responses still use the legacy singular error field.
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  const hasQueryError = data.state === LoadingState.Error || data.error != null || (data.errors?.length ?? 0) > 0;
  const dataIssue = useMemo(() => {
    if (data.state === LoadingState.Loading || hasQueryError) {
      return undefined;
    }
    return chartModule.getDataIssue?.(chartContext);
  }, [chartModule, chartContext, data.state, hasQueryError]);

  if (dataIssue != null) {
    return <PanelDataErrorView data={data} panelId={id} fieldConfig={fieldConfig} message={dataIssue.message} />;
  }

  return (
    <ChartContent
      chartModule={chartModule}
      chartContext={chartContext}
      resolvedLegend={resolvedLegend}
      isVizLegend={isVizLegend}
      seriesType={seriesType}
      timeline={timeline}
      selectedTime={selectedTime}
      onSelectTime={setPickedTime}
      width={width}
      height={height}
      fieldConfig={fieldConfig}
      timeZone={timeZone}
      eventBus={eventBus}
      onChangeTimeRange={onChangeTimeRange}
      onFieldConfigChange={onFieldConfigChange}
      onOptionsChange={onOptionsChange}
    />
  );
};
