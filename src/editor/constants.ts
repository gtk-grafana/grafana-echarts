import { DataFrameType, ReducerID, type SelectableValue } from '@grafana/data';
import { type OptionsWithTooltip, SortOrder, TooltipDisplayMode } from '@grafana/schema';
import {
  type CartesianSingleValueSeriesType,
  type CategoricalAxisSeriesType,
  type CategoricalOnlySeriesType,
  type EditorMode,
  type HeatmapSeriesType,
  type HierarchySeriesType,
  type MultiValueSeriesType,
  type PieChartType,
  type PieEmphasisFocus,
  type PieLabel,
  type PieLabelOverflow,
  type PieLabelPosition,
  type PieLegendValue,
  type PieRoseType,
  type PieSelectedMode,
  type SeriesType,
  type SeriesTypeOption,
  type TimeAxisSupportsSeriesType,
} from 'editor/types';

export const seriesTypePath = 'seriesType';

/**
 * Shared editor-mode option: tiers the editor surface (Default / Advanced / API).
 * See `docs/options-modes.md` and `lib/grafana/editor/common/editor-mode.ts`.
 */
export const editorModePath = 'editorMode';
export const editorModeName = 'Editor mode';
/** Default tier for a fresh/unset panel: critical/parity-only options. */
export const EDITOR_MODE_DEFAULT: EditorMode = 'default';
/**
 * Editor-mode radio options. Only Default + Advanced are offered in the UI;
 * `'api'` is intentionally omitted so it's settable only via dashboard JSON.
 */
export const editorModeOptions: Array<SelectableValue<EditorMode>> = [
  { value: 'default', label: 'Default' },
  { value: 'advanced', label: 'Advanced' },
];
/**
 * Stack series option: panel option path and per-field custom config key share
 * the same name. Only meaningful for `bar` series.
 */
export const stackSeriesPath = 'stackSeries';
export const stackSeriesName = 'Stacking';
/**
 * Shared ECharts `stack` group id. Series that share the same `stack` string are
 * stacked together, so all stacked bar series use this single group.
 * https://echarts.apache.org/en/option.html#series-bar.stack
 */
export const STACK_GROUP_ID = 'total';

export const categoricalOnlySeriesType: CategoricalOnlySeriesType[] = ['pie', 'radar'];

/**
 * Series types that support a categorical axis
 */
export const categoricalAxisSeriesTypes: CategoricalAxisSeriesType[] = [
  'line',
  'bar',
  'scatter',
  'effectScatter',
  'boxplot',
];

/**
 * Series types that support a time axis
 */
export const supportsTimeAxisSeriesTypes: TimeAxisSupportsSeriesType[] = [
  'line',
  'bar',
  'scatter',
  'effectScatter',
  'candlestick',
  'heatmap',
  'boxplot',
];
/**
 * Cartesian time series types that render on a time/value grid and consume the
 * converter's `[time, value]` output unchanged (one numeric value per point).
 *
 * Other types (e.g. candlestick, boxplot, heatmap) need multi-value data, and
 * non-cartesian types (e.g. pie, gauge, radar) need different data shaping.
 */
export const cartesianTimeSeriesTypes: CartesianSingleValueSeriesType[] = ['line', 'bar', 'scatter', 'effectScatter'];
/**
 * Multi-value cartesian types: each x position carries several aligned
 * numeric dimensions (candlestick OHLC, boxplot five-number summary) rather than
 * the single value of line/bar. They render on a category axis via the
 * multi-value converter (see echarts/converters/multiValueCartesian.ts) and,
 * unlike the time series types, are not offered as per-field overrides.
 */
export const multiValueSeriesTypes: MultiValueSeriesType[] = ['candlestick', 'boxplot'];
/**
 * Series editor options
 */
export const seriesCategoryName = 'Series';
/**
 * Editor category grouping the heatmap color scale (ECharts `visualMap`)
 * options. Kept distinct from the Grafana DOM "Legend" category, which only
 * governs the cartesian overlay series.
 */
export const heatmapLegendCategoryName = 'Heatmap legend';
/**
 * Radar types, which use a radar coordinate system (indicators + polygons)
 * rather than the cartesian time/value grid. See echarts/converters/radar.ts.
 */
export const radarSeriesTypes: SeriesType[] = ['radar'];
/**
 * Pie (and pie-like) types built from the categorical model. Slices come from
 * Grafana's standard reduce options via `getFieldDisplayValues`; see
 * echarts/converters/pie.ts (`resolvePieSlices`).
 */
export const pieSeriesTypes: SeriesType[] = ['pie'];
/**
 * Default slice reducer, passed to `addStandardDataReduceOptions` as the pie's
 * default `reduceOptions.calcs`. Sum suits a part-to-whole (each slice is a share
 * of the total), unlike Grafana stat/gauge which default to `lastNotNull`.
 */
export const PIE_CALC_DEFAULT: string = ReducerID.sum;
/**
 * Editor category for pie chart-shape options. Named "Pie" (not core's "Pie
 * chart") so future ECharts-specific shape options (rose type, radius, center)
 * can join it.
 */
export const pieTypeCategoryName = 'Pie';
/** Panel option path for the pie chart type (Pie / Donut). Matches core's `pieType`. */
export const pieTypePath = 'pieType';
/** Pie chart type options (Grafana Pie chart "Pie chart type" parity). */
export const pieTypeOptions: Array<SelectableValue<PieChartType>> = [
  { value: 'pie', label: 'Pie' },
  { value: 'donut', label: 'Donut' },
];
/** Default pie chart type: a full pie (matches core Grafana). */
export const PIE_TYPE_DEFAULT: PieChartType = 'pie';
/** Panel option path for the pie rose (Nightingale) type. Maps to ECharts `series.roseType`. */
export const pieRoseTypePath = 'roseType';
/**
 * Pie rose (Nightingale) type options. ECharts-only shape option (no core Pie
 * chart equivalent), so gated behind Advanced editor mode. `'none'` maps to
 * ECharts' `false`; see `getPieRoseType`.
 */
export const pieRoseTypeOptions: Array<SelectableValue<PieRoseType>> = [
  { value: 'none', label: 'None' },
  { value: 'radius', label: 'Radius' },
  { value: 'area', label: 'Area' },
];
/** Default rose type: none (a plain pie, angle-only) — keeps existing renders unchanged. */
export const PIE_ROSE_TYPE_DEFAULT: PieRoseType = 'none';
/** Panel option path for pie slice sorting. Matches core's `sort`. */
export const pieSortPath = 'sort';
/** Pie slice sort options (Grafana Pie chart "Slice sorting" parity). */
export const pieSortOptions: Array<SelectableValue<SortOrder>> = [
  { value: SortOrder.Descending, label: 'Descending' },
  { value: SortOrder.Ascending, label: 'Ascending' },
  { value: SortOrder.None, label: 'None' },
];
/** Default slice sort: descending by value (largest first), matching core Grafana. */
export const PIE_SORT_DEFAULT: SortOrder = SortOrder.Descending;
/**
 * Panel option path for the pie minimum slice angle (ECharts `series.minAngle`,
 * degrees). Advanced-only; keeps tiny long-tail slices visible and clickable.
 */
export const pieMinAnglePath = 'minAngle';
/** Default min slice angle: `0` — ECharts' own default (no minimum). */
export const PIE_MIN_ANGLE_DEFAULT = 0;
/**
 * Panel option path for the pie arc start angle (degrees). Matches ECharts
 * `series.startAngle`. Advanced-only (shares the "Pie" shape category).
 */
export const pieStartAnglePath = 'startAngle';
/**
 * Panel option path for the pie arc end angle (degrees). Matches ECharts
 * `series.endAngle`. Advanced-only (shares the "Pie" shape category).
 */
export const pieEndAnglePath = 'endAngle';
/**
 * Default pie arc start angle (degrees), matching ECharts' own `series.startAngle`
 * default (90 = top). `getPieAngles` omits `startAngle` at this value so the
 * full-pie render stays unchanged.
 * https://echarts.apache.org/en/option.html#series-pie.startAngle
 */
export const PIE_START_ANGLE_DEFAULT = 90;
/**
 * Default tooltip options passed to `commonOptionsBuilder.addTooltipOptions`.
 * The builder only renders the "Hide zeros" switch when `tooltip.hideZeros` is
 * defined here (mirrors core's exported `optsWithHideZeros`), so this is what
 * opts every family into the full common-tooltip control set.
 */
export const TOOLTIP_DEFAULT_OPTIONS: Partial<OptionsWithTooltip> = {
  tooltip: { mode: TooltipDisplayMode.Single, sort: SortOrder.None, hideZeros: false },
};
/**
 * Editor category for pie slice-label options. Named "Labels" (not core's "Pie
 * chart") so future ECharts-specific label options can join it.
 */
export const pieLabelsCategoryName = 'Labels';
/** Panel option path for the pie slice-label content multi-select. */
export const pieLabelsPath = 'displayLabels';
/**
 * Pie slice-label content options (Grafana Pie chart "Labels" parity). Order
 * mirrors core: Percent, Name, Value.
 */
export const pieLabelOptions: Array<SelectableValue<PieLabel>> = [
  { value: 'percent', label: 'Percent' },
  { value: 'name', label: 'Name' },
  { value: 'value', label: 'Value' },
];
/**
 * Default slice labels for a fresh/unset panel: the slice name. Applied both as
 * the editor default and as the render fallback when `displayLabels` is unset.
 * An explicit empty selection (the user deselecting every label) is distinct and
 * hides the labels — see `getPieContentLabel`.
 */
export const PIE_LABELS_DEFAULT: PieLabel = 'name';
/**
 * Editor category for the pie "Legend values" control. Uses the same "Legend"
 * name as `commonOptionsBuilder.addLegendOptions` so the control joins the
 * standard Legend section rather than a separate one.
 */
export const pieLegendCategoryName = 'Legend';
/**
 * Panel option path for the pie legend values multi-select. Nested under
 * `legend` to match core Grafana's pie JSON (`legend.values`).
 */
export const pieLegendValuesPath = 'legend.values';
/** Pie legend value options (Grafana Pie chart "Legend values" parity). */
export const pieLegendValueOptions: Array<SelectableValue<PieLegendValue>> = [
  { value: 'percent', label: 'Percent' },
  { value: 'value', label: 'Value' },
];
/**
 * Default legend values for a fresh/unset panel: none (slice names only),
 * matching the standard legend's empty `calcs` default. The user opts into
 * Percent / Value. See `buildPieLegendItems`.
 */
export const PIE_LEGEND_VALUES_DEFAULT: PieLegendValue[] = [];
/** Panel option path for the pie slice-label placement. */
export const pieLabelPositionPath = 'labelPosition';
/**
 * Pie slice-label placement options. `outside` (ECharts default) draws leader
 * lines; `inside` places labels on the slices (fits dense pies); `center` puts a
 * single readout in the donut hole (a KPI-style value). See `getPieContentLabel`.
 */
export const pieLabelPositionOptions: Array<SelectableValue<PieLabelPosition>> = [
  { value: 'outside', label: 'Outside' },
  { value: 'inside', label: 'Inside' },
  { value: 'center', label: 'Center' },
];
/** Default slice-label placement: outside (leader lines), matching ECharts' own default. */
export const PIE_LABEL_POSITION_DEFAULT: PieLabelPosition = 'outside';

/* Advanced-gated pie legibility options: shown only in the Advanced editor mode,
 * each omitted at its default. See the `pie-legibility.json` demo. */

/**
 * Panel option path for the pie slice-label font size (ECharts `label.fontSize`).
 * Fixed to the theme size today; this overrides it. Advanced-only.
 */
export const pieLabelFontSizePath = 'labelFontSize';
/**
 * Default slice-label font size: `undefined`, so the theme's font size is used
 * and no `fontSize` is written to the ECharts label.
 */
export const PIE_LABEL_FONT_SIZE_DEFAULT: number | undefined = undefined;

/** Panel option path for the pie slice-label overflow handling (ECharts `label.overflow`). */
export const pieLabelOverflowPath = 'labelOverflow';
/** Panel option path for the pie slice-label wrap/clip width (ECharts `label.width`). */
export const pieLabelWidthPath = 'labelWidth';
/**
 * Pie slice-label overflow options (ECharts `label.overflow`): `none` (no
 * handling), `truncate` (ellipsis), `break` (wrap at word), `breakAll` (wrap at
 * any character). `none` is the default and is not written to the label.
 * https://echarts.apache.org/en/option.html#series-pie.label.overflow
 */
export const pieLabelOverflowOptions: Array<SelectableValue<PieLabelOverflow>> = [
  { value: 'none', label: 'None' },
  { value: 'truncate', label: 'Truncate' },
  { value: 'break', label: 'Break (word)' },
  { value: 'breakAll', label: 'Break (any char)' },
];
/** Default slice-label overflow: `none` (no overflow handling), matching today's behavior. */
export const PIE_LABEL_OVERFLOW_DEFAULT: PieLabelOverflow = 'none';

/**
 * Panel option path for the minimum slice angle (degrees) below which the slice
 * label is hidden (ECharts `series.minShowLabelAngle`). Declutters many-slice
 * pies. Advanced-only.
 */
export const pieMinShowLabelAnglePath = 'minShowLabelAngle';
/** Default min angle to show a slice label: `0` (never hidden), not written to the series. */
export const PIE_MIN_SHOW_LABEL_ANGLE_DEFAULT = 0;

/**
 * Panel option path for the slice separation border width (ECharts
 * `itemStyle.borderWidth`). Advanced-only.
 */
export const pieBorderWidthPath = 'sliceBorderWidth';
/**
 * Panel option path for the slice separation border color (ECharts
 * `itemStyle.borderColor`). Advanced-only.
 */
export const pieBorderColorPath = 'sliceBorderColor';
/** Default slice border width: `0` (no separator), so no border keys are written. */
export const PIE_BORDER_WIDTH_DEFAULT = 0;

/**
 * Panel option paths for the custom pie radius/center overrides (percentages).
 * `outerRadius`/`innerRadius` extend `getPieRadius`; `centerX`/`centerY` drive
 * `series.center` via `getPieCenter`. All Advanced-only; unset falls back to the
 * `getPieRadius` defaults (and no `center`).
 */
export const pieOuterRadiusPath = 'outerRadius';
export const pieInnerRadiusPath = 'innerRadius';
export const pieCenterXPath = 'centerX';
export const pieCenterYPath = 'centerY';

/* Advanced pie interactivity & polish options: gated behind the Advanced editor
 * mode; each omits its ECharts key at the default. */

/** Panel option path for the pie slice-selection mode (Advanced). */
export const pieSelectedModePath = 'selectedMode';
/** Panel option path for the selected-slice explode offset in px (Advanced). */
export const pieSelectedOffsetPath = 'selectedOffset';
/** Pie slice-selection mode options (Off / Single / Multiple). */
export const pieSelectedModeOptions: Array<SelectableValue<PieSelectedMode>> = [
  { value: 'off', label: 'Off' },
  { value: 'single', label: 'Single' },
  { value: 'multiple', label: 'Multiple' },
];
/** Default slice-selection mode: off (no selection; ECharts `selectedMode: false`). */
export const PIE_SELECTED_MODE_DEFAULT: PieSelectedMode = 'off';

/** Panel option path for the pie slice corner radius in px (Advanced). */
export const pieBorderRadiusPath = 'sliceBorderRadius';
/** Default slice corner radius: 0 (square corners; omitted). */
export const PIE_BORDER_RADIUS_DEFAULT = 0;

/** Panel option path for the pie hover emphasis focus (Advanced). */
export const pieEmphasisFocusPath = 'emphasisFocus';
/** Panel option path for the pie hover emphasis scale toggle (Advanced). */
export const pieEmphasisScalePath = 'emphasisScale';
/** Pie emphasis focus options (None / Self / Series). */
export const pieEmphasisFocusOptions: Array<SelectableValue<PieEmphasisFocus>> = [
  { value: 'none', label: 'None' },
  { value: 'self', label: 'Self' },
  { value: 'series', label: 'Series' },
];
/** Default emphasis focus: none (ECharts default; omitted). */
export const PIE_EMPHASIS_FOCUS_DEFAULT: PieEmphasisFocus = 'none';

/** Panel option path for the pie slice-label color (Advanced). No default → theme color. */
export const pieLabelColorPath = 'labelColor';

/** Panel option path for the pie zero-sum rendering toggle (Advanced). */
export const pieStillShowZeroSumPath = 'stillShowZeroSum';
/** Panel option path for the pie empty-circle rendering toggle (Advanced). */
export const pieShowEmptyCirclePath = 'showEmptyCircle';
/** Default zero-sum rendering: true (matches ECharts; only `false` is emitted). */
export const PIE_STILL_SHOW_ZERO_SUM_DEFAULT = true;
/** Default empty-circle rendering: true (matches ECharts; only `false` is emitted). */
export const PIE_SHOW_EMPTY_CIRCLE_DEFAULT = true;

/** Panel option path for the pie clockwise slice direction (Advanced). */
export const pieClockwisePath = 'clockwise';
/** Panel option path for the pie avoid-label-overlap toggle (Advanced). */
export const pieAvoidLabelOverlapPath = 'avoidLabelOverlap';
/** Default slice direction: clockwise (matches ECharts; only `false` is emitted). */
export const PIE_CLOCKWISE_DEFAULT = true;
/** Default avoid-label-overlap: true (matches ECharts; only `false` is emitted). */
export const PIE_AVOID_LABEL_OVERLAP_DEFAULT = true;

/**
 * Panel option path for the pie animation toggle (Advanced). Reuses the existing
 * `@internal animation.enabled` shape (see `PanelOptions`), consumed in
 * `buildPanelChartOption`.
 */
export const pieAnimationEnabledPath = 'animation.enabled';
/** Default animation: enabled (matches ECharts). */
export const PIE_ANIMATION_ENABLED_DEFAULT = true;
/** Panel option path for the pie slice-label text-shadow re-enable toggle (Advanced). */
export const pieLabelTextShadowPath = 'labelTextShadow';
/** Panel option path for the pie slice-label text-stroke re-enable toggle (Advanced). */
export const pieLabelTextStrokePath = 'labelTextStroke';
/** Default label text shadow: off (keeps `getPieLabelStyle`'s zeroed style). */
export const PIE_LABEL_TEXT_SHADOW_DEFAULT = false;
/** Default label text stroke: off (keeps `getPieLabelStyle`'s zeroed style). */
export const PIE_LABEL_TEXT_STROKE_DEFAULT = false;

/**
 * Heatmap types. Selecting this panel-level type forces every numeric frame to
 * render as a heatmap (each numeric field becomes a bucket row), even when the
 * frame isn't tagged as a heatmap. Frames already tagged via `meta.type` render
 * as a heatmap regardless of the selected type. See echarts/converters/heatmap.ts.
 */
export const heatmapSeriesTypes: HeatmapSeriesType[] = ['heatmap'];
/**
 * Hierarchy types built from a value-weighted tree: treemap (nested rectangles)
 * and sunburst (radial rings). Both consume the same tree model, reconstructed
 * from a flame-graph nested-set frame or a flat categorical frame. Selecting the
 * hierarchy panel picks between these render variants. See
 * echarts/converters/hierarchy.ts.
 */
export const hierarchySeriesTypes: HierarchySeriesType[] = ['treemap', 'sunburst'];
/**
 * Hierarchy render types offered by the hierarchy family panel, selected per
 * panel via the panel-level `seriesType`.
 */
export const hierarchySeriesTypeOptions: Array<SelectableValue<HierarchySeriesType>> = [
  { value: 'treemap', label: 'Treemap' },
  { value: 'sunburst', label: 'Sunburst' },
];
/**
 * Cartesian render types offered by the cartesian family panel. These are the
 * in-family render variants selected per panel: the single-value time/category
 * types (line/bar/scatter/...) plus the multi-value types (candlestick/boxplot).
 * The cross-family "flat" picker that mixed unrelated families is retired in
 * favor of per-panel Visualization Suggestions (see each module's suggestions.ts).
 */
export const cartesianSeriesTypeOptions: Array<SelectableValue<SeriesType>> = [
  ...cartesianTimeSeriesTypes,
  ...multiValueSeriesTypes,
].map((type) => ({
  value: type,
  label: type,
}));
/**
 * Series types offered as a per-field override (custom field config). Only the
 * single-value cartesian types are listed: they compose on the shared
 * time/value grid, so a field can be drawn as a `bar` while others stay `line`.
 * Multi-value types (candlestick/boxplot) consume several fields at once and
 * cannot be overlaid per field; non-cartesian types (pie/radar) use other
 * coordinate systems; and heatmap is detected from the frame type.
 */
export const cartesianOverrideOptions: Array<SelectableValue<SeriesType>> = [
  ...cartesianTimeSeriesTypes,
  ...multiValueSeriesTypes,
].map((type) => ({
  value: type,
  label: type,
}));
/**
 * Per-field override options for the cartesian family, prefixed with the
 * `'Auto'` default. `'Auto'` is not a real series type: it defers to the
 * panel-level series type (see `resolveFieldSeriesType`). Kept separate from
 * `cartesianOverrideOptions` because the heatmap panel reuses the plain list and
 * has no `'Auto'` default.
 */
export const cartesianOverrideOptionsWithAuto: Array<SelectableValue<SeriesTypeOption>> = [
  { value: 'Auto', label: 'Auto' },
  ...cartesianOverrideOptions,
];
/** Multi-value cartesian render types (candlestick/boxplot) as select options. */
export const multiValueSeriesTypeOptions: Array<SelectableValue<SeriesType>> = multiValueSeriesTypes.map((type) => ({
  value: type,
  label: type,
}));
/**
 * Panel-level series type options for the cartesian family: every render type
 * (single- and multi-value) plus the `'Auto'` default. Used as the static option
 * list for the panel-level picker; the picker narrows this to the applicable
 * subset from the data via `getOptions` (see the cartesian module).
 */
export const cartesianSeriesTypeOptionsWithAuto: Array<SelectableValue<SeriesTypeOption>> = [
  { value: 'Auto', label: 'Auto' },
  ...cartesianSeriesTypeOptions,
];
/** Multi-value cartesian options (candlestick/boxplot) with the `'Auto'` default. */
export const multiValueSeriesTypeOptionsWithAuto: Array<SelectableValue<SeriesTypeOption>> = [
  { value: 'Auto', label: 'Auto' },
  ...multiValueSeriesTypeOptions,
];
/**
 * Grafana dataplane frame types that carry a heatmap. A frame tagged with one
 * of these (`frame.meta.type`) is rendered as the custom-series heatmap cell
 * layer rather than as cartesian series. See echarts/converters/heatmap.ts.
 */
export const heatmapFrameTypes: string[] = [DataFrameType.HeatmapRows, DataFrameType.HeatmapCells];

/**
 * Threshold display control (custom field config `thresholdsStyle.mode`). Grafana
 * standard options already provide the threshold *steps* editor; this select
 * chooses how they are drawn (lines and/or filled regions), mirroring core
 * Grafana's time series "Show thresholds" option. The option list itself comes
 * from `@grafana/ui`'s `graphFieldOptions.thresholdsDisplayModes` (which already
 * omits the out-of-scope per-value `Series` mode); see the cartesian module.
 */
export const thresholdsCategoryName = 'Thresholds';
export const thresholdsStyleModePath = 'thresholdsStyle.mode';
export const thresholdsStyleModeName = 'Show thresholds';
