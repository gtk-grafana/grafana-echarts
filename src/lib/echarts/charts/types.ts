import { type VizLegendOptions } from '@grafana/schema';
import { type VizLegendItem } from '@grafana/ui';
import { type ValueFormatter } from 'lib/echarts/style';
import { type ECBasicOption } from 'echarts/types/dist/shared';
import { type SeriesType } from 'editor/types';
import { type DataFrame, type GrafanaTheme2 } from '@grafana/data';
import { type PanelOptions } from 'types';

/** Shared chart render context passed to chart modules. */
export interface ChartContext {
  frames: DataFrame[];
  theme: GrafanaTheme2;
  timeZone: string;
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
