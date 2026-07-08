import { LegendDisplayMode, type VizLegendOptions } from '@grafana/schema';

const DEFAULT_LEGEND_WIDTH = 240;
const MIN_TABLE_LEGEND_HEIGHT = 80;
const MAX_TABLE_LEGEND_HEIGHT = 200;
const MIN_LIST_LEGEND_HEIGHT = 32;
const MAX_LIST_LEGEND_HEIGHT = 80;

/**
 * Resolve a legend width to pixels within a container of `containerWidth`.
 *
 * Since grafana/grafana#126198 `VizLegendOptions.width` is typed `number | string`,
 * and the Core "Width" editor stores either a bare number of pixels (`220`) or a
 * CSS string with a `px`/`%` unit (`"220px"`, `"35%"`). ECharts needs pixel
 * dimensions to size its canvas, so percentages are resolved against the
 * container instead of being dropped. Returns 0 for empty/auto/unparseable
 * values so callers can apply their own default.
 */
export const resolveLegendWidthPx = (width: number | string | undefined, containerWidth: number): number => {
  if (typeof width === 'number') {
    return Number.isFinite(width) && width > 0 ? width : 0;
  }

  if (typeof width !== 'string') {
    return 0;
  }

  const trimmed = width.trim();

  if (trimmed.endsWith('%')) {
    const pct = parseFloat(trimmed);
    return Number.isFinite(pct) && pct > 0 ? Math.round((containerWidth * pct) / 100) : 0;
  }

  // Bare number or explicit `px`; parseFloat ignores a trailing `px` unit.
  const px = parseFloat(trimmed);
  return Number.isFinite(px) && px > 0 ? Math.round(px) : 0;
};

export const getPanelLayout = (width: number, height: number, legend: VizLegendOptions, domLegend: boolean) => {
  if (!domLegend) {
    return { chartWidth: width, chartHeight: height, legendWidth: width, legendHeight: 0 };
  }

  if (legend.placement === 'right') {
    const configuredWidth = resolveLegendWidthPx(legend.width, width);
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
