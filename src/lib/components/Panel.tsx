import { type PanelProps } from '@grafana/data';
import { PanelDataErrorView } from '@grafana/runtime';
import { useTheme2, VizLayout } from '@grafana/ui';
import { debug, LOG_LEVELS } from 'development';
import { seriesTypePath } from 'editor/constants';
import { type ChartFamily, resolveSeriesType } from 'lib/echarts/charts/autoSeriesType';
import { resolveChartModule } from 'lib/echarts/charts/registry';
import { type ChartContext } from 'lib/echarts/charts/types';
import { type EChartsType } from 'lib/echarts/echarts';
import { isLegendVisible, resolveLegendOptions } from 'lib/echarts/options/legend';
import { resolveRelationsTimeStepDuration } from 'lib/echarts/options/timeline';
import { getRepresentativeFormatter } from 'lib/grafana/formatter';
import React, { useMemo, useRef, useState } from 'react';
import { type PanelOptions } from 'types';
import { ChartNotices } from './ChartNotices';
import { ChartTimeSlider, TIME_SLIDER_HEIGHT } from './ChartTimeSlider';
import { ChartZoomControls } from './ChartZoomControls';
import { EChart } from './EChart';
import { useLegend } from './hooks/useLegend';
import { useLegendHighlight } from './hooks/useLegendHighlight';
import { resolveTimelineIndex } from './hooks/useTimelinePlayback';

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
  onOptionsChange,
  replaceVariables,
}) => {
  debug('panelData series', LOG_LEVELS.debug, data.series);
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

  // Everything but the time selection. Split out so the timeline below can be resolved
  // without depending on the selection it is used to clamp — a context that carried
  // both would rebuild the timeline array on every scrub, and a fresh array identity on
  // every step would restart the playback timer once per tick.
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

  // The stops this render can be stepped through, or `null` for no slider. Only relations
  // supplies any — see `ChartModule.getTimeline` and `ChartTimeSlider`.
  const timeline = useMemo(() => chartModule.getTimeline?.(baseContext) ?? null, [chartModule, baseContext]);

  /**
   * The selected timestamp: **transient panel state**, never a saved option. Scrubbing a
   * dashboard somebody is only reading must not mark it as having unsaved changes — the
   * line `useRelationsPersistence` draws between an edit (a dragged node) and a view.
   *
   * Held as a timestamp rather than a slider index, and clamped against the current
   * timeline on every render, because the dashboard refreshes underneath it: a rolling
   * window drops the oldest stop and adds a new one, and an index would quietly come to
   * mean a different instant. `null` resolves to the newest stop, which is what the
   * default `lastNotNull` reducer already draws.
   */
  const [pickedTime, setPickedTime] = useState<number | null>(null);
  const selectedTime = timeline != null ? timeline[resolveTimelineIndex(timeline, pickedTime)] : null;

  const chartContext: ChartContext = useMemo(() => ({ ...baseContext, selectedTime }), [baseContext, selectedTime]);

  // Advisories for renders where the chart had to change the data to draw it
  // (e.g. the sankey cycle policy). Most families supply none.
  const notices = useMemo(() => chartModule.getNotices?.(chartContext) ?? [], [chartModule, chartContext]);

  // The roam action the corner zoom buttons dispatch, or `undefined` for a family or a
  // render with no zoomable view. Only relations supplies one — see `ChartZoomControls`
  // for why zoom is buttons rather than the scroll wheel.
  const zoomAction = useMemo(() => chartModule.getZoomAction?.(chartContext), [chartModule, chartContext]);

  // The legend is `VizLayout`'s sibling, not `EChart`'s child, so its hover
  // emphasis reaches the chart through this ref rather than through the chart
  // instance state `EChart` keeps for its own hooks.
  const chartInstanceRef = useRef<EChartsType | null>(null);
  useLegendHighlight(chartInstanceRef, chartModule, chartContext, eventBus);

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
      {(vizWidth: number, vizHeight: number) => {
        // The time slider is the one piece of panel chrome that takes layout rather than
        // overlaying the plot, so the chart gets what is left. An explicit pixel height
        // rather than `flex: 1`: `EChart` writes its height as an inline style and pushes
        // the same number into ECharts, which cannot read a solved flex box.
        const chartHeight = vizHeight - (timeline != null ? TIME_SLIDER_HEIGHT : 0);
        return (
          <div style={{ width: vizWidth, height: vizHeight, display: 'flex', flexDirection: 'column' }}>
            {/* Positioned so `ChartNotices` can pin itself to the *chart's* corner —
                the corner controls anchor to the reduced box, so the zoom buttons and
                the slider cannot collide. */}
            <div style={{ position: 'relative', width: vizWidth, height: chartHeight }}>
              <EChart
                chartContext={chartContext}
                chartModule={chartModule}
                isGrafanaLegend={isVizLegend}
                onChangeTimeRange={onChangeTimeRange}
                onFieldConfigChange={onFieldConfigChange}
                onOptionsChange={onOptionsChange}
                width={vizWidth}
                height={chartHeight}
                instanceRef={chartInstanceRef}
              />
              <ChartNotices notices={notices} />
              <ChartZoomControls
                action={zoomAction}
                chartRef={chartInstanceRef}
                width={vizWidth}
                height={chartHeight}
              />
            </div>
            <ChartTimeSlider
              timeline={timeline}
              selected={selectedTime}
              onSelect={setPickedTime}
              timeZone={timeZone}
              stepDuration={resolveRelationsTimeStepDuration(options)}
            />
          </div>
        );
      }}
    </VizLayout>
  );
};
