import { type SelectableValue } from '@grafana/data';
import { ANIMATION_ENABLED_DEFAULT } from 'editor/constants';
import {
  type StreamChartType,
  type StreamEmphasisFocus,
  type StreamLayerSource,
  type StreamSeriesType,
} from 'editor/types';
import { type PanelOptions } from 'types';

/**
 * Single-axis stream family editor constants (mirrors `editor/parallel.ts`).
 *
 * The family renders two variants on the ECharts `singleAxis` coordinate system —
 * a theme river and a punch-card bubble timeline — selected by the family-local
 * `streamChartType` rather than the shared `seriesType` (see {@link StreamChartType}
 * for why). See `data-plane/stream.md` and `modules/stream/parity.md`.
 */

/**
 * Series types the stream family routes on. `themeRiver` is the only ECharts series
 * that *requires* `singleAxis` (`ThemeRiverSeriesModel.dependencies`), which is
 * why the family exists as its own panel rather than a cartesian render variant.
 *
 * It stays the family's single routing token even for the bubble variant, which
 * emits `scatter` series: `scatter` is owned by the cartesian family in
 * `resolveChartModule`, so the variant is carried by `streamChartType` instead.
 */
export const streamSeriesTypes: StreamSeriesType[] = ['themeRiver'];

/**
 * Panel option path for the render variant (River / Bubble). Default tier — it
 * picks between two genuinely different readings of the same layers.
 */
export const streamChartTypePath = 'streamChartType';
/** Render-variant options (River / Bubble). */
export const streamChartTypeOptions: Array<SelectableValue<StreamChartType>> = [
  { value: 'river', label: 'River' },
  { value: 'bubble', label: 'Bubble' },
];
/** Default variant: the theme river, the family's reason to exist. */
export const STREAM_CHART_TYPE_DEFAULT: StreamChartType = 'river';

/** Resolve the effective render variant, defaulting unset panels to the river. */
export function resolveStreamChartType(options: Pick<PanelOptions, 'streamChartType'>): StreamChartType {
  return options.streamChartType ?? STREAM_CHART_TYPE_DEFAULT;
}

/** Whether the theme river is selected — gates the ribbon-shaped options. */
export function isStreamRiverSelected(options: PanelOptions): boolean {
  return resolveStreamChartType(options) === 'river';
}

/** Whether the bubble timeline is selected — gates the symbol-size option. */
export function isStreamBubbleSelected(options: PanelOptions): boolean {
  return resolveStreamChartType(options) === 'bubble';
}

/**
 * Editor category for the family's Default-tier chart-shape options ("Layers from"
 * and the layer-label switch). Named "Stream" so future single-axis render types
 * can join it; the Advanced options live in the shared "Advanced" category.
 */
export const streamCategoryName = 'Stream';

/**
 * Panel option path for the layer source (`auto` / `fields` / `labels`); see
 * {@link StreamLayerSource} for what each mode reads.
 *
 * Default tier: the difference between a real stream and one flat ribbon on an
 * ambiguous frame. Auto covers both accepted shapes, so a panel never needs it set
 * to render.
 */
export const streamLayerSourcePath = 'streamLayerSource';
/** Layer-source options (Auto / Fields / Labels). */
export const streamLayerSourceOptions: Array<SelectableValue<StreamLayerSource>> = [
  { value: 'auto', label: 'Auto' },
  { value: 'fields', label: 'Fields' },
  { value: 'labels', label: 'Labels' },
];
/** Default layer source: infer the shape per frame. */
export const STREAM_LAYER_SOURCE_DEFAULT: StreamLayerSource = 'auto';

/**
 * Panel option path for the layer-label switch (ECharts `series.label.show`).
 * Default tier: ECharts draws these labels by default, in black at 11px on the
 * left edge of every ribbon, so the switch is the first thing a user reaches for.
 */
export const streamShowLabelsPath = 'streamShowLabels';
/**
 * Default: labels **off** — deliberately not ECharts' own default.
 * `ThemeRiverSeriesModel.defaultOption` sets `label.show: true`, which overlaps
 * illegibly past a handful of layers and paints in a hardcoded `#000`. The Grafana
 * legend already names every ribbon, so labels opt in.
 */
export const STREAM_SHOW_LABELS_DEFAULT = false;

/**
 * Panel option path for the layer-label offset in px (ECharts
 * `series.label.margin`). Advanced.
 *
 * This is the family's label-*placement* lever, and `label.position` deliberately
 * is not: `ThemeRiverView` calls `polygon.setTextConfig({ position: null })` and
 * then sets the label's `x`/`y` by hand from the ribbon's start
 * (`labelEl.x = textLayout.x - margin`), under its own
 * `// TODO More label position options.`. So `position` is inert in 6.1.0 while
 * `margin` shifts the label horizontally — negative values move it onto the ribbon.
 * https://github.com/apache/echarts/blob/6.1.0/src/chart/themeRiver/ThemeRiverView.ts
 */
export const streamLabelMarginPath = 'streamLabelMargin';
/** Default label offset: `4` px left of the ribbon's start, ECharts' own default. */
export const STREAM_LABEL_MARGIN_DEFAULT = 4;

/** Panel option path for the layer-label font size in px (ECharts `series.label.fontSize`). Advanced. */
export const streamLabelFontSizePath = 'streamLabelFontSize';
/**
 * Default label font size: unset, so the themed label size stands (the plugin
 * styles these labels through `getThemedLabelStyle` rather than ECharts' 11px).
 */
export const STREAM_LABEL_FONT_SIZE_DEFAULT: number | undefined = undefined;

/**
 * Panel option path for the orthogonal ribbon padding as a percentage of the axis'
 * cross extent (ECharts `series.boundaryGap`). Advanced.
 */
export const streamBoundaryGapPath = 'streamBoundaryGap';
/**
 * Default boundary gap, as the percentage the editor takes: `10` — ECharts' own
 * default (`["10%", "10%"]`), so an untouched panel writes no `boundaryGap` key at
 * all. The gap is the orthogonal padding that keeps the river off the top edge and
 * clear of the axis line at the bottom of the single axis' rect; the editor offers
 * one value for both sides.
 * https://echarts.apache.org/en/option.html#series-themeRiver.boundaryGap
 */
export const STREAM_BOUNDARY_GAP_PERCENT_DEFAULT = 10;

/** Panel option path for the ribbon opacity 0–100 (ECharts `series.itemStyle.opacity`). Advanced. */
export const streamFillOpacityPath = 'streamFillOpacity';
/**
 * Default ribbon opacity: unset (ECharts' fully-opaque `itemStyle`), so no
 * `opacity` is written. Unlike parallel's line bundles, overlapping is not the
 * problem here — the ribbons are stacked, not layered — so translucency is a
 * styling choice rather than a legibility fix and opts in.
 */
export const STREAM_FILL_OPACITY_DEFAULT: number | undefined = undefined;

/** Panel option path for the ribbon border width in px (ECharts `series.itemStyle.borderWidth`). Advanced. */
export const streamBorderWidthPath = 'streamBorderWidth';
/** Default ribbon border width: `0` (no border), matching ECharts. */
export const STREAM_BORDER_WIDTH_DEFAULT = 0;
/** Panel option path for the ribbon border color (ECharts `series.itemStyle.borderColor`). Advanced. */
export const streamBorderColorPath = 'streamBorderColor';

/** Panel option path for the hover emphasis focus (ECharts `series.emphasis.focus`). Advanced. */
export const streamEmphasisFocusPath = 'streamEmphasisFocus';
/** Hover emphasis options (None / Self / Series). */
export const streamEmphasisFocusOptions: Array<SelectableValue<StreamEmphasisFocus>> = [
  { value: 'none', label: 'None' },
  { value: 'self', label: 'Self' },
  { value: 'series', label: 'Series' },
];
/** Default emphasis focus: `none`, matching ECharts' own default. */
export const STREAM_EMPHASIS_FOCUS_DEFAULT: StreamEmphasisFocus = 'none';

/**
 * Panel option path for the bubble variant's largest symbol diameter in px
 * (ECharts `series-scatter.symbolSize`). Advanced, bubble only.
 */
export const streamBubbleMaxSizePath = 'streamBubbleMaxSize';
/**
 * Default largest bubble diameter. Sizes are scaled from this by **area** (see
 * `resolveBubbleSymbolSize`), so this is the diameter the layer set's largest value
 * gets; 20px reads at typical Grafana row heights without neighbouring bubbles
 * colliding on an hourly series.
 */
export const STREAM_BUBBLE_MAX_SIZE_DEFAULT = 20;

/**
 * Default animation: off, from the shared `ANIMATION_ENABLED_DEFAULT` — animation
 * is opt-in for every family. See that constant for why, and `docs/performance.md`.
 */
export const STREAM_ANIMATION_ENABLED_DEFAULT = ANIMATION_ENABLED_DEFAULT;
