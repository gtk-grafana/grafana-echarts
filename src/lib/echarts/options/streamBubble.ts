import { type GrafanaTheme2, type TimeRange } from '@grafana/data';
import { type ScatterSeriesOption } from 'echarts';
// `SingleAxisOption` is not re-exported from the `echarts` barrel; see charts/types.ts.
import { type SingleAxisOption } from 'echarts/types/dist/shared';
import { STREAM_BUBBLE_MAX_SIZE_DEFAULT } from 'editor/stream';
import { type StreamChartContext } from 'lib/echarts/charts/types';
import { type StreamLayer } from 'lib/echarts/converters/stream';
import { AXIS_FONT_SIZE, getThemeTextStyle } from 'lib/echarts/options/base';
import { getStreamEmphasis, getStreamTimeAxisBase } from 'lib/echarts/options/stream';
import { buildStreamBubbleTooltipModel } from 'lib/echarts/tooltip/streamBubble';
import { seriesTooltip } from 'lib/echarts/tooltip/option';

/**
 * The stream family's second render variant: a punch-card / activity timeline.
 * Every layer gets its own `singleAxis` row, stacked top to bottom, and its own
 * `scatter` series whose symbol size encodes the value. Core Grafana has no
 * equivalent; the closest read is a heatmap, which bins rather than plotting each
 * observation.
 *
 * Why `scatter` and not `effectScatter`: only `ScatterSeriesModel` declares
 * `singleAxis` among its `dependencies` (`['grid', 'polar', 'geo', 'singleAxis',
 * 'calendar', 'matrix']`). `EffectScatterSeriesModel.dependencies` is
 * `['grid', 'polar']`, so the rippling variant is not offered.
 *
 * The layer model is `StreamData`, unchanged — the same converter output the river
 * renders, read as "one row per layer" instead of "one ribbon per layer".
 * https://echarts.apache.org/en/option.html#series-scatter.coordinateSystem
 */

/**
 * Vertical layout, in percentages of the panel rather than px.
 *
 * The option build deliberately never sees the panel's pixel size (`useChartOption`
 * memoizes it away so a resize does not rebuild the option), so an N-row stack has
 * to be expressed proportionally — which also means it degrades gracefully as rows
 * are added. `getLayoutRect` resolves these against the container.
 */
/** Top padding above the first row. */
const TOP_PERCENT = 4;
/** Room below the last row for the one set of shared tick labels. */
const BOTTOM_PERCENT = 14;
/** Left column reserved for the row names (the layer labels). */
const NAME_COLUMN_PERCENT = 16;
/** Right padding, so the last bubble is not clipped by the panel edge. */
const RIGHT_PERCENT = 4;
/**
 * Each row's rect is deliberately near-flat, so the row *is* its baseline.
 *
 * A tall rect misaligns the row: `Single.dataToPoint` centres every point on the
 * rect's cross extent (`rect.y + rect.height / 2`) while the axis line — and with it
 * the axis `name` — is drawn at the rect's edge, so the bubbles float half a rect
 * above their own label. Collapsing the rect makes centre and edge coincide, which
 * puts the bubbles, the baseline and the row name on one line. Rows are spaced by
 * their slot's centre instead of by rect height.
 */
const ROW_LINE_PERCENT = 2;

/**
 * Smallest diameter a *nonzero* value may render at. Without a floor, an area-based
 * scale collapses small-but-real observations to sub-pixel dots that read as
 * missing data — which for this family would be actively wrong, since a genuine
 * zero is supposed to be the thing that draws nothing.
 */
const BUBBLE_MIN_SIZE = 3;

/**
 * One `singleAxis` per layer, stacked top to bottom, all sharing the dashboard time
 * window so the rows are directly comparable.
 *
 * Only the **last** row draws tick labels: N identical sets of times would be noise,
 * and the rows are aligned so one set reads for all of them. Every row keeps its
 * axis line, which acts as the row's baseline, and carries its layer name as the
 * axis `name` in the reserved left column.
 * https://echarts.apache.org/en/option.html#singleAxis.name
 */
export function getStreamBubbleAxes(
  layers: StreamLayer[],
  timeRange: TimeRange,
  timeZone: string,
  theme: GrafanaTheme2
): SingleAxisOption[] {
  const slot = layers.length > 0 ? (100 - TOP_PERCENT - BOTTOM_PERCENT) / layers.length : 0;
  const nameTextStyle = { ...getThemeTextStyle(theme), fontSize: AXIS_FONT_SIZE };

  return layers.map((layer, index) => ({
    // Ticks only on the last row: N identical sets of times would be noise, and the
    // rows are aligned so one set reads for all of them.
    ...getStreamTimeAxisBase(timeRange, timeZone, theme, index === layers.length - 1),
    name: layer.name,
    // At the axis' start (its left end), in the reserved name column.
    nameLocation: 'start',
    nameTextStyle,
    left: `${NAME_COLUMN_PERCENT}%`,
    right: `${RIGHT_PERCENT}%`,
    // Centre the near-flat rect in the row's slot, so the slot spaces the rows and
    // the rect keeps bubbles, baseline and name on one line (see ROW_LINE_PERCENT).
    top: `${TOP_PERCENT + index * slot + (slot - ROW_LINE_PERCENT) / 2}%`,
    height: `${ROW_LINE_PERCENT}%`,
  }));
}

/**
 * The largest value across every layer — the denominator of the shared size scale.
 *
 * Shared rather than per-row on purpose: a punch card is read by comparing ink
 * *between* rows, which a per-row scale would make meaningless (every row's own
 * maximum would draw at full size). Returns 0 when there is nothing positive to
 * scale against, which `resolveBubbleSymbolSize` renders as no bubbles at all.
 */
export function getStreamBubbleMaxValue(layers: StreamLayer[]): number {
  let max = 0;
  for (const layer of layers) {
    for (const [, value] of layer.points) {
      if (value > max) {
        max = value;
      }
    }
  }
  return max;
}

/**
 * ECharts `series-scatter.symbolSize` as a callback over the shared scale.
 *
 * Diameter grows with the **square root** of the value so the symbol's *area* is
 * proportional to it — the standard encoding for a size channel, and the reason a
 * linear diameter scale exaggerates large values roughly quadratically.
 *
 * Non-positive values (which includes the family's null-becomes-zero rule and any
 * negative input) render nothing: on a punch card, absence of ink is the honest
 * reading of "nothing happened", where a zero-radius ribbon would be for the river.
 */
export function resolveBubbleSymbolSize(maxValue: number, maxSize: number): (value: unknown) => number {
  return (value) => {
    const magnitude = Array.isArray(value) ? Number(value[1]) : Number(value);
    if (!Number.isFinite(magnitude) || magnitude <= 0 || maxValue <= 0) {
      return 0;
    }
    return Math.max(BUBBLE_MIN_SIZE, maxSize * Math.sqrt(magnitude / maxValue));
  };
}

/**
 * One `scatter` series per layer, each bound to its own row via `singleAxisIndex`.
 *
 * The data items stay `[time, value]`: a single-axis coordinate system has one
 * dimension, so `Single.dataToPoint` reads `val[0]` for the position (and centres
 * the point on the row's cross extent), leaving element 1 as the magnitude the
 * `symbolSize` callback and the tooltip read.
 *
 * Color comes from `itemStyle` rather than a palette, unlike the river: scatter
 * defaults to `colorBy: 'series'`, so one series is one color and the layer's
 * Grafana color can be set directly.
 */
export function getStreamBubbleSeries(layers: StreamLayer[], ctx: StreamChartContext): ScatterSeriesOption[] {
  const maxValue = getStreamBubbleMaxValue(layers);
  const symbolSize = resolveBubbleSymbolSize(
    maxValue,
    ctx.options.streamBubbleMaxSize ?? STREAM_BUBBLE_MAX_SIZE_DEFAULT
  );
  // Shared with the river: `focus: 'self'` dims the other rows here rather than the
  // other ribbons. Omitted at the `none` default (see `getStreamEmphasis`).
  const emphasis = getStreamEmphasis(ctx.options.streamEmphasisFocus);
  const tooltip = seriesTooltip(buildStreamBubbleTooltipModel(layers, ctx), ctx.tooltipSink);

  return layers.map((layer, index) => ({
    type: 'scatter',
    coordinateSystem: 'singleAxis',
    singleAxisIndex: index,
    name: layer.name,
    itemStyle: { color: layer.color },
    symbolSize,
    ...(emphasis ? { emphasis } : {}),
    // Place the series on its own canvas layer (see the panel's `zLevel.series`)
    // so layered canvas capture can isolate it, matching the other families.
    zlevel: ctx.options.zLevel?.series,
    data: layer.points.map(([time, value]): [number, number] => [time, value]),
    tooltip,
  }));
}
