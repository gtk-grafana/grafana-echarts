import { getTooltipOption } from 'echarts/options/tooltip';
import { ECBasicOption } from 'echarts/types/dist/shared';

/**
 * Base option for pie charts.
 *
 * Only the static, data-independent pieces live here. The `series` (slices) is
 * data-derived and merged in by the panel, mirroring how the other base options
 * are spread.
 *
 * Pie uses an `item` tooltip trigger (hover a slice); there is no axis to anchor
 * a combined tooltip off of.
 */
export const pieDefaultOptions: ECBasicOption = {
  animationDuration: 300,

  // https://echarts.apache.org/en/option.html#tooltip
  // Transparent box; the Grafana React tooltip (see EChartsTooltip) renders the
  // content for the hovered slice.
  tooltip: getTooltipOption('item'),

  // https://echarts.apache.org/en/option.html#legend
  legend: {},
};
