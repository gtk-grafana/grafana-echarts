import { type TopLevelFormatterParams } from 'echarts/types/dist/shared';
import { type MatrixHeatmapData } from 'lib/echarts/converters/matrixHeatmap';
// The cell tuple layout is shared with the series `data` and the visualMap dimension.
import { MATRIX_VALUE_DIM } from 'lib/echarts/options/constants';
import { formatTooltipValue, type TooltipModel } from 'lib/echarts/tooltip/model';
import { type BinnedHeatmapTooltipContext } from 'lib/echarts/tooltip/types';

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

    // A cell maps cleanly to one column field at one row, so the footer can
    // surface that field's data links (see `EChartsTooltip`).
    const field = data.xFields[xIndex];
    const source = field ? { field, rowIndex: yIndex } : undefined;

    // Header is the X (column) category; then a Value row and the Y (row) label,
    // mirroring the binned heatmap tooltip layout.
    return {
      header: { label: '', value: data.xCategories[xIndex] ?? '' },
      rows: [
        // Swatch = the cell's colour-scale colour; see the binned heatmap for why.
        {
          color: typeof param?.color === 'string' ? param.color : undefined,
          label: 'Value',
          value: formatTooltipValue(value, ctx.formatValue),
          source,
        },
        { label: 'Name', value: data.yCategories[yIndex] ?? '' },
      ],
      source,
    };
  };
}
