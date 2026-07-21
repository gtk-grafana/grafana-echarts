import { DataFrameType, type SelectableValue } from '@grafana/data';
import { type OptionsWithTooltip, SortOrder, TooltipDisplayMode } from '@grafana/schema';
import {
  type CategoricalAxisSeriesType,
  type CategoricalOnlySeriesType,
  type EditorMode,
  type HeatmapSeriesType,
  type HierarchySeriesType,
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
 * Grafana dataplane frame types that carry a heatmap. A frame tagged with one
 * of these (`frame.meta.type`) is rendered as the custom-series heatmap cell
 * layer rather than as cartesian series. See echarts/converters/heatmap.ts.
 */
export const heatmapFrameTypes: string[] = [DataFrameType.HeatmapRows, DataFrameType.HeatmapCells];
