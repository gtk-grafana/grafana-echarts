import { type VizLegendItem } from '@grafana/ui';
import { STREAM_LAYER_SOURCE_DEFAULT, streamLayerSourcePath } from 'editor/stream';
import { frameToStream, type StreamData } from 'lib/echarts/converters/stream';
import { DEFAULT_CHART_LEGEND } from 'lib/echarts/options/legend';
import { getCalcDisplayValues } from 'lib/echarts/options/legendItems';
import { getStreamSingleAxis, getThemeRiverSeries, streamDefaultOptions } from 'lib/echarts/options/stream';
import {
  type BaseOptionParts,
  type ChartContext,
  type ChartModule,
  type EChartStreamSeriesOption,
  type StreamChartContext,
} from './types';

/**
 * Stream chart family: a theme river (stacked ribbons) on the ECharts `singleAxis`
 * coordinate system.
 *
 * One layer per numeric field, or per label-column value for long-shaped frames —
 * see `lib/echarts/converters/stream.ts` and `data-plane/stream.md`. The family
 * has a single render type (`themeRiver`), so there is no dispatch on
 * `ctx.seriesType`.
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
    return {
      ...streamDefaultOptions,
      // The river reuses the single axis' layout box, so the axis carries the panel
      // padding. Only a native ECharts legend needs room reserved there — a Grafana
      // DOM legend is laid out by `VizLayout` before the canvas exists (same
      // reasoning as `getParallelComponent`).
      singleAxis: getStreamSingleAxis(ctx.timeRange, ctx.theme, isGrafanaLegend ? undefined : ctx.options.legend),
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
