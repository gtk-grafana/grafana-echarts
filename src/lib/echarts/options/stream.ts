import { type GrafanaTheme2, type TimeRange } from '@grafana/data';
import { type VizLegendOptions } from '@grafana/schema';
import { type ThemeRiverSeriesOption } from 'echarts';
// `SingleAxisOption` is not re-exported from the `echarts` barrel; see charts/types.ts.
import { type ECBasicOption, type SingleAxisOption } from 'echarts/types/dist/shared';
import {
  STREAM_ANIMATION_ENABLED_DEFAULT,
  STREAM_BORDER_WIDTH_DEFAULT,
  STREAM_BOUNDARY_GAP_PERCENT_DEFAULT,
  STREAM_BUBBLE_MAX_SIZE_DEFAULT,
  STREAM_EMPHASIS_FOCUS_DEFAULT,
  STREAM_FILL_OPACITY_DEFAULT,
  STREAM_LABEL_FONT_SIZE_DEFAULT,
  STREAM_LABEL_MARGIN_DEFAULT,
  STREAM_SHOW_LABELS_DEFAULT,
} from 'editor/stream';
import { type StreamEmphasisFocus } from 'editor/types';
import { type StreamChartContext } from 'lib/echarts/charts/types';
import { type StreamData, type StreamLayer, visibleStreamLayers } from 'lib/echarts/converters/stream';
import { createBaseOptions } from 'lib/echarts/options/base';
import { getCartesianAxisStyle, getTimeAxisBounds } from 'lib/echarts/options/cartesian';
import { applyAdvancedDefaults } from 'lib/echarts/options/editorMode';
import { getThemedLabelStyle } from 'lib/echarts/options/labels';
import { buildStreamTooltipModel } from 'lib/echarts/tooltip/stream';
import { seriesTooltip } from 'lib/echarts/tooltip/option';
import { getTimeAxisLabelFormatter } from 'lib/grafana/timeAxisFormat';
import { type PanelOptions } from 'types';

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
export const AXIS_PADDING = 8;
/**
 * Extra room under the axis line for the tick labels. The single axis defaults to
 * `position: 'bottom'`, so its labels are drawn below its rect and would be
 * clipped without this (there is no `containLabel` equivalent outside `grid`).
 */
export const AXIS_LABEL_HEIGHT = 24;
/** Reserved for a native ECharts legend, matching the cartesian grid's gap. */
export const LEGEND_PADDING = 12;

/**
 * The time-axis half of a stream `singleAxis`: the axis type, the dashboard bounds,
 * the shared plugin axis styling, and a timezone-correct tick formatter. Shared by
 * both render variants — the river lays one of these out over the whole panel, the
 * bubble variant stacks one per layer (see `options/streamBubble.ts`) — so the two
 * cannot drift in how they read time.
 *
 * `splitLine` is off: a single axis rules the *whole* plot area with it, which reads
 * as a grid drawn over the ribbons rather than under them.
 * https://echarts.apache.org/en/option.html#singleAxis
 */
export function getStreamTimeAxisBase(
  timeRange: TimeRange,
  timeZone: string,
  theme: GrafanaTheme2,
  showLabels = true
): SingleAxisOption {
  const axisStyle = getCartesianAxisStyle(theme);

  return {
    type: 'time',
    // Pin to the dashboard window so a gappy river still spans the panel and
    // lines up with sibling panels (as the cartesian x-axis does).
    ...getTimeAxisBounds(timeRange),
    ...axisStyle,
    // `show` is passed in rather than patched onto the returned axis: `axisLabel` is
    // a union across ECharts' axis types, so re-spreading it downstream widens
    // `formatter` back to the category signature and stops assigning.
    axisLabel: {
      ...axisStyle.axisLabel,
      show: showLabels,
      // ECharts only has a global `useUTC` and no IANA timezone support, so its
      // own time labels would render in browser-local time whatever the dashboard
      // is set to. Format each tick with Grafana's timezone, as the cartesian
      // x-axis and the heatmap both do.
      formatter: getTimeAxisLabelFormatter(timeRange, timeZone),
    },
    splitLine: { show: false },
  };
}

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
  timeZone: string,
  theme: GrafanaTheme2,
  legend?: VizLegendOptions
): SingleAxisOption {
  return {
    ...getStreamTimeAxisBase(timeRange, timeZone, theme),
    top: AXIS_PADDING,
    left: AXIS_PADDING,
    right: AXIS_PADDING + (legend?.placement === 'right' ? LEGEND_PADDING : 0),
    bottom: AXIS_LABEL_HEIGHT + (legend?.placement === 'bottom' ? LEGEND_PADDING : 0),
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

/* --- Stream option builders ---------------------------------------------------
 * Each helper omits its ECharts key at the default so an untouched theme river
 * renders on ECharts' own defaults, and only opted-in options add keys — the
 * `parallel.ts` / `pie.ts` convention. The one exception is `label`, which is
 * always written: ECharts shows layer labels by default and the plugin does not
 * (see `getStreamLabel`).
 *
 * "Omits" means the key is genuinely absent, not present-and-`undefined`:
 * `SeriesModel.mergeDefaultAndTheme` folds in `defaultOption` with zrender's
 * `merge(target, source, overwrite = false)`, which copies a default only when
 * `!(key in target)`. A `boundaryGap: undefined` therefore *defeats* the default
 * rather than falling back to it, and `themeRiverLayout` then throws indexing
 * `boundaryGap[0]`. Hence the conditional spreads in `getThemeRiverSeries`. */

/**
 * ECharts `series.boundaryGap` from the Advanced "Boundary gap" percentage: the
 * orthogonal padding above and below the stacked ribbons, as a share of the single
 * axis' cross extent. Omitted at ECharts' own `10%` default (and at unset), so a
 * default panel writes no key.
 * https://echarts.apache.org/en/option.html#series-themeRiver.boundaryGap
 */
export function getStreamBoundaryGap(percent: number | undefined): ThemeRiverSeriesOption['boundaryGap'] | undefined {
  if (percent == null || percent === STREAM_BOUNDARY_GAP_PERCENT_DEFAULT) {
    return undefined;
  }
  return [`${percent}%`, `${percent}%`];
}

/**
 * ECharts `series.label` for the layer labels — the ribbon names drawn on the bands
 * themselves.
 *
 * The only builder here that always writes its key, because this is the one option
 * whose plugin default *differs* from ECharts':
 * `ThemeRiverSeriesModel.defaultOption` sets `label.show: true` at 11px in a
 * hardcoded `#000`, which is illegible on a dark panel and overlaps past a handful
 * of layers. Off means an explicit `show: false`.
 *
 * When on, the label is themed through the shared `getThemedLabelStyle` (Grafana
 * font and text color, no ECharts shadow/stroke) and the Advanced offset / font
 * size are folded in — each omitted at its own default. `label.position` is *not*
 * offered: `ThemeRiverView` nulls it out and places the label by hand, so `margin`
 * is the only placement lever that does anything (see `streamLabelMarginPath`).
 * https://echarts.apache.org/en/option.html#series-themeRiver.label
 */
export function getStreamLabel(
  theme: GrafanaTheme2,
  show: boolean | undefined,
  margin?: number,
  fontSize?: number
): ThemeRiverSeriesOption['label'] {
  if (!(show ?? STREAM_SHOW_LABELS_DEFAULT)) {
    return { show: false };
  }

  return {
    show: true,
    ...getThemedLabelStyle(theme, { fontSize }),
    ...(margin != null && margin !== STREAM_LABEL_MARGIN_DEFAULT ? { margin } : {}),
  };
}

/**
 * ECharts `series.itemStyle` from the Advanced ribbon-style options: an opacity
 * (0–100 scaled to ECharts' 0–1) and a border width with its paired color, which
 * separates two similarly-colored neighbouring ribbons.
 *
 * `color` is deliberately never set here — that would clear themeRiver's
 * `colorFromPalette` and paint every ribbon alike (see `getThemeRiverSeries`).
 * Returns `undefined` when nothing is configured, so no `itemStyle` is written.
 * https://echarts.apache.org/en/option.html#series-themeRiver.itemStyle
 */
export function getStreamItemStyle(
  fillOpacity: number | undefined,
  borderWidth: number | undefined,
  borderColor: string | undefined
): ThemeRiverSeriesOption['itemStyle'] | undefined {
  const itemStyle: NonNullable<ThemeRiverSeriesOption['itemStyle']> = {};
  if (fillOpacity != null) {
    itemStyle.opacity = fillOpacity / 100;
  }
  if (borderWidth != null && borderWidth > STREAM_BORDER_WIDTH_DEFAULT) {
    itemStyle.borderWidth = borderWidth;
    if (borderColor) {
      itemStyle.borderColor = borderColor;
    }
  }
  return Object.keys(itemStyle).length > 0 ? itemStyle : undefined;
}

/**
 * ECharts `series.emphasis` for the Advanced "Hover emphasis" option. Omitted at
 * the `none` default (ECharts' own), so a default panel keeps the plain hover
 * lift; `self` fades the other ribbons and `series` highlights the whole river.
 *
 * Returns the bare `{ focus }` shape rather than a series-specific `emphasis` type
 * so both render variants can use it: on the river it dims the other ribbons, on the
 * bubble punch card the other rows.
 * https://echarts.apache.org/en/option.html#series-themeRiver.emphasis.focus
 */
export function getStreamEmphasis(focus: StreamEmphasisFocus | undefined): { focus: StreamEmphasisFocus } | undefined {
  if (!focus || focus === STREAM_EMPHASIS_FOCUS_DEFAULT) {
    return undefined;
  }
  return { focus };
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
  const { options, theme } = ctx;

  const boundaryGap = getStreamBoundaryGap(options.streamBoundaryGap);
  const itemStyle = getStreamItemStyle(options.streamFillOpacity, options.streamBorderWidth, options.streamBorderColor);
  const emphasis = getStreamEmphasis(options.streamEmphasisFocus);

  return {
    type: 'themeRiver',
    color: layers.map((layer) => layer.color),
    label: getStreamLabel(theme, options.streamShowLabels, options.streamLabelMargin, options.streamLabelFontSize),
    // Spread rather than assign: an `undefined` value would keep the key and so
    // block `defaultOption` from merging (see the note above the builders).
    ...(boundaryGap ? { boundaryGap } : {}),
    ...(itemStyle ? { itemStyle } : {}),
    ...(emphasis ? { emphasis } : {}),
    // Place the series on its own canvas layer (see the panel's `zLevel.series`)
    // so layered canvas capture can isolate it, matching the other families.
    zlevel: options.zLevel?.series,
    data: toThemeRiverData(layers),
    // A hovered ribbon carries `[time, value, name]`, so the generic tooltip model
    // (which reads the last element as the magnitude) would print the layer name
    // as the value. The family builds its own model instead, the pie/hierarchy route.
    tooltip: seriesTooltip(buildStreamTooltipModel(layers, ctx), ctx.tooltipSink),
  };
}

/**
 * Default values for every Advanced-gated stream option, keyed by its
 * `PanelOptions` path. Spread over the stored options in Default editor mode (see
 * `applyStreamEditorModeDefaults`) so a panel with Advanced values configured and
 * then hidden renders exactly like an untouched theme river. The Default-tier
 * `streamLayerSource` and `streamShowLabels` are intentionally absent (they are
 * never hidden). `animation` is included so Default mode restores animation too.
 * Mirrors `ADVANCED_PARALLEL_DEFAULTS`.
 */
export const ADVANCED_STREAM_DEFAULTS: Partial<PanelOptions> = {
  streamLabelMargin: STREAM_LABEL_MARGIN_DEFAULT,
  streamLabelFontSize: STREAM_LABEL_FONT_SIZE_DEFAULT,
  streamBoundaryGap: STREAM_BOUNDARY_GAP_PERCENT_DEFAULT,
  streamFillOpacity: STREAM_FILL_OPACITY_DEFAULT,
  streamBorderWidth: STREAM_BORDER_WIDTH_DEFAULT,
  streamBorderColor: undefined,
  streamEmphasisFocus: STREAM_EMPHASIS_FOCUS_DEFAULT,
  streamBubbleMaxSize: STREAM_BUBBLE_MAX_SIZE_DEFAULT,
  animation: { enabled: STREAM_ANIMATION_ENABLED_DEFAULT },
};

/**
 * Normalize a stream panel's options for rendering by editor mode: Default mode
 * spreads `ADVANCED_STREAM_DEFAULTS` over them so hidden Advanced values don't
 * affect the render; Advanced / API mode passes them through. Registered in the
 * `editorMode.ts` dispatch for the stream family.
 */
export function applyStreamEditorModeDefaults(options: PanelOptions): PanelOptions {
  return applyAdvancedDefaults(options, ADVANCED_STREAM_DEFAULTS);
}
