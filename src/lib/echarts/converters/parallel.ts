import { type DataFrame, type GrafanaTheme2 } from '@grafana/data';
import { frameToCategorical } from 'lib/echarts/converters/categorical';

/**
 * A single parallel-coordinates axis.
 *
 * `name` is the label drawn at the axis. Unlike radar, parallel carries no
 * per-axis `max`: each axis fully auto-scales from its own data range (the caller
 * sets `type: 'value'`), which is the point of parallel coordinates — comparing
 * every dimension on its own independent scale.
 *
 * See https://echarts.apache.org/en/option.html#parallelAxis
 */
export interface ParallelAxis {
  name: string;
}

/**
 * A single parallel-coordinates polyline (one series/line crossing every axis).
 *
 * `value` is positional: `value[i]` corresponds to `axes[i]` (dimension `i`). A
 * `null` entry leaves a gap on that axis rather than plotting a zero.
 *
 * `lineStyle.color` is resolved from the field's standard Color scheme config so
 * each line matches Grafana. Parallel colors the line through its data item's
 * `lineStyle` (where radar colors the polygon through `itemStyle`).
 *
 * See https://echarts.apache.org/en/option.html#series-parallel.data
 */
export interface ParallelLine {
  name: string;
  value: Array<number | null>;
  lineStyle: { color: string };
}

/**
 * The two data-dependent pieces a parallel-coordinates chart needs: the axis
 * definitions (`axes`) and the polylines drawn against them (`data`). The caller
 * merges these into a base parallel option, adding each axis's positional `dim`
 * and value `type`.
 */
export interface ParallelData {
  axes: ParallelAxis[];
  data: ParallelLine[];
}

/**
 * Convert Grafana data frames into the pieces required by an ECharts parallel
 * coordinates chart.
 *
 * A thin adapter over the shared categorical model (see
 * echarts/converters/categorical.ts), structurally identical to
 * `radarToEChartsOption` so the multivariate family can toggle radar↔parallel
 * over the *same* frames without re-mapping the data:
 * - Categories become the parallel axes.
 * - Each numeric field becomes one polyline (its values map positionally to the
 *   axes).
 *
 * Unlike radar, no per-axis `max` is derived — each parallel axis auto-scales.
 *
 * Inherits the categorical model's trade-offs (single frame, time fields ignored,
 * positional alignment). See https://echarts.apache.org/en/option.html#series-parallel
 *
 * Returns `null` when no usable categorical data can be derived.
 */
export function parallelToEChartsOption(series: DataFrame[], theme: GrafanaTheme2): ParallelData | null {
  const categorical = frameToCategorical(series, theme);

  if (!categorical) {
    return null;
  }

  const { categories, series: lineSeries } = categorical;

  const data: ParallelLine[] = lineSeries.map((line) => ({
    name: line.name,
    value: line.values,
    lineStyle: { color: line.color },
  }));

  const axes: ParallelAxis[] = categories.map((name) => ({ name }));

  return { axes, data };
}
