import { TooltipOption } from 'echarts/types/dist/shared';
import { LabelOption, LineStyleOption } from 'echarts/types/src/util/types';

/**
 * ECharts tooltip trigger: cartesian time series share an x axis; pie/radar hover per item.
 * https://echarts.apache.org/en/option.html#tooltip.trigger
 */
export type EChartsTooltipTrigger = TooltipOption['trigger'];

/**
 * @todo how to get types from eCharts package instead of stubbing duplicate definitions?
 * https://echarts.apache.org/en/option.html#tooltip.axisPointer.crossStyle
 */
export type CrossStyle = LineStyleOption & {
  textStyle?: LabelOption;
};
