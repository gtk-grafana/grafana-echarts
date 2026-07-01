import { TooltipOption } from 'echarts/types/dist/shared';

/**
 * ECharts tooltip trigger: cartesian time series share an x axis; pie/radar hover per item.
 * https://echarts.apache.org/en/option.html#tooltip.trigger
 */
export type EChartsTooltipTrigger = TooltipOption['trigger'];
