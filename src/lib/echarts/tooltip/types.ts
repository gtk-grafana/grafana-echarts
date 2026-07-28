import { type Field, type GrafanaTheme2, type ValueFormatter } from '@grafana/data';
import { type TooltipSink } from 'lib/echarts/tooltip/model';

/**
 * ECharts tree data item shared by the treemap and sunburst series (both accept
 * `{ name, value, children, itemStyle }`). `self` and `sourceRowIndex` are
 * carried through as extra fields so the tooltip can surface them; ECharts
 * preserves unknown data props.
 */
export interface HierarchyTreeItem {
  name: string;
  value?: number;
  self?: number;
  itemStyle?: { color: string };
  children?: HierarchyTreeItem[];
  /** Source row (see `HierarchyNode.sourceRowIndex`) for footer data links. */
  sourceRowIndex?: number;
}

/**
 * Formatting context the hierarchy tooltip reads. Narrower than the series
 * context that supplies it (`HierarchySeriesContext`), which keeps the tooltip
 * layer from importing the option layer back.
 */
export interface HierarchyTooltipContext {
  formatValue: ValueFormatter;
  /** The numeric field sizing the nodes; the footer resolves its data links. */
  valueField?: Field;
}

/** Theme + formatting context the binned heatmap tooltip needs to match Grafana. */
export interface BinnedHeatmapTooltipContext {
  theme: GrafanaTheme2;
  timeZone: string;
  formatValue: ValueFormatter;
  /** Receives the hovered cell's content model; rendered by the React overlay. */
  tooltipSink?: TooltipSink;
}
