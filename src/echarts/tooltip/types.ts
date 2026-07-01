/** Series families with distinct hover-data shapes, used to pick a tooltip trigger. */
export type TooltipKind = 'timeseries' | 'pie' | 'radar' | 'heatmap';

/** ECharts tooltip trigger: cartesian time series share an x axis; pie/radar hover per item. */
export type EChartsTooltipTrigger = 'axis' | 'item';
