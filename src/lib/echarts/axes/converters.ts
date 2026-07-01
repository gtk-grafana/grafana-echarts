import {cartesianTimeSeriesTypes} from "editor/constants";
import { heatmapSeriesTypes } from 'editor/series';
import { SeriesType } from 'editor/types';

/**
 * ECharts axis types we map Grafana panel types onto.
 * https://echarts.apache.org/en/option.html#xAxis.type
 */
export type EChartsAxisType = 'value' | 'category' | 'time' | 'log';

/**
 * Map a panel series type to the ECharts axis type its chart renders on.
 *
 * Cartesian (line/bar/scatter) and heatmap families render on the shared time
 * grid, so they use a `time` axis that supports axis tooltips and a crosshair.
 * Pie and radar use non-cartesian coordinate systems, which ECharts treats as
 * categorical for tooltip purposes (per-item hover, no axis pointer). Any other
 * type has no registered chart module, so `category` is a safe default.
 */
export const panelTypeToAxis = (panelType: SeriesType): EChartsAxisType => {
  if (cartesianTimeSeriesTypes.includes(panelType) || heatmapSeriesTypes.includes(panelType)) {
    return 'time';
  }

  return 'category';
};
