import { type DataFrame, type GrafanaTheme2 } from '@grafana/data';
import { STACK_GROUP_ID } from 'editor/constants';
import { frameToCategorical } from 'lib/echarts/converters/categorical';
import { type SeriesType } from 'editor/types';

/**
 * One ECharts cartesian series drawn against a shared category x-axis.
 *
 * Unlike the time-series shape (`[time, value]` tuples), `data` is a positional
 * array of plain y-values: `data[i]` belongs to `categories[i]` on the x-axis
 * (`null` renders a gap rather than a zero).
 *
 * See https://echarts.apache.org/en/option.html#series-bar.data
 */
export interface CategoryCartesianSeries {
  name: string;
  type: SeriesType;
  data: Array<number | null>;
  itemStyle: { color: string };
  lineStyle: { color: string };
  /**
   * ECharts stack group id. Bar series sharing the same value are stacked; unset
   * for unstacked or non-bar series.
   * https://echarts.apache.org/en/option.html#series-bar.stack
   */
  stack?: string;
}

/**
 * The two data-dependent pieces a category-axis cartesian chart needs: the
 * shared `categories` (x-axis labels) and one `series` per numeric field. The
 * caller merges these into a base cartesian option with `xAxis.type: 'category'`.
 */
export interface CategoryCartesianData {
  categories: string[];
  series: CategoryCartesianSeries[];
}

/**
 * Convert Grafana Numeric frames into an ECharts category-axis cartesian chart
 * (Group 2: category bar/line).
 *
 * This is a thin adapter over the shared categorical model
 * (see echarts/converters/categorical.ts):
 * - The string field becomes the shared category x-axis.
 * - Each numeric field becomes one series, its positional values plotted against
 *   the categories.
 *
 * All series share the panel-level `seriesType` (line/bar/...). Per-field render
 * and stack overrides are only wired for the time-axis path today; here stacking
 * follows the panel-level `panelStack` flag and applies only when the panel type
 * is `bar`. See echarts/converters/timeSeries.ts.
 *
 * Inherits the categorical model's trade-offs (single frame, time fields
 * ignored, positional alignment). Returns `null` when no usable categorical data
 * can be derived, so callers can fall back to a no-data view.
 */
export function categoryCartesianToEChartsOption(
  series: DataFrame[],
  seriesType: SeriesType,
  theme: GrafanaTheme2,
  panelStack = false
): CategoryCartesianData | null {
  const categorical = frameToCategorical(series, theme);

  if (!categorical) {
    return null;
  }

  const stacked = seriesType === 'bar' && panelStack;
  const echartsSeries: CategoryCartesianSeries[] = categorical.series.map((field) => ({
    name: field.name,
    type: seriesType,
    data: field.values,
    itemStyle: { color: field.color },
    lineStyle: { color: field.color },
    ...(stacked ? { stack: STACK_GROUP_ID } : {}),
  }));

  return { categories: categorical.categories, series: echartsSeries };
}
