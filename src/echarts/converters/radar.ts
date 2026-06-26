import { DataFrame } from '@grafana/data';
import { frameToCategorical } from 'echarts/converters/categorical';

/**
 * A single radar axis.
 *
 * `name` is the label drawn at the tip of the axis, and `max` (optional) fixes
 * the outer bound of that axis. When `max` is omitted, ECharts auto-scales the
 * axis from the data, which is why we only set it when we actually have data.
 *
 * See https://echarts.apache.org/en/option.html#radar.indicator
 */
export interface RadarIndicator {
  name: string;
  max?: number;
}

/**
 * A single radar polygon (one closed shape on the chart).
 *
 * `value` is positional: `value[i]` corresponds to `indicator[i]`. A `null`
 * entry leaves a gap on that axis rather than plotting a zero.
 *
 * See https://echarts.apache.org/en/option.html#series-radar.data
 */
export interface RadarPolygon {
  name: string;
  value: Array<number | null>;
}

/**
 * The two data-dependent pieces a radar chart needs: the shared axis definition
 * (`indicator`) and the polygons drawn against it (`data`). The caller merges
 * these into a base radar option.
 */
export interface RadarData {
  indicator: RadarIndicator[];
  data: RadarPolygon[];
}

/**
 * Convert Grafana data frames into the pieces required by an ECharts radar
 * chart.
 *
 * This is a thin adapter over the shared categorical model
 * (see echarts/converters/categorical.ts):
 * - Categories become the radar axes (indicators).
 * - Each categorical series becomes one polygon (its values map positionally to
 *   the indicators).
 * - Each indicator's `max` is the largest value any polygon takes on that axis,
 *   so the outer ring fits the data; left undefined when there is no numeric
 *   data for that axis (ECharts then auto-scales).
 *
 * Inherits the categorical model's trade-offs (single frame, time fields
 * ignored, positional alignment). See https://echarts.apache.org/en/option.html#radar
 *
 * Returns `null` when no usable categorical data can be derived.
 */
export function radarToEChartsOption(series: DataFrame[]): RadarData | null {
  const categorical = frameToCategorical(series);

  if (!categorical) {
    return null;
  }

  const { categories, series: polygonSeries } = categorical;

  const data: RadarPolygon[] = polygonSeries.map((polygon) => ({
    name: polygon.name,
    value: polygon.values,
  }));

  const indicator: RadarIndicator[] = categories.map((name, row) => {
    // Per-axis max = the largest value any polygon takes on this axis. Undefined
    // when no polygon has a numeric value here so ECharts can auto-scale.
    let max: number | undefined = undefined;
    for (const polygon of polygonSeries) {
      const value = polygon.values[row];
      if (value !== null && (max === undefined || value > max)) {
        max = value;
      }
    }

    return max === undefined ? { name } : { name, max };
  });

  return { indicator, data };
}
