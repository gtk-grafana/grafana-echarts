import { type VizLegendItem } from '@grafana/ui';
import { resolveStreamChartType, STREAM_LAYER_SOURCE_DEFAULT, streamLayerSourcePath } from 'editor/stream';
import { frameToStream, type StreamData, visibleStreamLayers } from 'lib/echarts/converters/stream';
import { DEFAULT_CHART_LEGEND } from 'lib/echarts/options/legend';
import { getCalcDisplayValues } from 'lib/echarts/options/legendItems';
import { getStreamSingleAxis, getThemeRiverSeries, streamDefaultOptions } from 'lib/echarts/options/stream';
import { getStreamBubbleAxes, getStreamBubbleSeries } from 'lib/echarts/options/streamBubble';
import {
  type BaseOptionParts,
  type ChartContext,
  type ChartModule,
  type EChartStreamSeriesOption,
  type StreamChartContext,
} from './types';

/**
 * Stream chart family: two renders on the ECharts `singleAxis` coordinate system —
 * a theme river (stacked ribbons over one shared axis) and a bubble punch card (one
 * axis per layer, symbol size from the value).
 *
 * One layer per numeric field, or per label-column value for long-shaped frames —
 * see `lib/echarts/converters/stream.ts` and `data-plane/stream.md`. Both variants
 * read the *same* `StreamData`, so switching between them re-renders one dataset
 * coherently (as radar↔parallel do over the categorical model).
 *
 * The dispatch is on the family-local `streamChartType`, not `ctx.seriesType`: the
 * bubble emits `scatter`, which `resolveChartModule` already routes to the cartesian
 * family, so the variant cannot ride on the shared series type. See
 * `StreamChartType` and `modules/stream/parity.md`.
 */
function buildStreamData(ctx: ChartContext): StreamData | null {
  return frameToStream(
    ctx.frames,
    ctx.theme,
    ctx.fieldConfig,
    ctx.options[streamLayerSourcePath] ?? STREAM_LAYER_SOURCE_DEFAULT
  );
}

export const streamChartModule: ChartModule = {
  legend: DEFAULT_CHART_LEGEND,

  /**
   * @todo restore "All" once the axis-mode row model exists. ECharts builds an
   * axis-triggered tooltip from the *global* tooltip model (see `_showAxisTooltip`
   * in `component/tooltip/TooltipView`), never the series-level formatter this
   * family attaches — so in Multi mode the generic model would run and read each
   * `[time, value, name]` triple's last element as the magnitude, printing the
   * layer name where the value belongs. Single mode goes through
   * `buildStreamTooltipModel` and is correct.
   */
  singleTooltipOnly: true,

  /**
   * Drag-to-zoom is suppressed: `BrushComponent` covers cartesian `grid` axes, and
   * this family renders on a `singleAxis` with no grid for the brush to attach to,
   * so arming the cursor would leave a drag that never resolves to a time range.
   */
  disableTimeBrush: true,

  buildOption(ctx: ChartContext, { isGrafanaLegend }: BaseOptionParts): EChartStreamSeriesOption | null {
    const data = buildStreamData(ctx);
    if (!data) {
      return null;
    }

    const streamCtx: StreamChartContext = { ...ctx, seriesType: 'themeRiver' };

    if (resolveStreamChartType(ctx.options) === 'bubble') {
      // One row per *visible* layer: a hidden layer must drop its axis too, or the
      // stack would leave an empty row behind. Every surface keyed to the emitted
      // series (the axes, the `singleAxisIndex` pairing, the tooltip's seriesIndex
      // map) therefore derives from this one list.
      const layers = visibleStreamLayers(data);
      return {
        ...streamDefaultOptions,
        singleAxis: getStreamBubbleAxes(layers, ctx.timeRange, ctx.timeZone, ctx.theme),
        series: getStreamBubbleSeries(layers, streamCtx),
      };
    }

    return {
      ...streamDefaultOptions,
      // The river reuses the single axis' layout box, so the axis carries the panel
      // padding. Only a native ECharts legend needs room reserved there — a Grafana
      // DOM legend is laid out by `VizLayout` before the canvas exists (same
      // reasoning as `getParallelComponent`).
      singleAxis: getStreamSingleAxis(
        ctx.timeRange,
        ctx.timeZone,
        ctx.theme,
        isGrafanaLegend ? undefined : ctx.options.legend
      ),
      series: [getThemeRiverSeries(data, streamCtx)],
    };
  },

  buildLegendItems(ctx, calcs): VizLegendItem[] {
    const data = buildStreamData(ctx);
    if (!data) {
      return [];
    }

    // One item per ribbon, in layer order, with the ribbon's own color. Hidden
    // layers are kept (greyed) so they can be toggled back — the series drops
    // them, the legend does not.
    return data.layers.map((layer, index) => ({
      label: layer.name,
      fieldName: layer.name,
      color: layer.color,
      yAxis: 1,
      disabled: layer.hidden,
      getItemKey: () => `stream-${index}`,
      // Calc columns need the source column; long-path layers have no field, so
      // they show names only (a table legend renders empty cells for them).
      getDisplayValues: () => (layer.field ? getCalcDisplayValues(calcs, layer.field, ctx.theme, ctx.timeZone) : []),
    }));
  },
};
