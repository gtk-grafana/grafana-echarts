import { SortOrder } from '@grafana/schema';
import type { Color } from 'echarts';
import { ValueFormatter } from 'echarts/style';
import { VizTooltipItem } from 'grafana/VizTooltip';

/** Series families with distinct hover-data shapes, used to pick a mapper. */
export type TooltipKind = 'timeseries' | 'pie' | 'radar' | 'heatmap';

/**
 * A single primitive cell value as reported by ECharts hover params, mirroring
 * echarts' internal `OptionDataValue`.
 */
export type EChartsDataValue = string | number | Date | null | undefined;

/** ECharts tooltip trigger: cartesian time series share an x axis; pie/radar hover per item. */
export type EChartsTooltipTrigger = 'axis' | 'item';

/**
 * Identifies the ECharts data point a tooltip row was built from, so the panel
 * can resolve the originating Grafana field (for data links) on pin.
 */
export interface TooltipItemRef {
  seriesIndex: number;
  rowIndex: number;
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

/**
 * Fields ECharts reports on every tooltip param, regardless of series kind.
 * ECharts adds `axisValue`/`axisValueLabel` for axis-triggered tooltips.
 */
export interface TooltipParamBase {
  seriesName?: string;
  name: string;
  /** ECharts `ZRColor`: usually a CSS color string, but may be a gradient/pattern. */
  color?: Color;
  percent?: number;
  rowIndex: number;
  seriesIndex?: number;
  axisValue?: number | string;
  axisValueLabel?: string;
}

/**
 * Raw param as handed to the ECharts tooltip `formatter`. ECharts does not tag
 * params with the series kind, and reports `value` as a scalar (pie) or an array
 * (time series, radar, heatmap), so the boundary keeps the loose value type.
 * Narrow it to a {@link TooltipParam} variant (keyed on {@link TooltipKind})
 * before reading `value`.
 *
 * `value` mirrors the hovered series' raw data item — whatever shape we fed the
 * series (see the per-variant docs below).
 * See https://echarts.apache.org/en/option.html#tooltip.formatter
 */
export interface EChartsTooltipParam extends TooltipParamBase {
  value: EChartsDataValue | EChartsDataValue[];
}

/** Pie slices report a single scalar value. */
export interface PieTooltipParam extends TooltipParamBase {
  kind: 'pie';
  value: EChartsDataValue;
}

/**
 * A hovered time series point, normalized from ECharts' raw `[time, value]` tuple
 * (or bare scalar on a categorical x axis) into a structured shape so the mappers
 * never index tuples positionally.
 *
 * The raw tuple is the cartesian `[x, y]` data item we fed the line/bar series.
 * See https://echarts.apache.org/en/option.html#series-line.data
 */
export interface TimeSeriesPoint {
  /** Hovered timestamp in epoch ms, or null on a categorical x axis. */
  time: number | null;
  /** Numeric y value, or null when missing/non-numeric. */
  numeric: number | null;
}

/**
 * Time series hover param. ECharts reports `value` as a `[time, value]` tuple on a
 * time x axis, or a bare scalar (paired with `axisValueLabel`) on a categorical x
 * axis; both are normalized to a {@link TimeSeriesPoint} at the dispatch boundary.
 */
export interface TimeSeriesTooltipParam extends TooltipParamBase {
  kind: 'timeseries';
  value: TimeSeriesPoint;
}

/**
 * Radar points carry one value per indicator: `value[i]` aligns with the radar's
 * `indicator[i]`, matching the array data item of a radar series.
 * See https://echarts.apache.org/en/option.html#series-radar.data
 */
export interface RadarTooltipParam extends TooltipParamBase {
  kind: 'radar';
  value: EChartsDataValue[];
}

/**
 * Heatmap cells arrive as `[xStart, yStart, xEnd, yEnd, value]` tuples — the
 * encoded data item of our custom heatmap series (two corners + the cell value;
 * see `echarts/options/heatmap.ts`). Cartesian overlay lines on a heatmap chart
 * instead report a plain `[time, value]` tuple, which the mapper also handles.
 * See https://echarts.apache.org/en/option.html#series-custom.encode
 */
export interface HeatmapTooltipParam extends TooltipParamBase {
  kind: 'heatmap';
  value: EChartsDataValue[];
}

/**
 * Kind-tagged view of a hover param, narrowed from {@link EChartsTooltipParam}
 * once the active {@link TooltipKind} is known. The `kind` discriminant lets the
 * mappers read a precise `value` shape without defensive `Array.isArray` checks.
 */
export type TooltipParam = PieTooltipParam | TimeSeriesTooltipParam | RadarTooltipParam | HeatmapTooltipParam;

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
