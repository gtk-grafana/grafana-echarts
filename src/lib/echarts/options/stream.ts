import { type GrafanaTheme2, type TimeRange } from '@grafana/data';
import { type VizLegendOptions } from '@grafana/schema';
import { type ThemeRiverSeriesOption } from 'echarts';
// `SingleAxisOption` is not re-exported from the `echarts` barrel; see charts/types.ts.
import { type ECBasicOption, type SingleAxisOption } from 'echarts/types/dist/shared';
import { STREAM_BOUNDARY_GAP_DEFAULT } from 'editor/stream';
import { type StreamChartContext } from 'lib/echarts/charts/types';
import { type StreamData, type StreamLayer, visibleStreamLayers } from 'lib/echarts/converters/stream';
import { createBaseOptions } from 'lib/echarts/options/base';
import { getCartesianAxisStyle, getTimeAxisBounds } from 'lib/echarts/options/cartesian';
import { buildStreamTooltipModel } from 'lib/echarts/tooltip/stream';
import { seriesTooltip } from 'lib/echarts/tooltip/option';

/**
 * Base option for the stream family. The `singleAxis` component and the series
 * are merged at render time. The native ECharts legend is omitted: layers are
 * surfaced through the Grafana DOM legend (see charts/stream.ts
 * `buildLegendItems`), like the hierarchy family.
 */
export const streamDefaultOptions: ECBasicOption = {
  ...createBaseOptions(),
};

/** Padding around the single axis' layout rect, which the river reuses. */
const AXIS_PADDING = 8;
/**
 * Extra room under the axis line for the tick labels. The single axis defaults to
 * `position: 'bottom'`, so its labels are drawn below its rect and would be
 * clipped without this (there is no `containLabel` equivalent outside `grid`).
 */
const AXIS_LABEL_HEIGHT = 24;
/** Reserved for a native ECharts legend, matching the cartesian grid's gap. */
const LEGEND_PADDING = 12;

/**
 * The ECharts `singleAxis` component the river is laid out on: a time axis pinned
 * to the dashboard time range, styled like every other axis in the plugin.
 *
 * The series has no box of its own — "the positional information of the whole
 * theme river view reuses the positional information of a single time axis"
 * (left/top/right/bottom), so the panel's padding is set here.
 * https://echarts.apache.org/en/option.html#singleAxis
 */
export function getStreamSingleAxis(
  timeRange: TimeRange,
  theme: GrafanaTheme2,
  legend?: VizLegendOptions
): SingleAxisOption {
  return {
    type: 'time',
    // Pin to the dashboard window so a gappy river still spans the panel and
    // lines up with sibling panels (as the cartesian x-axis does).
    ...getTimeAxisBounds(timeRange),
    top: AXIS_PADDING,
    left: AXIS_PADDING,
    right: AXIS_PADDING + (legend?.placement === 'right' ? LEGEND_PADDING : 0),
    bottom: AXIS_LABEL_HEIGHT + (legend?.placement === 'bottom' ? LEGEND_PADDING : 0),
    ...getCartesianAxisStyle(theme),
    // A single axis rules the whole plot area with `splitLine`, which reads as a
    // grid drawn *over* the ribbons; the ticks alone are enough here.
    splitLine: { show: false },
  };
}

/**
 * Flatten layers to the `[time, value, name]` triples ECharts wants.
 *
 * Plain arrays are mandatory: `ThemeRiverSeriesModel.getInitialData` filters the
 * raw data with `dataItem[2] !== undefined` and `fixData` indexes `[0]`/`[1]`/`[2]`,
 * so an object item (`{ value, itemStyle }`) is dropped outright — which is also
 * why per-layer color cannot ride on the data and goes through the palette below.
 *
 * Emitted layer by layer, so each layer name first appears in layer order.
 * https://echarts.apache.org/en/option.html#series-themeRiver.data
 */
export function toThemeRiverData(layers: StreamLayer[]): NonNullable<ThemeRiverSeriesOption['data']> {
  return layers.flatMap((layer) =>
    layer.points.map(([time, value]): [number, number, string] => [time, value, layer.name])
  );
}

/**
 * The themeRiver series: stacked ribbons over the single time axis.
 *
 * Colors go through `series.color` rather than the data items. themeRiver
 * defaults to `colorBy: 'data'`, and ECharts' `dataColorPaletteTask` resolves each
 * item's color with `getColorFromPalette(name, ...)`, which caches by name — so
 * every triple of a layer shares one color and each new layer name consumes the
 * next palette entry. Handing it the layer colors in layer order therefore paints
 * each ribbon with its Grafana color. (`itemStyle.color` is deliberately not set:
 * that would clear `colorFromPalette` and paint every ribbon alike.)
 */
export function getThemeRiverSeries(data: StreamData, ctx: StreamChartContext): ThemeRiverSeriesOption {
  // Every surface keyed to the emitted data derives from this one list, so the
  // palette, the triples, and the tooltip's index map stay aligned when the legend
  // hides a layer.
  const layers = visibleStreamLayers(data);

  return {
    type: 'themeRiver',
    color: layers.map((layer) => layer.color),
    boundaryGap: STREAM_BOUNDARY_GAP_DEFAULT,
    // ECharts draws a layer label at the left edge of every ribbon by default, in
    // black at 11px — unreadable in a Grafana panel and overlapping on anything
    // but a handful of layers. Off until the family's editor surface can offer it.
    label: { show: false },
    // Place the series on its own canvas layer (see the panel's `zLevel.series`)
    // so layered canvas capture can isolate it, matching the other families.
    zlevel: ctx.options.zLevel?.series,
    data: toThemeRiverData(layers),
    // A hovered ribbon carries `[time, value, name]`, so the generic tooltip model
    // (which reads the last element as the magnitude) would print the layer name
    // as the value. The family builds its own model instead, the pie/hierarchy route.
    tooltip: seriesTooltip(buildStreamTooltipModel(layers, ctx), ctx.tooltipSink),
  };
}
