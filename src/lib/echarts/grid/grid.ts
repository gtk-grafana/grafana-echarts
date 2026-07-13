import { type VizLegendOptions } from '@grafana/schema';
import { debug, LOG_LEVELS } from 'development';
import { type GridOption } from 'echarts/types/dist/shared';
import { HEATMAP_VISUALMAP_HEIGHT, HEATMAP_VISUALMAP_WIDTH } from 'lib/echarts/options/constants';
import { type HeatmapColorScalePlacement } from 'lib/echarts/options/types';

const LEGEND_GRID_PADDING = 12;
const DEFAULT_GRID_PADDING = 8;
const LEFT_GRID_PADDING = 20;

// @todo need more dynamic way of reserving width for axis labels, long values keep getting truncated!
export function getCartesianGrid(legend?: VizLegendOptions): GridOption {
  const right = legend?.placement === 'right' ? LEGEND_GRID_PADDING : 0;
  const bottom = legend?.placement === 'bottom' ? LEGEND_GRID_PADDING : 0;

  // @todo outerBounds might be solution instead of using deprecated containLabel
  return { top: DEFAULT_GRID_PADDING, left: DEFAULT_GRID_PADDING, right, bottom, containLabel: true };
}

/**
 * Reserve space for the visualMap color scale (eCharts native heatmap legend) on whichever side it sits.
 */
export function getHeatmapGrid(
  placement: HeatmapColorScalePlacement,
  legend: VizLegendOptions | undefined
): GridOption {
  const baseGrid = getCartesianGrid(legend);

  // Add some runtime checks to narrow these types
  // @todo remove before public release, but we want to leave these in to keep from mixing loose types
  if (typeof baseGrid.bottom === 'string') {
    debug('Invalid grid bottom type', LOG_LEVELS.warn, baseGrid.bottom);
    throw new Error('Invalid grid bottom type');
  }

  if (typeof baseGrid.right === 'string') {
    debug('Invalid grid right type', LOG_LEVELS.warn, baseGrid.right);
    throw new Error('Invalid grid right type');
  }

  const bottom: number = (baseGrid.bottom ?? 0) + HEATMAP_VISUALMAP_HEIGHT;
  const right: number = (baseGrid.right ?? 16) + HEATMAP_VISUALMAP_WIDTH;
  return {
    ...baseGrid,
    left: LEFT_GRID_PADDING,
    ...(placement === 'bottom' ? { bottom } : { right }),
  };
}
