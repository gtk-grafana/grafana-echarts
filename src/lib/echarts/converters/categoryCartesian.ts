import { debug, LOG_LEVELS } from 'development';
import { STACK_GROUP_ID } from 'editor/cartesian';
import { type CartesianSingleValueSeriesType } from 'editor/types';
import { type CartesianOption, type ChartContext } from 'lib/echarts/charts/types';
import { frameToCategorical } from 'lib/echarts/converters/categorical';
import { findCategoryField, resolveCategoriesFromFrame } from 'lib/echarts/converters/frames';
import { type CategoryCartesianData } from 'lib/echarts/converters/types';
import { buildCartesianSeries } from 'lib/echarts/options/cartesian';

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

export function categoryCartesianToEChartsOption(
  ctx: ChartContext<CartesianSingleValueSeriesType>
): CategoryCartesianData {
  const { frames, theme, seriesType, options } = ctx;
  const categorical = frameToCategorical(frames, theme);

  if (!categorical) {
    // Hiding every series via the legend strips all numeric value fields,
    // leaving a category frame with no series. Keep the category axis and render
    // nothing (matches core Grafana) by reusing the category labels from the
    // remaining frame (string field, else row indices).
    const categoryFrame = frames.find((frame) => findCategoryField(frame)) ?? frames[0];
    if (categoryFrame) {
      return { categories: resolveCategoriesFromFrame(categoryFrame), series: [] };
    }

    // We should bail for empty/invalid frames earlier then this
    debug('Categorical-x cartesian plots must have categorical data', LOG_LEVELS.warn, frames);
    throw new Error('Categorical-x cartesian plots must have categorical data');
  }

  const stacked = seriesType === 'bar' && options.stackSeries;
  // Per-series color plus the Advanced value-label / geometry / style options;
  // every extra is omitted at its default so untouched panels are unchanged.
  const echartsSeries: CartesianOption['series'] = categorical.series.map((field) =>
    buildCartesianSeries(
      {
        name: field.name,
        data: field.values,
        color: field.color,
        zlevel: options.zLevel?.series,
        ...(stacked ? { stack: STACK_GROUP_ID } : {}),
      },
      seriesType,
      options,
      theme
    )
  );

  return { categories: categorical.categories, series: echartsSeries };
}
