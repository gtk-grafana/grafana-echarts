import { type ChartResizeStrategy } from 'lib/echarts/charts/types';
import { type EChartsType } from 'lib/echarts/echarts';
import { useEffect, useRef } from 'react';

interface Options {
  enabled?: boolean;
  strategy?: ChartResizeStrategy;
}

/**
 * Resize the chart to the box VizLayout allocated. ECharts does not track its
 * container's size, so every layout change has to be pushed in.
 * https://echarts.apache.org/en/api.html#echartsInstance.resize
 */
export function useChartResize(
  chart: EChartsType | null,
  width: number,
  height: number,
  { enabled = true, strategy = 'immediate' }: Options = {}
): void {
  const priorIdentity = useRef<{ chart: EChartsType | null; strategy: ChartResizeStrategy }>();

  useEffect(() => {
    const identityChanged = priorIdentity.current?.chart !== chart || priorIdentity.current.strategy !== strategy;
    priorIdentity.current = { chart, strategy };

    if (!chart || !enabled) {
      return;
    }

    if (strategy === 'fixed') {
      return;
    }

    if (chart.getWidth() === width && chart.getHeight() === height) {
      return;
    }

    if (strategy === 'animated-force' && !identityChanged) {
      // Enable force motion for the transient resize. The settled full option
      // restores the configured value after the allocated size is stable.
      // https://echarts.apache.org/en/option.html#series-graph.force.layoutAnimation
      chart.setOption({
        series: [{ type: 'graph', force: { layoutAnimation: true, friction: 0.05, initLayout: 'none' } }],
      });
    }

    chart.resize({ width, height });
  }, [chart, width, height, enabled, strategy]);
}
