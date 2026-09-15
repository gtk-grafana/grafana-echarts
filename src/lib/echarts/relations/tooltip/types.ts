import { type ValueFormatter } from '@grafana/data';
import { type LinearGradientObject } from 'echarts/types/dist/shared';
import { type GraphEndpointKeys } from 'lib/echarts/relations/converters/contract';
import { type MarkStat } from 'lib/echarts/relations/converters/model';
import { type TooltipSource } from 'lib/echarts/tooltip/types';

/**
 * A graph node item with tooltip data.
 * https://echarts.apache.org/en/option.html#series-graph.data
 */
export interface RelationsNodeItem {
  /** Node field name and ECharts graph key. */
  id: string;
  name: string;
  value?: number;
  /** Node stat for variants that size nodes from flow. */
  stat?: number | null;
  symbolSize?: number;
  itemStyle?: { color?: string; borderColor?: string; borderWidth?: number };
  x?: number;
  y?: number;
  /** Sankey position as a fraction from 0 to 1. */
  localX?: number;
  localY?: number;
  subtitle?: string;
  secondaries?: MarkStat[];
}

/**
 * A graph link item with tooltip data.
 * https://echarts.apache.org/en/option.html#series-graph.links
 */
export interface RelationsLinkItem {
  source: string;
  target: string;
  /** Edge field lookup key. This is not the ECharts link id. */
  markId?: string;
  value?: number;
  secondaries?: MarkStat[];
  lineStyle?: {
    color?: string | LinearGradientObject;
    width?: number;
    type?: 'solid' | 'dashed' | 'dotted';
    curveness?: number;
  };
}

/** One formatted edge in a statless node tooltip. */
export interface RelationsAdjacentEdge {
  node: string;
  outgoing: boolean;
  value: string;
}

/** Field data needed to format one mark tooltip. */
export interface RelationsMark {
  formatValue: ValueFormatter;
  source: TooltipSource;
  filterLabels?: GraphEndpointKeys;
}

/** Per-render lookup data for relations tooltips. */
export interface RelationsMarks {
  nodes: ReadonlyMap<string, RelationsMark>;
  links: ReadonlyMap<string, RelationsMark>;
  /** Edges shown for nodes that have no stat. */
  adjacency?: ReadonlyMap<string, RelationsAdjacentEdge[]>;
  nodeFilterLabels?: ReadonlyMap<string, NodeFilterLabels>;
  endpointLabels?: GraphEndpointKeys;
  /** True when any edge enables ad hoc filters. */
  endpointsFilterable?: boolean;
}

/** Label keys used to include or exclude a node. */
export interface NodeFilterLabels {
  sources: string[];
  targets: string[];
}
