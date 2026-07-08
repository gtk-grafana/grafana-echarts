import { debug, LOG_LEVELS } from 'development';
import { CategoryAxisBaseOption } from 'echarts/types/src/coord/axisCommonTypes';
import { STACK_GROUP_ID } from 'editor/constants';
import { type SeriesType } from 'editor/types';
import { CartesianOption, ChartContext } from 'lib/echarts/charts/types';
import { frameToCategorical } from 'lib/echarts/converters/categorical';

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
  categories: CategoryAxisBaseOption['data'];
  series: CartesianOption['series'];
}

/**
 * Convert Grafana Numeric frames into an ECharts category-axis cartesian chart
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
 * ignored, positional alignment).
 */
export function categoryCartesianToEChartsOption(ctx: ChartContext): CategoryCartesianData {
  const { frames, theme, seriesType, options } = ctx;
  const categorical = frameToCategorical(frames, theme);

  if (!categorical) {
    // We should bail for empty/invalid frames earlier then this
    debug('Categorical-x cartesian plots must have categorical data', LOG_LEVELS.warn, frames);
    throw new Error('Categorical-x cartesian plots must have categorical data')
  }

  const stacked = seriesType === 'bar' && options.stackSeries;
  // @todo fix this type
  const echartsSeries: CartesianOption['series'] = categorical.series.map((field) => ({
    name: field.name,
    type: seriesType,
    zlevel: options.zLevel?.series,
    data: field.values,
    itemStyle: { color: field.color },
    lineStyle: { color: field.color },
    ...(stacked ? { stack: STACK_GROUP_ID } : {}),
  }));

  return { categories: categorical.categories, series: echartsSeries };
}
