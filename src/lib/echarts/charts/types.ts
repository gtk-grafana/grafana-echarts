import { type DataFrame, type GrafanaTheme2, type TimeRange, type ValueFormatter } from '@grafana/data';
import { type VizLegendOptions } from '@grafana/schema';
import { type VizLegendItem } from '@grafana/ui';
import { type BarSeriesOption, type ComposeOption, type ScatterSeriesOption } from 'echarts';
import { type ECBasicOption } from 'echarts/types/dist/shared';
import { type LineSeriesOption } from 'echarts/types/src/chart/line/LineSeries';
import { type SeriesType } from 'editor/types';
import { type PanelOptions } from 'types';

/** Shared chart render context passed to chart modules. */
export interface ChartContext {
  frames: DataFrame[];
  theme: GrafanaTheme2;
  timeZone: string;
  timeRange: TimeRange;
  options: PanelOptions;
  seriesType: SeriesType;
  formatValue: ValueFormatter;
}

/** Parts of the render pipeline supplied by the panel before chart-specific merge. */
export interface BaseOptionParts {
  /** True when the panel renders a Grafana DOM legend instead of ECharts' native legend. */
  isGrafanaLegend: boolean;
}

/** Self-contained chart family: option building, legend, and tooltip metadata. */
export interface ChartModule {
  /** Per-chart default legend options; merged under the user's `options.legend`. */
  legend: VizLegendOptions;
  buildOption(ctx: ChartContext, base: BaseOptionParts): ECBasicOption | null;
  buildLegendItems?(ctx: ChartContext, calcs: string[]): VizLegendItem[];
}

// @todo EffectScatterSeriesOption seems to differ from the ScatterSeriesOption which causes some type errors, excluding it for now as I'm leaning towards removing that panel type for now if it keeps acting up
export type CartesianOption = ComposeOption<
  BarSeriesOption | LineSeriesOption | ScatterSeriesOption
>;
