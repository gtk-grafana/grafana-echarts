import { VizLegendItem } from '@grafana/ui';
import { TooltipLinkResolver } from 'echarts/data/links';
import { ValueFormatter } from 'echarts/style';
import { TooltipKind } from 'echarts/tooltip';
import { ECBasicOption } from 'echarts/types/dist/shared';
import { SeriesType } from 'editor/types';
import { DataFrame, GrafanaTheme2 } from '@grafana/data';
import { PanelOptions } from 'types';

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
  tableLegend: boolean;
}

/** Tooltip extras computed from chart data (radar indicators, heatmap X axis type). */
export interface TooltipExtras {
  radarIndicators: string[];
  xIsTime: boolean;
  syncEnabled: boolean;
}

/** Self-contained chart family: option building, legend, links, and tooltip metadata. */
export interface ChartModule {
  tooltipKind: TooltipKind;
  supportsTableLegend?: boolean;
  buildOption(ctx: ChartContext, base: BaseOptionParts): ECBasicOption | null;
  buildLegendItems?(ctx: ChartContext, calcs: string[]): VizLegendItem[];
  resolveLinks?(ctx: ChartContext): TooltipLinkResolver;
  getTooltipExtras?(ctx: ChartContext): TooltipExtras;
}
