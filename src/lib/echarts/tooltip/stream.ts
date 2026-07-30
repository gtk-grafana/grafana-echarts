import { dateTimeFormat } from '@grafana/data';
import { type TopLevelFormatterParams } from 'echarts/types/dist/shared';
import { type StreamLayer } from 'lib/echarts/converters/stream';
import { formatEChartsValue, getValueFormatter } from 'lib/echarts/style';
import { type StreamTooltipContext, type TooltipModel, type TooltipSource } from 'lib/echarts/tooltip/types';

/**
 * First `dataIndex` of each layer, plus a final total — the layer boundaries in
 * the flattened triple array `toThemeRiverData` emits (layer by layer, in order).
 */
function layerOffsets(layers: StreamLayer[]): number[] {
  const offsets = [0];
  for (const layer of layers) {
    offsets.push(offsets[offsets.length - 1] + layer.points.length);
  }
  return offsets;
}

/**
 * Map a hovered `dataIndex` back to its layer and the point's row within that
 * layer. Returns `undefined` for an index past the emitted data: ECharts'
 * `ThemeRiverSeriesModel.fixData` appends synthetic `[time, 0, name]` triples for
 * every `(layer, time)` combination missing from the input, and those carry no
 * source row.
 */
function resolveLayerRef(offsets: number[], dataIndex: number): { layerIndex: number; rowIndex: number } | undefined {
  for (let layerIndex = 0; layerIndex < offsets.length - 1; layerIndex++) {
    if (dataIndex < offsets[layerIndex + 1]) {
      return { layerIndex, rowIndex: dataIndex - offsets[layerIndex] };
    }
  }
  return undefined;
}

/**
 * Tooltip content model for the themeRiver series, rendered by the React overlay
 * (`EChartsTooltip`). https://echarts.apache.org/en/option.html#series-themeRiver.tooltip
 *
 * The family cannot use the generic `buildTooltipModel`: a themeRiver item's
 * `value` is the `[time, value, name]` triple, and the generic model reads the
 * *last* element as the magnitude — which would print the layer name where the
 * value belongs. So this reads the dimensions positionally instead: the time into
 * the header (formatted in the dashboard time zone, matching the cartesian
 * families) and the value into a row labelled with the layer name.
 *
 * Each row formats with its own layer's field unit/decimals where there is one; a
 * long-path layer (rows grouped by a label column, so no single source field)
 * falls back to the panel formatter and carries no data-link footer.
 */
export function buildStreamTooltipModel(
  layers: StreamLayer[],
  ctx: StreamTooltipContext
): (params: TopLevelFormatterParams) => TooltipModel {
  const offsets = layerOffsets(layers);
  const formatters = layers.map((layer) =>
    layer.field ? getValueFormatter(layer.field, ctx.theme, ctx.timeZone) : ctx.formatValue
  );

  return (params) => {
    const param = Array.isArray(params) ? params[0] : params;
    // `[time, value, name]`, the dimension order themeRiver fixes for its data.
    const triple = Array.isArray(param?.value) ? param.value : undefined;
    const time = typeof triple?.[0] === 'number' ? triple[0] : undefined;
    const value = typeof triple?.[1] === 'number' ? triple[1] : null;

    const ref = param?.dataIndex != null ? resolveLayerRef(offsets, param.dataIndex) : undefined;
    // A zero-filled item resolves no ref, so fall back to the layer name ECharts
    // carries on the item (its `name` dimension) to keep the row labelled.
    const layerIndex = ref?.layerIndex ?? layers.findIndex((layer) => layer.name === param?.name);
    const layer = layerIndex >= 0 ? layers[layerIndex] : undefined;
    const formatValue = (layerIndex >= 0 ? formatters[layerIndex] : undefined) ?? ctx.formatValue;

    // Links come from the layer's own field at the hovered row; only the fields
    // path has one (see `StreamLayer.field`).
    const source: TooltipSource | undefined =
      layer?.field != null && ref != null ? { field: layer.field, rowIndex: ref.rowIndex } : undefined;

    return {
      // Time axis: the formatted time is the header value with no label, matching
      // core Grafana's `TimeSeriesTooltip` (see `makeHeaderValueFormatter`).
      header: { label: '', value: time != null ? dateTimeFormat(time, { timeZone: ctx.timeZone }) : '' },
      rows: [
        {
          color: typeof param?.color === 'string' ? param.color : undefined,
          label: layer?.name ?? String(param?.name ?? ''),
          value: formatEChartsValue(value, formatValue),
          seriesIndex: param?.seriesIndex,
          source,
        },
      ],
      source,
    };
  };
}
