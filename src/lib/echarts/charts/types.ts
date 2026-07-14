import { type DataFrame, type GrafanaTheme2, type TimeRange, type ValueFormatter } from '@grafana/data';
import type { TimeZone, VizLegendOptions } from '@grafana/schema';
import { type VizLegendItem } from '@grafana/ui';
import {
  type BarSeriesOption,
  type BoxplotSeriesOption,
  type CandlestickSeriesOption,
  type ComposeOption,
  type CustomSeriesOption,
  type EffectScatterSeriesOption,
  type GridComponentOption,
  type HeatmapSeriesOption,
  type PieSeriesOption,
  type RadarComponentOption,
  type RadarSeriesOption,
  type ScatterSeriesOption,
  type VisualMapComponentOption,
} from 'echarts';
import { type LineSeriesOption } from 'echarts/types/src/chart/line/LineSeries';
import { type SeriesType } from 'editor/types';
// Imported from the module (not the barrel) to avoid a cycle: the tooltip barrel
// pulls in `option.ts` -> `axes/converters` -> this file.
import { type TooltipValueFormatterResolver } from 'lib/echarts/tooltip/template';
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
}

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
export type EChartPieSeriesOption = ComposeOption<PieSeriesOption>;
// Radar needs both the series and the `radar` coordinate component.
export type EChartRadarSeriesOption = ComposeOption<RadarSeriesOption | RadarComponentOption>;
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
   * item to a field differently (by `seriesIndex` or `dataIndex`).
   */
  getTooltipValueFormatter(ctx: ChartContext): TooltipValueFormatterResolver;
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
