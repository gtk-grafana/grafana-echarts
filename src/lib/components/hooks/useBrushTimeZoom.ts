import { type AbsoluteTimeRange } from '@grafana/data';
import { debug, LOG_LEVELS } from 'development';
import { type ComposeOption } from 'echarts';
import type { XAXisOption } from 'echarts/types/src/coord/cartesian/AxisModel';
import { type EChartsType } from 'lib/echarts/echarts';
import { type BrushEndEvent, brushEndToTimeRange, CLEAR_TIME_BRUSH_ACTION } from 'lib/echarts/timeBrush';
import { useEffect, useRef } from 'react';

/**
 * Translate a completed time-axis drag-select into a dashboard time-range change.
 * Bound once per chart instance (`useChartOption` (re-)arms the cursor itself);
 * the handler reads the latest setter through a ref so a new `onChangeTimeRange`
 * prop does not re-bind the listener. Grafana then refetches and the panel
 * re-renders with the new range pinned on the axis.
 */
export function useBrushTimeZoom(
  chart: EChartsType | null,
  onChangeTimeRange: (timeRange: AbsoluteTimeRange) => void
): void {
  const onChangeTimeRangeRef = useRef(onChangeTimeRange);
  useEffect(() => {
    onChangeTimeRangeRef.current = onChangeTimeRange;
  }, [onChangeTimeRange]);

  useEffect(() => {
    if (!chart) {
      return;
    }

    const handleBrushEnd = (event: BrushEndEvent) => {
      // Candlestick/boxplot render on a category axis, whose `coordRange` is in
      // category-index units; read the rendered x-axis so those indices can be
      // mapped back to timestamps. `getOption` normalizes `xAxis` to an array.
      // @todo remove type assertion
      const option: ComposeOption<XAXisOption> = chart.getOption();
      if (!Array.isArray(option.xAxis)) {
        debug('xAxis option is invalid!', LOG_LEVELS.warn, option.xAxis);
        throw new Error('Invalid xAxis!');
      }
      if (option.xAxis.length > 1) {
        debug('Chart contains multiple xAxis, grabbing range from first', LOG_LEVELS.info, option.xAxis);
      }
      const range = brushEndToTimeRange(event, option.xAxis[0]);
      // Clear the selection highlight so it does not linger through the refetch.
      chart.dispatchAction(CLEAR_TIME_BRUSH_ACTION);
      if (range) {
        onChangeTimeRangeRef.current(range);
      }
    };

    // eCharts types here are cryptic and/or missing definitions for all of the chart events, so we must typecast for now
    // See the comment in lib/echarts/timeBrush.ts
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    chart.on('brushEnd', handleBrushEnd as (...args: unknown[]) => void);
    return () => {
      // On unmount EChart's layout effect disposes the instance before this
      // passive cleanup runs, so guard against calling `off` on a disposed chart
      // (dispose already drops its listeners). https://echarts.apache.org/en/api.html#echartsInstance.isDisposed
      if (!chart.isDisposed()) {
        chart.off('brushEnd', handleBrushEnd);
      }
    };
  }, [chart]);
}
