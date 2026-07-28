import { dateTimeFormat } from '@grafana/data';
import { type TopLevelFormatterParams } from 'echarts/types/dist/shared';
import { type BinnedHeatmapData, formatBucketBound } from 'lib/echarts/converters/binnedHeatmap';
// The cell tuple layout is owned by the series encode (`encodeBinnedHeatmapData`),
// which is what hands this formatter its `params.value`.
import { HEATMAP_VALUE_DIM } from 'lib/echarts/options/constants';
import { formatEChartsValue } from 'lib/echarts/style';
import { type BinnedHeatmapTooltipContext, type TooltipModel } from 'lib/echarts/tooltip/types';

/**
 * Per-cell tooltip for the binned heatmap custom series. Unlike the generic
 * tooltip (which would show the series name "Heatmap" and the raw cell value),
 * this matches core Grafana: the X (time/value) in the header, then a "Value"
 * row and the bucket "Name" row. The bucket label is recovered from the cell's Y
 * bounds via {@link BinnedHeatmapData.yBuckets}, the same labels the bucket axis
 * uses.
 *
 * ECharts hands `params.value` back the encoded `[xStart, yStart, xEnd, yEnd,
 * value]` tuple (item trigger).
 * See https://echarts.apache.org/en/option.html#series-custom.tooltip
 */
export function buildBinnedHeatmapTooltipModel(
  data: BinnedHeatmapData,
  ctx: BinnedHeatmapTooltipContext
): (params: TopLevelFormatterParams) => TooltipModel {
  const bucketLabels = new Map<string, string>();
  for (const bucket of data.yBuckets) {
    bucketLabels.set(`${bucket.start}:${bucket.end}`, bucket.label);
  }

  const formatX = (x: number): string => {
    if (!Number.isFinite(x)) {
      return String(x);
    }
    return data.xIsTime ? dateTimeFormat(x, { timeZone: ctx.timeZone }) : formatBucketBound(x);
  };

  return (params) => {
    const param = Array.isArray(params) ? params[0] : params;
    const tuple = Array.isArray(param?.value) ? param.value : [];
    const xStart = Number(tuple[0]);
    const yStart = Number(tuple[1]);
    const yEnd = Number(tuple[3]);
    const value = tuple[HEATMAP_VALUE_DIM] ?? null;

    const bucket = bucketLabels.get(`${yStart}:${yEnd}`) ?? `${formatBucketBound(yStart)} - ${formatBucketBound(yEnd)}`;

    // Cells are encoded 1:1 from `data.cells`, so the hovered item's index maps
    // straight back to the field + row it was built from — what the footer needs
    // to resolve the cell's data links.
    const cell = param?.dataIndex != null ? data.cells[param.dataIndex] : undefined;
    const source = cell ? { field: cell.field, rowIndex: cell.rowIndex } : undefined;

    // Time-style header: the x (time/value) goes in `value`, matching core's
    // heatmap tooltip composition.
    return {
      header: { label: '', value: formatX(xStart) },
      rows: [
        // The swatch carries the cell's own colour-scale colour, so the tooltip
        // shows which bucket of the scale was hit — the heatmap equivalent of a
        // series swatch. Only a plain CSS colour is usable (see `tooltipColor`).
        {
          color: typeof param?.color === 'string' ? param.color : undefined,
          label: 'Value',
          value: formatEChartsValue(value, ctx.formatValue),
          source,
        },
        { label: 'Name', value: bucket },
      ],
      source,
    };
  };
}
