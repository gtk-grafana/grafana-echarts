import { VizLayout } from '@grafana/ui';
import { type EChartsType } from 'lib/echarts/echarts';
import React, { useMemo, useRef } from 'react';
import { ChartNotices } from './ChartNotices';
import { ChartTimeSlider, TIME_SLIDER_HEIGHT } from './ChartTimeSlider';
import { ChartZoomControls } from './ChartZoomControls';
import { EChart } from './EChart';
import { useLegend } from './hooks/useLegend';
import { useLegendHighlight } from './hooks/useLegendHighlight';
import { type ChartContentProps } from './types';

export const ChartContent: React.FC<ChartContentProps> = ({
  chartModule,
  chartContext,
  resolvedLegend,
  isVizLegend,
  seriesType,
  timeline,
  selectedTime,
  onSelectTime,
  width,
  height,
  fieldConfig,
  timeZone,
  eventBus,
  onChangeTimeRange,
  onFieldConfigChange,
  onOptionsChange,
}) => {
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

  return (
    <VizLayout width={width} height={height} legend={legendItems.length > 0 ? renderLegend() : null}>
      {(vizWidth: number, vizHeight: number) => {
        // The slider is the one piece of chrome that takes layout rather than overlaying the
        // plot, so the chart gets what is left. An explicit pixel height rather than
        // `flex: 1`: `EChart` pushes the same number into ECharts, which cannot read a
        // solved flex box.
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
            <ChartTimeSlider timeline={timeline} selected={selectedTime} onSelect={onSelectTime} timeZone={timeZone} />
          </div>
        );
      }}
    </VizLayout>
  );
};
