import { LegendDisplayMode, type VizLegendOptions } from '@grafana/schema';

const DEFAULT_LEGEND_WIDTH = 240;
const MIN_TABLE_LEGEND_HEIGHT = 80;
const MAX_TABLE_LEGEND_HEIGHT = 200;
const MIN_LIST_LEGEND_HEIGHT = 32;
const MAX_LIST_LEGEND_HEIGHT = 80;

export const getPanelLayout = (width: number, height: number, legend: VizLegendOptions, domLegend: boolean) => {
  if (!domLegend) {
    return { chartWidth: width, chartHeight: height, legendWidth: width, legendHeight: 0 };
  }

  if (legend.placement === 'right') {
    // This panel keeps the legend width numeric (see `editor/legend`); Core
    // widened it to `number | string` (px/%) in grafana/grafana#126198, but the
    // ECharts canvas is sized in pixels, so any stray string is coerced away.
    const configuredWidth = Number(legend.width) || 0;
    const legendWidth =
      configuredWidth > 0
        ? Math.min(configuredWidth, Math.floor(width / 2))
        : Math.min(DEFAULT_LEGEND_WIDTH, Math.floor(width / 2));
    return { chartWidth: width - legendWidth, chartHeight: height, legendWidth, legendHeight: height };
  }

  const isTable = legend.displayMode === LegendDisplayMode.Table;
  const legendHeight = isTable
    ? Math.min(Math.max(Math.round(height * 0.35), MIN_TABLE_LEGEND_HEIGHT), MAX_TABLE_LEGEND_HEIGHT)
    : Math.min(Math.max(Math.round(height * 0.2), MIN_LIST_LEGEND_HEIGHT), MAX_LIST_LEGEND_HEIGHT);

  return { chartWidth: width, chartHeight: height - legendHeight, legendWidth: width, legendHeight };
};
