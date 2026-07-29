import {
  isCategoricalAxisSeriesType,
  isCategoricalOnlySeriesType,
  isHeatmapSeriesType,
  isHierarchySeriesType,
  isMultivariateSeriesType,
  isTimeAxisSupportedForSeriesType,
} from 'lib/echarts/charts/narrowing';
import { supportedChartSeriesTypes } from 'lib/echarts/charts/registry';
import { type ChartContext } from 'lib/echarts/charts/types';

/**
 * ECharts axis types we map Grafana panel types onto.
 * https://echarts.apache.org/en/option.html#xAxis.type
 */
export type EChartsAxisType = 'value' | 'category' | 'time' | 'log';

/**
 * Map a panel series type to the ECharts axis type its chart renders on.
 *
 * The cartesian family's axis follows the data, not the series type: time frames
 * use a `time` axis (axis tooltips + crosshair), while Numeric frames with no
 * time field use a `category` axis (per-item hover, no axis pointer). Callers
 * pass `hasTimeField` from the frames; it defaults to `true` to preserve the
 * time-grid behavior for callers that only know the type.
 *
 * The heatmap family always renders on the shared time grid. Pie and radar use
 * non-cartesian coordinate systems, which ECharts treats as categorical for
 * tooltip purposes. Any other type has no registered chart module, so `category`
 * is a safe default.
 *
 * @todo why is heatmap time and not value or log when missing time field?
 * @todo do we want to use frame meta when available?
 * Look into what the various echart axis types support and when we want to use them and revisit this method
 * Leaving explicit for now under the assumption we will refactor this later.
 */
export const panelTypeToAxis = (ctx: ChartContext, hasTimeField = true): EChartsAxisType => {
  const seriesType = ctx.seriesType;
  if (!supportedChartSeriesTypes.includes(seriesType)) {
    throw new Error(`Unsupported axis for series type: ${seriesType}`);
  }

  // Check for series types that cannot support a time axis first in case someone is sending a time to pie or radar
  if (isCategoricalOnlySeriesType(seriesType)) {
    return 'category';
  }

  // Hierarchy charts (treemap/sunburst) use their own non-cartesian layout; like
  // pie/radar, ECharts treats them as categorical for tooltip purposes.
  if (isHierarchySeriesType(seriesType)) {
    return 'category';
  }

  // Multivariate charts render on their own coordinate systems (radar's polar
  // grid, parallel's `parallelAxis`), not the cartesian time/value grid. Radar is
  // also caught by `isCategoricalOnlySeriesType` above; parallel needs this branch
  // so it resolves to `category` rather than throwing.
  if (isMultivariateSeriesType(seriesType)) {
    return 'category';
  }

  // Heatmap can support either time or categorical axis so make sure we check the manual setting first
  if (isHeatmapSeriesType(seriesType)) {
    if (ctx.options.heatmapLayout === 'matrix') {
      return 'category';
    }
    return 'time';
  }

  // Then if we have a time axis, we use it
  if (isTimeAxisSupportedForSeriesType(seriesType) && hasTimeField) {
    return 'time';
  }

  if (isCategoricalAxisSeriesType(seriesType)) {
    return 'category';
  }

  throw new Error(`Unknown axix mapping for series type: ${seriesType}`);
};
