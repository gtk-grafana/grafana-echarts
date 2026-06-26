import { SelectableValue } from '@grafana/data';
import { SeriesType } from 'editor/types';

/**
 * Series editor options
 */
export const seriesCategoryName = 'Series';

/**
 * Series Type - tells echarts how to render each series
 * https://echarts.apache.org/en/option.html#series
 */
export const seriesTypeOptions: Array<SelectableValue<SeriesType>> = [
  { value: 'line', label: 'line' },
  { value: 'bar', label: 'bar' },
  { value: 'pie', label: 'pie' },
  { value: 'scatter', label: 'scatter' },
  { value: 'effectScatter', label: 'effectScatter' },
  { value: 'radar', label: 'radar' },
  { value: 'tree', label: 'tree' },
  { value: 'treemap', label: 'treemap' },
  { value: 'sunburst', label: 'sunburst' },
  { value: 'boxplot', label: 'boxplot' },
  { value: 'candlestick', label: 'candlestick' },
  { value: 'heatmap', label: 'heatmap' },
  { value: 'map', label: 'map' },
  { value: 'parallel', label: 'parallel' },
  { value: 'lines', label: 'lines' },
  { value: 'graph', label: 'graph' },
  { value: 'sankey', label: 'sankey' },
  { value: 'funnel', label: 'funnel' },
  { value: 'gauge', label: 'gauge' },
  { value: 'pictorialBar', label: 'pictorialBar' },
  { value: 'themeRiver', label: 'themeRiver' },
  { value: 'chord', label: 'chord' },
  { value: 'custom', label: 'custom' },
];

export const seriesTypeDefault: SeriesType = 'line';
export const seriesTypeName = 'Type'
export const seriesTypePath = 'seriesType';
