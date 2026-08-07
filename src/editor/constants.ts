import { DataFrameType, type SelectableValue } from '@grafana/data';
import { type OptionsWithTooltip, SortOrder, TooltipDisplayMode } from '@grafana/schema';
import {
  type CategoricalAxisSeriesType,
  type CategoricalOnlySeriesType,
  type EditorMode,
  type HeatmapSeriesType,
  type HierarchySeriesType,
  type PerformanceMode,
  type RelationsSeriesType,
  type TimeAxisSupportsSeriesType,
} from 'editor/types';

/**
 * Shared, cross-family editor constants. Family-specific option paths and
 * series-type lists live in the per-family files (`editor/pie.ts`,
 * `editor/cartesian.ts`, `editor/radar.ts`); this file keeps the panel-level
 * `seriesType` path, the editor-mode tier, and the cross-family narrowing lists.
 */

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
 * Single category every Advanced-gated option lives under, so the Advanced tier
 * adds one clearly-labelled section rather than scattering ECharts-only controls
 * through the core-parity categories. Baked into the `addAdvanced*` helpers (see
 * `lib/grafana/editor/common/advanced-options.ts`).
 */
export const advancedOptionsCategoryName = 'Advanced';

export const categoricalOnlySeriesType: CategoricalOnlySeriesType[] = ['pie', 'radar', 'funnel'];

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
 * Default tooltip options passed to `commonOptionsBuilder.addTooltipOptions`.
 * The builder only renders the "Hide zeros" switch when `tooltip.hideZeros` is
 * defined here (mirrors core's exported `optsWithHideZeros`), so this is what
 * opts every family into the full common-tooltip control set.
 */
export const TOOLTIP_DEFAULT_OPTIONS: Partial<OptionsWithTooltip> = {
  tooltip: { mode: TooltipDisplayMode.Single, sort: SortOrder.None, hideZeros: false },
};

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
 * Relations types: nodes plus the links between them, built from the field-based graph
 * contract. All three ECharts series consume the identical node/link input, so they are
 * render variants of one family rather than separate panels. See
 * echarts/converters/graphWide.ts.
 */
export const relationsSeriesTypes: RelationsSeriesType[] = ['graph', 'sankey', 'chord'];
/**
 * Relations render types offered by the relations family panel, selected per panel
 * via the panel-level `seriesType`. `graph` draws an arbitrary topology; `sankey`
 * lays the same nodes and links out as weighted flow ribbons, which requires an
 * acyclic edge set (broken automatically — see `converters/dag.ts`); `chord` draws a
 * ring of arcs joined by ribbons, and accepts cycles directly.
 */
export const relationsSeriesTypeOptions: Array<SelectableValue<RelationsSeriesType>> = [
  { value: 'graph', label: 'Graph' },
  { value: 'sankey', label: 'Sankey' },
  { value: 'chord', label: 'Chord' },
];
/** Editor category holding the relations family's Default-tier options. */
export const relationsCategoryName = 'Relations';
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

// Performance options (Advanced, cartesian). ECharts' per-point levers (point
// markers off / LTTB downsampling) are auto-tuned by density so dense charts take
// the fast path while small charts are visually unchanged; these controls let
// power users override the auto behavior. Resolvers live in
// `lib/echarts/performance/resolvers.ts` and the thresholds in
// `lib/echarts/performance/constants.ts`; the editor fragment is
// `lib/grafana/editor/common/performance-options.ts`.

/** Tri-state choices (Auto / Always / Never) for a performance override radio. */
export const performanceModeOptions: Array<SelectableValue<PerformanceMode>> = [
  { value: 'auto', label: 'Auto' },
  { value: 'always', label: 'Always' },
  { value: 'never', label: 'Never' },
];

export const performanceShowPointsPath = 'performance.showPoints';
export const performanceShowPointsName = 'Show points';
/** Default point-marker visibility: auto (hide symbols above the total-points threshold). */
export const PERFORMANCE_SHOW_POINTS_DEFAULT: PerformanceMode = 'auto';

export const performanceDownsamplingPath = 'performance.downsampling';
export const performanceDownsamplingName = 'Downsampling (LTTB)';
/** Default LTTB downsampling: on (sample dense series toward pixel resolution). */
export const PERFORMANCE_DOWNSAMPLING_DEFAULT = true;

/**
 * Shared animation toggle, offered as an opt-in Advanced switch by every family
 * that exposes it (cartesian here, part-to-whole via `pieAnimationEnabledPath`).
 *
 * **Off by default, for every panel.** Density thresholds were tried first and
 * could not work: a panel cannot know a response is dense until it has it, and
 * any threshold leaves a band below it that still animates on an already-heavy
 * chart (growing 10 -> 40 series animates, and Grafana re-renders with the
 * previous data while a query is in flight). Off is also closer to core Grafana,
 * whose viz panels do not animate at all. See `docs/performance.md`.
 */
export const animationEnabledPath = 'animation.enabled';
export const animationName = 'Animation';
export const ANIMATION_ENABLED_DEFAULT = false;

/**
 * The relations family's animation default: **on**, and a Default-tier control rather
 * than an Advanced one.
 *
 * The reasoning above is about *density*, and a relations panel is not dense in the way
 * that argument is about: a mark is a whole field here, so a graph is tens of marks
 * where a cartesian panel is tens of thousands of points. What the animation buys is
 * also worth more — arcs and ribbons growing into place on load is how a chord or
 * sankey reads as one connected flow rather than a static picture.
 *
 * The force graph's *jiggle* is a separate thing entirely and stays off: that is
 * `force.layoutAnimation`, which draws every simulation step and is unaffected by this.
 * See `RELATIONS_LAYOUT_ANIMATION_DEFAULT`.
 */
export const RELATIONS_ANIMATION_ENABLED_DEFAULT = true;
