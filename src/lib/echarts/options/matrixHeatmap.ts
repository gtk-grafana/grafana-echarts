import { type DisplayProcessor, type GrafanaTheme2 } from '@grafana/data';
import { type HeatmapSeriesOption } from 'echarts';
import { type ContinuousVisualMapOption } from 'echarts/types/dist/shared';
import { type MatrixHeatmapData } from 'lib/echarts/converters/matrixHeatmap';
import { MATRIX_VALUE_DIM } from 'lib/echarts/options/constants';
import { getHeatmapVisualMap } from 'lib/echarts/options/heatmapVisualMap';
import { type HeatmapColorScalePlacement, type HeatmapColorScheme } from 'lib/echarts/options/types';
import { buildMatrixHeatmapTooltipModel } from 'lib/echarts/tooltip/matrixHeatmap';
import { seriesTooltip } from 'lib/echarts/tooltip/option';
import { type BinnedHeatmapTooltipContext } from 'lib/echarts/tooltip/types';

/**
 * Build the native ECharts heatmap series for the matrix layout. `zlevel` places
 * the cells on the series canvas layer (see the panel's `zLevel.series`),
 * matching the other series so layered canvas capture can isolate the series
 * draw calls. The cells are excluded from the toggle legend (they are a single
 * grid, not togglable series).
 * https://echarts.apache.org/en/option.html#series-heatmap
 */
export function getMatrixHeatmapSeries(
  data: MatrixHeatmapData,
  tooltipCtx: BinnedHeatmapTooltipContext,
  zlevel?: number
): HeatmapSeriesOption {
  return {
    name: 'Heatmap',
    type: 'heatmap',
    zlevel,
    data: data.cells,
    // Cells never animate, even when the panel opts in via `animation.enabled`: a
    // series-level `animation` overrides the panel-level flag. A matrix holds one
    // cell per x/y pair, so the rect count scales with the product of both axes,
    // and a grid has no shape to grow into — the transition is pure cost. Matches
    // the binned layout's cartesian overlay; see docs/performance.md.
    // https://echarts.apache.org/en/option.html#series-heatmap.animation
    animation: false,
    legendHoverLink: false,
    tooltip: seriesTooltip(buildMatrixHeatmapTooltipModel(data, tooltipCtx), tooltipCtx.tooltipSink),
  };
}

interface MatrixHeatmapVisualMapOptions {
  data: MatrixHeatmapData;
  theme: GrafanaTheme2;
  seriesIndex: number;
  scheme?: HeatmapColorScheme;
  formatDisplayValue: DisplayProcessor;
  placement: HeatmapColorScalePlacement;
}

/**
 * Continuous visualMap that colors the matrix heatmap series by its value dim
 * ({@link MATRIX_VALUE_DIM}). Shares its placement/sizing with the binned layout
 * via {@link getHeatmapVisualMap} so the color scale reads consistently across
 * layouts.
 */
export function getMatrixHeatmapVisualMap({
  data,
  theme,
  formatDisplayValue,
  placement = 'right',
  scheme,
  seriesIndex,
}: MatrixHeatmapVisualMapOptions): ContinuousVisualMapOption {
  return getHeatmapVisualMap({
    valueMin: data.valueMin,
    valueMax: data.valueMax,
    dimension: MATRIX_VALUE_DIM,
    theme,
    seriesIndex,
    scheme,
    placement,
    formatDisplayValue,
  });
}
