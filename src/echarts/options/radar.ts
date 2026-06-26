import { ECBasicOption } from 'echarts/types/dist/shared';

/**
 * Base option for radar charts.
 *
 * Only the static, data-independent pieces live here. The `radar.indicator`
 * (axes) and the `series` (polygons) are data-derived and merged in by the
 * panel, mirroring how `cartesianTimeDefaultOptions` is spread for line/bar.
 *
 * Note: radar uses an `item` tooltip trigger (hover a polygon) rather than the
 * `axis` trigger used by cartesian charts, because there is no shared x-axis to
 * key a combined tooltip off of.
 */
export const radarDefaultOptions: ECBasicOption = {
  animationDuration: 300,

  // https://echarts.apache.org/en/option.html#tooltip
  tooltip: {
    show: true,
    trigger: 'item',
  },

  // https://echarts.apache.org/en/option.html#legend
  legend: {

  },
};
