import { type DisplayProcessor, type GrafanaTheme2 } from '@grafana/data';
import { type HeatmapSeriesOption } from 'echarts';
import { type ContinuousVisualMapOption, type TopLevelFormatterParams } from 'echarts/types/dist/shared';
import { type MatrixHeatmapData } from 'lib/echarts/converters/matrixHeatmap';
import { getHeatmapVisualMap } from 'lib/echarts/options/heatmapVisualMap';
import {
  type BinnedHeatmapTooltipContext,
  type HeatmapColorScalePlacement,
  type HeatmapColorScheme,
} from 'lib/echarts/options/types';
import {
  formatTooltipValue,
  NOOP_TOOLTIP_SINK,
  toEmittingFormatter,
  type TooltipModel,
} from 'lib/echarts/tooltip/model';

/** Dimension index of the value within a matrix cell tuple `[xIndex, yIndex, value]`. */
const MATRIX_VALUE_DIM = 2;

/**
 * Per-cell tooltip for the matrix heatmap. ECharts hands `params.value` back the
 * `[xIndex, yIndex, value]` tuple (item trigger); the indices are mapped back to
 * their category labels so the tooltip reads with the axis names rather than raw
 * indices. Rendered by the React overlay (`EChartsTooltip`).
 * https://echarts.apache.org/en/option.html#series-heatmap.tooltip
 */
export function buildMatrixHeatmapTooltipModel(
  data: MatrixHeatmapData,
  ctx: BinnedHeatmapTooltipContext
): (params: TopLevelFormatterParams) => TooltipModel {
  return (params) => {
    const param = Array.isArray(params) ? params[0] : params;
    const tuple = Array.isArray(param?.value) ? param.value : [];
    const xIndex = Number(tuple[0]);
    const yIndex = Number(tuple[1]);
    const value = tuple[MATRIX_VALUE_DIM] ?? null;

    // Header is the X (column) category; then a Value row and the Y (row) label,
    // mirroring the binned heatmap tooltip layout.
    return {
      header: { label: '', value: data.xCategories[xIndex] ?? '' },
      rows: [
        { label: 'Value', value: formatTooltipValue(value, ctx.formatValue) },
        { label: 'Name', value: data.yCategories[yIndex] ?? '' },
      ],
    };
  };
}

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
    legendHoverLink: false,
    tooltip: {
      formatter: toEmittingFormatter(
        buildMatrixHeatmapTooltipModel(data, tooltipCtx),
        tooltipCtx.tooltipSink ?? NOOP_TOOLTIP_SINK
      ),
    },
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
