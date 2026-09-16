import { type ChartResizeStrategy } from 'lib/echarts/charts/types';
import { type EChartsType } from 'lib/echarts/echarts';
import { useEffect, useState } from 'react';

const SETTLE_DELAY_MS = 150;

interface ChartSize {
  width: number;
  height: number;
}

interface PublishedChartSize extends ChartSize {
  chart: EChartsType | null;
  strategy: ChartResizeStrategy;
}

/** Coordinate option dimensions with the chart's resize behavior. */
export function useSettledChartSize(
  chart: EChartsType | null,
  width: number,
  height: number,
  strategy: ChartResizeStrategy
): ChartSize {
  const [published, setPublished] = useState<PublishedChartSize>({ chart, width, height, strategy });
  const identityChanged = published.chart !== chart || published.strategy !== strategy;

  if (identityChanged) {
    setPublished({ chart, width, height, strategy });
  }

  useEffect(() => {
    if (strategy !== 'animated-force' || identityChanged) {
      return;
    }

    if (published.width === width && published.height === height) {
      return;
    }

    const timer = setTimeout(() => setPublished({ chart, width, height, strategy }), SETTLE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [chart, height, identityChanged, published.height, published.width, strategy, width]);

  return strategy === 'immediate' || identityChanged
    ? { width, height }
    : { width: published.width, height: published.height };
}
