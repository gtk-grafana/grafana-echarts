import { SortOrder } from '@grafana/schema';
import { ValueFormatter } from 'echarts/style';
import { VizTooltipItem } from 'grafana/VizTooltip';

/** Series families with distinct hover-data shapes, used to pick a mapper. */
export type TooltipKind = 'timeseries' | 'pie' | 'radar' | 'heatmap';

/** ECharts tooltip trigger: cartesian time series share an x axis; pie/radar hover per item. */
export type EChartsTooltipTrigger = 'axis' | 'item';

/**
 * Identifies the ECharts data point a tooltip row was built from, so the panel
 * can resolve the originating Grafana field (for data links) on pin.
 */
export interface TooltipItemRef {
  seriesIndex: number;
  dataIndex: number;
}

/** Content for the Grafana tooltip: header row plus per-series rows. */
export interface TooltipModel {
  header: VizTooltipItem;
  items: VizTooltipItem[];
  refs: TooltipItemRef[];
}

/** Everything the mappers need beyond the raw ECharts hover params. */
export interface TooltipBuildContext {
  kind: TooltipKind;
  valueFormatter: ValueFormatter;
  timeZone: string;
  radarIndicators: string[];
  sort: SortOrder;
  hideZeros: boolean;
  xIsTime: boolean;
}

/** ECharts adds axisValue/axisValueLabel for axis-triggered tooltips. */
export interface EChartsTooltipParam {
  seriesName?: string;
  name: string;
  color?: unknown;
  value: unknown;
  percent?: number;
  dataIndex: number;
  seriesIndex?: number;
  axisValue?: number | string;
  axisValueLabel?: string;
}

/** Viewport-relative cursor anchor (clientX/clientY). */
export interface TooltipAnchor {
  x: number;
  y: number;
}

/** Measured tooltip box size in pixels. */
export interface TooltipSize {
  width: number;
  height: number;
}
