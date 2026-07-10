import { type DataFrame, type GrafanaTheme2, type TimeRange, type ValueFormatter } from '@grafana/data';
import { type VizLegendOptions } from '@grafana/schema';
import { type VizLegendItem } from '@grafana/ui';
import {
  type BarSeriesOption,
  type BoxplotSeriesOption,
  type CandlestickSeriesOption,
  type ComposeOption,
  type EffectScatterSeriesOption,
  type HeatmapSeriesOption,
  type PieSeriesOption,
  type ScatterSeriesOption,
} from 'echarts';
import { type LineSeriesOption } from 'echarts/types/src/chart/line/LineSeries';
import { type SeriesType } from 'editor/types';
import { type PanelOptions } from 'types';

/** Shared chart render context passed to chart modules. */
export interface ChartContext<T = SeriesType> {
  frames: DataFrame[];
  theme: GrafanaTheme2;
  timeZone: string;
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

export type EChartHeatmapOption = ComposeOption<HeatmapSeriesOption>;
export type EChartBarSeriesOption = ComposeOption<BarSeriesOption>;
export type EChartLineSeriesOption = ComposeOption<LineSeriesOption>;
export type EChartScatterSeriesOption = ComposeOption<ScatterSeriesOption>;
export type EChartPieSeriesOption = ComposeOption<PieSeriesOption>;
export type EChartCandlestickSeriesOption = ComposeOption<CandlestickSeriesOption>;
export type EChartBoxPlotSeriesOption = ComposeOption<BoxplotSeriesOption>;
export type EChartEffectScatterSeriesOption = ComposeOption<EffectScatterSeriesOption>;

export type EChartMultiValueCartesianSeriesOption = ComposeOption<CandlestickSeriesOption | BoxplotSeriesOption>;
export type EChartCartesianSeriesOption = ComposeOption<BarSeriesOption | HeatmapSeriesOption | LineSeriesOption | CandlestickSeriesOption | ScatterSeriesOption | EffectScatterSeriesOption>
export type EChartBuildOption =
  | EChartHeatmapOption
  | EChartBarSeriesOption
  | EChartLineSeriesOption
  | EChartScatterSeriesOption
  | EChartPieSeriesOption
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
}

// @todo EffectScatterSeriesOption seems to differ from the ScatterSeriesOption which causes some type errors, excluding it for now as I'm leaning towards removing that panel type for now if it keeps acting up
export type CartesianOption = ComposeOption<BarSeriesOption | LineSeriesOption | ScatterSeriesOption>;

/**
 * Multi-value cartesian option (candlestick OHLC / boxplot five-number summary).
 * Kept separate from `CartesianOption` because these series carry several aligned
 * dimensions per x position rather than a single value, and don't share the
 * single-value options (e.g. `stack`).
 */
export type MultiValueCartesianOption = ComposeOption<CandlestickSeriesOption | BoxplotSeriesOption>;
