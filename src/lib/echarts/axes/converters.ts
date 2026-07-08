import { type SeriesType } from 'editor/types';
import {
  isCategoricalAxisSeriesType,
  isCategoricalOnlySeriesType,
  isHeatmapSeriesType,
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
 */
export const panelTypeToAxis = (seriesType: SeriesType, hasTimeField = true): EChartsAxisType => {
  if (!supportedChartSeriesTypes.includes(seriesType)) {
    throw new Error(`Unsupported panel type: ${seriesType}`);
  }

  if (isCategoricalOnlySeriesType(seriesType)) {
    return 'category';
  }

  if (isHeatmapSeriesType(seriesType) || hasTimeField) {
    return 'time';
  }

  if (isCategoricalAxisSeriesType(seriesType)) {
    return 'category';
  }

  throw new Error(`Invalid panel type: ${seriesType}`);
};
