import { dateTimeFormat } from '@grafana/data';
import { type TopLevelFormatterParams } from 'echarts/types/dist/shared';
import { type StreamLayer } from 'lib/echarts/converters/stream';
import { formatEChartsValue, getValueFormatter } from 'lib/echarts/style';
import { type StreamTooltipContext, type TooltipModel, type TooltipSource } from 'lib/echarts/tooltip/types';

/**
 * Tooltip content model for the stream family's bubble variant, rendered by the
 * React overlay (`EChartsTooltip`).
 *
 * Separate from `buildStreamTooltipModel` because the two variants index their
 * layers differently, not because they present differently. The river is *one*
 * series carrying every layer's points, so it has to map a flat `dataIndex` back
 * through layer offsets; the bubble emits one series **per layer**, so `seriesIndex`
 * *is* the layer and `dataIndex` is the row within it — no offset arithmetic, and no
 * synthetic zero-filled items to miss (ECharts' `fixData` is themeRiver-only).
 *
 * Presentation matches the river deliberately: the time in the header (formatted in
 * the dashboard time zone) and the value in a row labelled with the layer name, each
 * formatted by its own layer's field unit/decimals where there is one.
 * https://echarts.apache.org/en/option.html#series-scatter.tooltip
 */
export function buildStreamBubbleTooltipModel(
  layers: StreamLayer[],
  ctx: StreamTooltipContext
): (params: TopLevelFormatterParams) => TooltipModel {
  const formatters = layers.map((layer) =>
    layer.field ? getValueFormatter(layer.field, ctx.theme, ctx.timeZone) : ctx.formatValue
  );

  return (params) => {
    const param = Array.isArray(params) ? params[0] : params;
    // `[time, value]` — a single-axis coordinate system has one dimension, so the
    // position rides on element 0 and the magnitude on element 1.
    const pair = Array.isArray(param?.value) ? param.value : undefined;
    const time = typeof pair?.[0] === 'number' ? pair[0] : undefined;
    const value = typeof pair?.[1] === 'number' ? pair[1] : null;

    const layerIndex = param?.seriesIndex ?? -1;
    const layer = layerIndex >= 0 ? layers[layerIndex] : undefined;
    const formatValue = formatters[layerIndex] ?? ctx.formatValue;

    // Links come from the layer's own field at the hovered row; only the fields
    // path has one (see `StreamLayer.field`).
    const source: TooltipSource | undefined =
      layer?.field != null && param?.dataIndex != null ? { field: layer.field, rowIndex: param.dataIndex } : undefined;

    return {
      // Time axis: the formatted time is the header value with no label, matching
      // core Grafana's `TimeSeriesTooltip` (see `makeHeaderValueFormatter`).
      header: { label: '', value: time != null ? dateTimeFormat(time, { timeZone: ctx.timeZone }) : '' },
      rows: [
        {
          color: typeof param?.color === 'string' ? param.color : undefined,
          label: layer?.name ?? String(param?.seriesName ?? ''),
          value: formatEChartsValue(value, formatValue),
          seriesIndex: param?.seriesIndex,
          source,
        },
      ],
      source,
    };
  };
}
