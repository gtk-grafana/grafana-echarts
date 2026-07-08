import { type SeriesType } from 'editor/types';
import {
  isCategoricalAxisSeriesType,
  isCategoricalOnlySeriesType,
  isHeatmapSeriesType,
  isTimeAxisSupportedForSeriesType,
} from 'lib/echarts/charts/narrowing';
import { supportedChartSeriesTypes } from 'lib/echarts/charts/registry';

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
 * Look into what the various echart axis types support and when we want to use them and revisit this method
 * Leaving explicit for now under the assumption we will refactor this later.
 */
export const panelTypeToAxis = (seriesType: SeriesType, hasTimeField = true): EChartsAxisType => {
  if (!supportedChartSeriesTypes.includes(seriesType)) {
    throw new Error(`Unsupported axis for series type: ${seriesType}`);
  }

  // Check for series types that cannot support a time axis first in case someone is sending a time to pie or radar
  if (isCategoricalOnlySeriesType(seriesType)) {
    return 'category';
  }

  // Then if we have a time axis, we use it
  if (isTimeAxisSupportedForSeriesType(seriesType) && hasTimeField) {
    return 'time';
  }

  if(isHeatmapSeriesType(seriesType)){
    return 'time';
  }

  if (isCategoricalAxisSeriesType(seriesType)) {
    return 'category';
  }

  throw new Error(`Unsupported axis for series typ: ${seriesType}`);
};
