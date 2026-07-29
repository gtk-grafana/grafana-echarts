import { type EChartsType } from 'lib/echarts/echarts';
import { useEffect } from 'react';

/**
 * Resize the chart to the box VizLayout allocated. ECharts does not track its
 * container's size, so every layout change has to be pushed in.
 * https://echarts.apache.org/en/api.html#echartsInstance.resize
 */
export function useChartResize(chart: EChartsType | null, width: number, height: number): void {
  useEffect(() => {
    if (!chart) {
      return;
    }
    chart.resize({ width, height });
  }, [chart, width, height]);
}
