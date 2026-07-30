import {
  type DataFrame,
  type FieldConfigSource,
  type GrafanaTheme2,
  type InterpolateFunction,
  type TimeRange,
  type ValueFormatter,
} from '@grafana/data';
import type { TimeZone, VizLegendOptions } from '@grafana/schema';
import { type VizLegendItem } from '@grafana/ui';
import {
  type BarSeriesOption,
  type BoxplotSeriesOption,
  type CandlestickSeriesOption,
  type ChordSeriesOption,
  type ComposeOption,
  type CustomSeriesOption,
  type EffectScatterSeriesOption,
  type FunnelSeriesOption,
  type GraphSeriesOption,
  type GridComponentOption,
  type HeatmapSeriesOption,
  type LegendComponentOption,
  type ParallelComponentOption,
  type ParallelSeriesOption,
  type PieSeriesOption,
  type RadarComponentOption,
  type RadarSeriesOption,
  type SankeySeriesOption,
  type ScatterSeriesOption,
  type SunburstSeriesOption,
  type ThemeRiverSeriesOption,
  type TitleComponentOption,
  type TreemapSeriesOption,
  type VisualMapComponentOption,
} from 'echarts';
// `SingleAxisOption` (the singleAxis coordinate component the stream family
// renders on) is declared in ECharts' shared types but not re-exported from the
// `echarts` barrel, so it is imported from there directly (as `ECBasicOption` and
// `TooltipOption` are elsewhere in this codebase).
import { type SingleAxisOption } from 'echarts/types/dist/shared';
import { type LineSeriesOption } from 'echarts/types/src/chart/line/LineSeries';
import { type SeriesType } from 'editor/types';
import {
  type TooltipFieldResolver,
  type TooltipSink,
  type TooltipValueFormatterResolver,
} from 'lib/echarts/tooltip/types';
import { type PanelOptions } from 'types';

/** Shared chart render context passed to chart modules. */
export interface ChartContext<T = SeriesType> {
  frames: DataFrame[];
  theme: GrafanaTheme2;
  timeZone: TimeZone;
  timeRange: TimeRange;
  options: PanelOptions;
  seriesType: T;
  formatValue: ValueFormatter;
  // The panel's field config (defaults + overrides). Row/series families
  // (pie slices, candlestick/boxplot) read legend color/visibility overrides
  // from here by name, since they do not map to Grafana fields.
  fieldConfig: FieldConfigSource;
  // The panel's variable interpolation function (from `PanelProps`). Required by
  // Grafana's `getFieldDisplayValues`, which the pie resolver uses to reduce
  // slices and to interpolate field display-name templates.
  replaceVariables: InterpolateFunction;
  // Receives the hovered tooltip content model so the React overlay
  // (`EChartsTooltip`) can render it. Injected by `buildPanelChartOption` from
  // the value the `EChart` component supplies; optional so chart modules can be
  // built without a React sink in unit tests (formatters fall back to a no-op).
  tooltipSink?: TooltipSink;
}

export type HierarchyChartContext = ChartContext<'sunburst' | 'treemap'>;
/** Relations family context, narrowed to the render types the family hosts. */
export type RelationsChartContext = ChartContext<'graph' | 'sankey' | 'chord'>;

export type StreamChartContext = ChartContext<'themeRiver'>;

/** Parts of the render pipeline supplied by the panel before chart-specific merge. */
export interface BaseOptionParts {
  /** True when the panel renders a Grafana DOM legend instead of ECharts' native legend. */
  isGrafanaLegend: boolean;
}

/**
 * The composite option the binned heatmap panel builds: the custom-series cell
 * layer plus the cartesian overlay series, and the `grid`/`visualMap` components
 * it configures. `GridComponentOption` also pulls in the typed `xAxis`/`yAxis`
 * dependencies. The cell layer is a `custom` series (interval rectangles on
 * continuous axes), not the native `heatmap` series.
 */
export type EChartBinnedHeatmapOption = ComposeOption<
  | CustomSeriesOption
  | BarSeriesOption
  | LineSeriesOption
  | CandlestickSeriesOption
  | ScatterSeriesOption
  | EffectScatterSeriesOption
  | GridComponentOption
  | VisualMapComponentOption
>;
/**
 * The option the matrix heatmap panel builds: the native ECharts `heatmap`
 * series (a category x category tile grid) plus the `grid` and `visualMap`
 * components it configures. Unlike the binned layout (a `custom` series on
 * continuous axes), matrix uses the native heatmap series on two category axes.
 */
export type EChartMatrixHeatmapOption = ComposeOption<
  HeatmapSeriesOption | GridComponentOption | VisualMapComponentOption
>;
export type EChartBarSeriesOption = ComposeOption<BarSeriesOption>;
export type EChartLineSeriesOption = ComposeOption<LineSeriesOption>;
export type EChartScatterSeriesOption = ComposeOption<ScatterSeriesOption>;
// Pie can add a centered `title` (the donut-center readout when label position
// is `center`), so the compose option pulls in the title component too.
export type EChartPieSeriesOption = ComposeOption<PieSeriesOption | TitleComponentOption>;
// Radar needs both the series and the `radar` coordinate component.
export type EChartRadarSeriesOption = ComposeOption<RadarSeriesOption | RadarComponentOption>;
// The parallel-coordinates axis option, derived from the component's
// `parallelAxisDefault` (ECharts does not export `ParallelAxisOption` from the
// barrel).
type ParallelAxisOption = NonNullable<ParallelComponentOption['parallelAxisDefault']>;
// Parallel coordinates composes the parallel series and the `legend` component
// (like radar, the module sets a `legend`; unlike radar, the parallel series does
// not declare a legend dependency, so it is composed in explicitly). The
// `parallel` coordinate component and its `parallelAxis` array are added by hand
// rather than through `ComposeOption`'s dependency mechanism: `ParallelAxisOption`
// lacks a `mainType: 'parallelAxis'` literal, so composing the `parallel`
// component (whose `mainType` *is* a `ComposeOption` dependency key) makes
// `GetDependency` synthesize a `{ [key: string]: ParallelAxisOption }` index
// signature that then conflicts with every other key. See ECharts' `GetDependency`.
export type EChartParallelSeriesOption = ComposeOption<ParallelSeriesOption | LegendComponentOption> & {
  parallel?: ParallelComponentOption | ParallelComponentOption[];
  parallelAxis?: ParallelAxisOption | ParallelAxisOption[];
};
// Funnel is the part-to-whole family's second render variant; it shares the pie
// slice model but lays out stacked trapezoids (no radial coordinate component).
export type EChartFunnelSeriesOption = ComposeOption<FunnelSeriesOption>;
// Hierarchy families render a value-weighted tree; no cartesian axis component.
export type EChartTreemapSeriesOption = ComposeOption<TreemapSeriesOption>;
export type EChartSunburstSeriesOption = ComposeOption<SunburstSeriesOption>;
// Relations (graph) renders nodes plus links. The `graph` series ships its own
// `View` coordinate system, so no coordinate component is composed in.
export type EChartGraphSeriesOption = ComposeOption<GraphSeriesOption>;
// Relations (sankey) lays the same node/link model out as weighted flow ribbons.
// Composes the `title` component too: a sankey may carry a bottom-left note
// reporting links removed by the cycle policy (see `getSankeyDroppedNote`).
export type EChartSankeySeriesOption = ComposeOption<SankeySeriesOption | TitleComponentOption>;
// Relations (chord) lays the same node/link model out as a ring of arcs joined by
// ribbons. Self-contained: it pins `coordinateSystem: 'none'`, so nothing is composed in.
export type EChartChordSeriesOption = ComposeOption<ChordSeriesOption>;
/**
 * The stream family's option: the themeRiver series plus the `singleAxis`
 * coordinate component it is laid out on. Like the parallel option above, the
 * coordinate component is added by hand rather than through `ComposeOption`'s
 * dependency mechanism — `SingleAxisOption` carries no `mainType: 'singleAxis'`
 * literal for `GetDependency` to key on.
 */
export type EChartStreamSeriesOption = ComposeOption<ThemeRiverSeriesOption> & {
  singleAxis?: SingleAxisOption | SingleAxisOption[];
};
/**
 * @todo revisit
 * A single pie slice data item. ECharts types a pie series' `data` as
 * `(number | '-' | number[] | PieDataItemOption)[]`; we exclude the primitive
 * and array forms to keep the object item type (with `name`, `value`, etc.).
 */
export type EChartPieDataItem = Exclude<NonNullable<PieSeriesOption['data']>[number], number | string | unknown[]>;
// export type EChartPieDataItem = Array<OptionDataValueNumeric | OptionDataValueNumeric[] | PieDataItemOption>;
export type EChartCandlestickSeriesOption = ComposeOption<CandlestickSeriesOption>;
export type EChartBoxPlotSeriesOption = ComposeOption<BoxplotSeriesOption>;
export type EChartEffectScatterSeriesOption = ComposeOption<EffectScatterSeriesOption>;

export type EChartMultiValueCartesianSeriesOption = ComposeOption<CandlestickSeriesOption | BoxplotSeriesOption>;
export type EChartCartesianSeriesOption = ComposeOption<
  BarSeriesOption | LineSeriesOption | CandlestickSeriesOption | ScatterSeriesOption | EffectScatterSeriesOption
>;

// A single cartesian series entry narrowed to the single-series union so arrays assign to a `series` field.
export type EChartSingleValueCartesianSeries = Exclude<NonNullable<EChartCartesianSeriesOption['series']>, unknown[]>;
export type EChartBuildOption =
  | EChartBinnedHeatmapOption
  | EChartMatrixHeatmapOption
  | EChartBarSeriesOption
  | EChartLineSeriesOption
  | EChartScatterSeriesOption
  | EChartPieSeriesOption
  | EChartRadarSeriesOption
  | EChartParallelSeriesOption
  | EChartFunnelSeriesOption
  | EChartTreemapSeriesOption
  | EChartSunburstSeriesOption
  | EChartGraphSeriesOption
  | EChartSankeySeriesOption
  | EChartChordSeriesOption
  | EChartStreamSeriesOption
  | EChartCandlestickSeriesOption
  | EChartBoxPlotSeriesOption
  | EChartEffectScatterSeriesOption
  | EChartCartesianSeriesOption
  | EChartMultiValueCartesianSeriesOption;

/** Self-contained chart family: option building, legend, and tooltip metadata. */
export interface ChartModule {
  /** Per-chart default legend options; merged under the user's `options.legend`. */
  legend: VizLegendOptions;
  // @todo replace null with reason why chart cannot render?
  buildOption(ctx: ChartContext, base: BaseOptionParts): EChartBuildOption | null;
  buildLegendItems(ctx: ChartContext, calcs: string[]): VizLegendItem[];
  /**
   * Resolve the value formatter for a hovered tooltip item so each series
   * formats with its own field's unit/decimals overrides. Chart families map the
   * item to a field differently (by `seriesIndex` or `dataIndex`). Optional:
   * families whose items all share the panel formatter omit it and
   * `buildPanelTooltip` falls back to `ctx.formatValue`.
   */
  getTooltipValueFormatter?(ctx: ChartContext): TooltipValueFormatterResolver;
  /**
   * Resolve the source `Field` + row index for a hovered tooltip item, so the
   * tooltip footer can surface that field's data links and label-based ad-hoc
   * filters. Optional: families whose items have no clean field mapping
   * (multi-value cartesian, heatmap cells, hierarchy nodes) omit it and render no
   * footer.
   */
  getTooltipFieldResolver?(ctx: ChartContext): TooltipFieldResolver;
  /**
   * Labels for the dimensions a multi-value series packs into one item, so the
   * tooltip lists them all instead of just the last. Only families that draw
   * several values per x (candlestick, boxplot) implement this; see
   * {@link TooltipModelOptions.multiValueDimensions}.
   */
  getTooltipDimensions?(ctx: ChartContext): string[] | undefined;
  /**
   * The family has no meaningful "All" tooltip, so a persisted
   * `tooltip.mode: multi` is clamped back to Single when building the option.
   * Its editor should also pass `singleOnly` to `addTooltipOptions`; this covers
   * dashboards saved before the option was withdrawn.
   *
   * Only radar sets this today. Hierarchy's editor passes `singleOnly` (see
   * `modules/hierarchy/module.tsx`) but `hierarchyChartModule` does not set this,
   * so a dashboard saved with `multi` still builds an axis trigger there. Left
   * alone deliberately: setting it would change what those saved dashboards
   * render.
   */
  singleTooltipOnly?: boolean;
  /**
   * The family renders on a time axis but cannot host the drag-to-zoom brush, so
   * `buildPanelChartOption` omits the `brush` component even though the axis type
   * is `time`. Set by the stream family: `BrushComponent` attaches to a cartesian
   * `grid`, and a `singleAxis` chart has none, so the cursor would arm a drag that
   * never resolves to a time range.
   */
  disableTimeBrush?: boolean;
}

export type CartesianOption = ComposeOption<
  BarSeriesOption | LineSeriesOption | ScatterSeriesOption | EffectScatterSeriesOption
>;

/**
 * Multi-value cartesian option (candlestick OHLC / boxplot five-number summary).
 * Kept separate from `CartesianOption` because these series carry several aligned
 * dimensions per x position rather than a single value, and don't share the
 * single-value options (e.g. `stack`).
 */
export type MultiValueCartesianOption = ComposeOption<CandlestickSeriesOption | BoxplotSeriesOption>;
