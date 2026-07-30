import { debug, LOG_LEVELS } from 'development';
import { STACK_GROUP_ID } from 'editor/cartesian';
import { type CartesianSingleValueSeriesType } from 'editor/types';
import { type CartesianOption, type ChartContext } from 'lib/echarts/charts/types';
import { fallbackCategories, framesToCategoryCartesian } from 'lib/echarts/converters/categoryCartesianModel';
import { resolveFieldSeriesType, resolveFieldStack } from 'lib/echarts/converters/fieldOverrides';
import { type CategoryCartesianData } from 'lib/echarts/converters/types';
import { buildCartesianSeries } from 'lib/echarts/options/cartesian';
import { getDensityFromSeriesValues, getSeriesPerfOptions } from 'lib/echarts/performance/resolvers';

/**
 * Convert Grafana Numeric frames into an ECharts category-axis cartesian chart.
 *
 * The string field becomes the shared category x-axis and each numeric field
 * becomes one series, its values plotted against those categories. Series span
 * every frame in the response, joined by category label; see
 * `framesToCategoryCartesian` for that contract.
 *
 * Per-field `custom.seriesType` and `custom.stackSeries` overrides are honored
 * here exactly as they are on the time axis (both read the shared resolvers in
 * `converters/fieldOverrides.ts`), so a panel can mix render types — e.g. a
 * scatter overlay on a categorical bar chart. An unset field inherits the
 * panel-level series type.
 */
export function categoryCartesianToEChartsOption(
  ctx: ChartContext<CartesianSingleValueSeriesType>
): CategoryCartesianData {
  const { frames, theme, seriesType, options } = ctx;
  const model = framesToCategoryCartesian(frames, theme);

  if (!model) {
    // Hiding every series via the legend strips all numeric value fields, leaving
    // frames with no series. Keep the category axis and render nothing (matches
    // core Grafana) by reusing the labels from the remaining frame.
    if (frames.length > 0) {
      return { categories: fallbackCategories(frames), series: [] };
    }

    // We should bail for empty/invalid frames earlier then this
    debug('Categorical-x cartesian plots must have categorical data', LOG_LEVELS.warn, frames);
    throw new Error('Categorical-x cartesian plots must have categorical data');
  }

  // Density drives the same fast-path props as the time-axis converter, computed
  // once over every series so a dense chart never renders half on the fast path.
  const density = getDensityFromSeriesValues(model.series.map(({ values }) => values));

  const echartsSeries: CartesianOption['series'] = model.series.map(({ field, name, color, values }) => {
    // Per-field override wins over the panel type; a non-single-value override
    // (candlestick/boxplot/Auto) falls back to it. Only bar stacks, so the stack
    // group is gated on the *resolved* type rather than the panel's.
    const resolvedType = resolveFieldSeriesType<CartesianSingleValueSeriesType>(field, seriesType);
    const stacked = resolvedType === 'bar' && resolveFieldStack(field, options.stackSeries);

    return buildCartesianSeries(
      {
        name,
        data: values,
        color,
        zlevel: options.zLevel?.series,
        // Keyed off the resolved type: line and bar/scatter arm different levers
        // (LTTB sampling vs `large`), so passing the panel type would put an
        // overridden field on the wrong fast path.
        perf: getSeriesPerfOptions({ type: resolvedType, density, options, values }),
        ...(stacked ? { stack: STACK_GROUP_ID } : {}),
      },
      resolvedType,
      options,
      theme
    );
  });

  return { categories: model.categories, series: echartsSeries };
}
