import { type GrafanaTheme2 } from '@grafana/data';
import { type HeatmapSeriesOption } from 'echarts';
import {
  type CallbackDataParams,
  type ContinuousVisualMapOption,
  type TopLevelFormatterParams,
} from 'echarts/types/dist/shared';
import { type MatrixHeatmapData } from 'lib/echarts/converters/matrixHeatmap';
import { getThemeTextStyle } from 'lib/echarts/options/base';
import { getHeatmapColors } from 'lib/echarts/options/constants';
import {
  type BinnedHeatmapTooltipContext,
  type HeatmapColorScalePlacement,
  type HeatmapColorScheme,
} from 'lib/echarts/options/types';
import { buildTooltipShell, formatTooltipValue } from 'lib/echarts/tooltip/template';

/** Dimension index of the value within a matrix cell tuple `[xIndex, yIndex, value]`. */
const MATRIX_VALUE_DIM = 2;

/**
 * Per-cell tooltip for the matrix heatmap. ECharts hands `params.value` back the
 * `[xIndex, yIndex, value]` tuple (item trigger); the indices are mapped back to
 * their category labels so the tooltip reads with the axis names rather than raw
 * indices. Returns safe DOM (no innerHTML) via the shared tooltip shell.
 * https://echarts.apache.org/en/option.html#series-heatmap.tooltip
 */
export function buildMatrixHeatmapTooltip(
  data: MatrixHeatmapData,
  ctx: BinnedHeatmapTooltipContext
): (params: TopLevelFormatterParams) => HTMLElement {
  return (params) => {
    const param = (Array.isArray(params) ? params[0] : params) as CallbackDataParams | undefined;
    const tuple = (Array.isArray(param?.value) ? param.value : []) as Array<number | null>;
    const xIndex = Number(tuple[0]);
    const yIndex = Number(tuple[1]);
    const value = tuple[MATRIX_VALUE_DIM] ?? null;

    const shell = buildTooltipShell(ctx.theme);
    // Header is the X (column) category; then a Value row and the Y (row) label,
    // mirroring the binned heatmap tooltip layout.
    shell.appendHeader(data.xCategories[xIndex] ?? '');
    shell.appendRow({ label: 'Value', value: formatTooltipValue(value, ctx.formatValue) });
    shell.appendRow({ label: 'Name', value: data.yCategories[yIndex] ?? '' });
    return shell.root;
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
    tooltip: { formatter: buildMatrixHeatmapTooltip(data, tooltipCtx) },
  };
}

/**
 * Continuous visualMap that colors the matrix heatmap series by its value
 * dimension. Placed on the right (vertical) by default or on the bottom
 * (horizontal), sized to the cell value range. Mirrors the binned heatmap
 * visualMap so the color scale reads consistently across layouts.
 * https://echarts.apache.org/en/option.html#visualMap-continuous
 */
export function getMatrixHeatmapVisualMap(
  data: MatrixHeatmapData,
  theme: GrafanaTheme2,
  seriesIndex: number,
  scheme?: HeatmapColorScheme,
  placement: HeatmapColorScalePlacement = 'right'
): ContinuousVisualMapOption {
  const orientation: Pick<
    ContinuousVisualMapOption,
    'orient' | 'left' | 'right' | 'top' | 'bottom' | 'itemWidth' | 'itemHeight'
  > =
    placement === 'bottom'
      ? { orient: 'horizontal', bottom: 8, left: 'center', itemWidth: 120, itemHeight: 12 }
      : { orient: 'vertical', right: 8, top: 'middle', itemWidth: 12, itemHeight: 120 };

  return {
    type: 'continuous',
    min: data.valueMin,
    max: data.valueMax === data.valueMin ? data.valueMin + 1 : data.valueMax,
    dimension: MATRIX_VALUE_DIM,
    seriesIndex,
    calculable: true,
    hoverLink: true,
    ...orientation,
    inRange: { color: getHeatmapColors(scheme) },
    textStyle: getThemeTextStyle(theme),
  };
}
