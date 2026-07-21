import { type SelectableValue } from '@grafana/data';
import {
  type CartesianShowValues,
  type CartesianSingleValueSeriesType,
  type CartesianValueLabelPosition,
  type MultiValueSeriesType,
  type SeriesType,
  type SeriesTypeOption,
} from 'editor/types';

/**
 * Cartesian-family editor constants. Moved out of the shared `editor/constants.ts`
 * so each family's option paths, series-type lists, and defaults live beside the
 * family they configure (mirrors `editor/pie.ts`). The panel-level `seriesType`
 * path and the cross-family narrowing lists stay shared in `editor/constants.ts`.
 */

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

/* --- Categorical multi-axis parity uplift: value labels + geometry/style ------
 * Curated Bar-chart-parity / ECharts options grouped Default (value labels) vs
 * Advanced (position, geometry, stroke). Each render helper (see
 * `options/cartesian.ts`) omits its ECharts key at the default so untouched
 * panels render identically. */

/**
 * Editor category for the cartesian "Value labels" control. Its Default-tier
 * `showValues` toggle sits here (always visible); the Advanced position select
 * joins the single "Advanced" category via the shared `addAdvanced*` helpers.
 */
export const cartesianValueLabelsCategoryName = 'Value labels';
/** Panel option path for the "Show values" mode (Auto / Always / Never). Default tier. */
export const showValuesPath = 'showValues';
export const showValuesName = 'Show values';
/** "Show values" options (core Bar chart parity). */
export const showValuesOptions: Array<SelectableValue<CartesianShowValues>> = [
  { value: 'auto', label: 'Auto' },
  { value: 'always', label: 'Always' },
  { value: 'never', label: 'Never' },
];
/**
 * Default "Show values" mode: `auto`, which currently resolves to hidden — so a
 * fresh panel (and every existing one) renders no value labels, unchanged. See
 * `getCartesianValueLabel`.
 */
export const CARTESIAN_SHOW_VALUES_DEFAULT: CartesianShowValues = 'auto';

/** Panel option path for the value-label placement (ECharts `label.position`). Advanced. */
export const valueLabelPositionPath = 'valueLabelPosition';
/** Value-label placement options (ECharts `series.label.position` subset). */
export const valueLabelPositionOptions: Array<SelectableValue<CartesianValueLabelPosition>> = [
  { value: 'top', label: 'Top' },
  { value: 'inside', label: 'Inside' },
  { value: 'bottom', label: 'Bottom' },
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
];
/** Default value-label placement: `top` (above the point/bar), matching ECharts. */
export const CARTESIAN_VALUE_LABEL_POSITION_DEFAULT: CartesianValueLabelPosition = 'top';

/**
 * Panel option path for the bar width as a percentage of the category band
 * (ECharts `series.barWidth`). Advanced-only; only affects `bar` series. Unset
 * uses ECharts' auto width. See `getBarWidth`.
 */
export const barWidthPath = 'barWidth';
/** Default bar width: unset (ECharts auto), so no `barWidth` is written. */
export const CARTESIAN_BAR_WIDTH_DEFAULT: number | undefined = undefined;

/**
 * Panel option path for the bar corner radius in px (ECharts
 * `itemStyle.borderRadius`). Advanced-only; `bar` series. `0` (square) omits the
 * key. See `getBarRadius` / `getCartesianItemStyle`.
 */
export const barRadiusPath = 'barRadius';
/** Default bar corner radius: 0 (square corners; omitted). */
export const CARTESIAN_BAR_RADIUS_DEFAULT = 0;

/**
 * Panel option path for the line width in px (ECharts `lineStyle.width`).
 * Advanced-only; `line` series. Unset uses ECharts' default. See `getCartesianLineStyle`.
 */
export const lineWidthPath = 'lineWidth';
/** Default line width: unset (ECharts default, 2px), so no `width` is written. */
export const CARTESIAN_LINE_WIDTH_DEFAULT: number | undefined = undefined;

/**
 * Panel option path for the line fill opacity 0–100 (ECharts `areaStyle.opacity`;
 * a non-zero value turns a line into an area chart). Advanced-only; `line`
 * series. `0` omits the area fill. See `getCartesianAreaStyle`.
 */
export const fillOpacityPath = 'fillOpacity';
/** Default fill opacity: 0 (no area fill; a plain line). */
export const CARTESIAN_FILL_OPACITY_DEFAULT = 0;

/**
 * Panel option path for the point (symbol) size in px (ECharts `symbolSize`);
 * `0` hides the points (`showSymbol: false`). Advanced-only; line/scatter
 * series. Unset uses ECharts' default symbol. See `getCartesianSymbol`.
 */
export const pointSizePath = 'pointSize';
/** Default point size: unset (ECharts default symbol), so nothing is written. */
export const CARTESIAN_POINT_SIZE_DEFAULT: number | undefined = undefined;

/**
 * Panel option path for the x-axis tick label rotation in degrees (ECharts
 * `xAxis.axisLabel.rotate`). Advanced-only. `0` omits the key. See `getXTickRotate`.
 */
export const xTickRotatePath = 'xTickRotate';
/** Default x tick rotation: 0 (horizontal labels; omitted). */
export const CARTESIAN_X_TICK_ROTATE_DEFAULT = 0;

/** Default animation state: enabled (matches ECharts). Reset in Default editor mode. */
export const CARTESIAN_ANIMATION_ENABLED_DEFAULT = true;
