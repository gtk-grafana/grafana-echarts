import { debug, LOG_LEVELS } from 'development';
import { STACK_GROUP_ID } from 'editor/constants';
import { type CartesianSingleValueSeriesType } from 'editor/types';
import { type CartesianOption, type ChartContext } from 'lib/echarts/charts/types';
import { frameToCategorical } from 'lib/echarts/converters/categorical';
import { type CategoryCartesianData } from 'lib/echarts/converters/types';

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

export function categoryCartesianToEChartsOption(ctx: ChartContext<CartesianSingleValueSeriesType>): CategoryCartesianData {
  const { frames, theme, seriesType, options } = ctx;
  const categorical = frameToCategorical(frames, theme);

  if (!categorical) {
    // We should bail for empty/invalid frames earlier then this
    debug('Categorical-x cartesian plots must have categorical data', LOG_LEVELS.warn, frames);
    throw new Error('Categorical-x cartesian plots must have categorical data');
  }

  const stacked = seriesType === 'bar' && options.stackSeries;
  const echartsSeries: CartesianOption['series'] = categorical.series.map((field) => ({
    name: field.name,
    // effectScatter has types inconsistency but should have same behavior as scatter with same options, type assertion will have to do for now
    type: seriesType as Exclude<CartesianSingleValueSeriesType, 'effectScatter'>,
    zlevel: options.zLevel?.series,
    data: field.values,
    itemStyle: { color: field.color },
    lineStyle: { color: field.color },
    ...(stacked ? { stack: STACK_GROUP_ID } : {}),
  }));

  return { categories: categorical.categories, series: echartsSeries };
}
