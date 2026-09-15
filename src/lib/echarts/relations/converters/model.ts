import { type Field } from '@grafana/data';

import { type GraphEndpointKeys } from 'lib/echarts/relations/converters/contract';

/** An extra tooltip stat and its reducer. */
export interface MarkStat {
  calc?: string;
  value: string;
}

/** A chart-independent relations node. */
export interface RelationNode {
  id: string;
  name: string;
  subtitle?: string;
  value: number | null;
  secondaries?: MarkStat[];
  radius?: number;
  color?: string;
  fixedX?: number;
  fixedY?: number;
  hidden?: boolean;
  sourceRowIndex?: number;
  field?: Field;
}

/** A chart-independent relations link. */
export interface RelationLink {
  id: string;
  /** Unique lookup key when field names repeat. */
  markKey?: string;
  source: string;
  target: string;
  value: number | null;
  secondaries?: MarkStat[];
  color?: string;
  width?: number;
  lineType?: 'solid' | 'dashed' | 'dotted';
  curveness?: number;
  filterLabels?: GraphEndpointKeys;
  hidden?: boolean;
  sourceRowIndex?: number;
  field?: Field;
}

/** The node and link model shared by graph, sankey, and chord. */
export interface NodeGraphData {
  nodes: RelationNode[];
  links: RelationLink[];
  /** Source labels from the data source, if they are not canonical. */
  endpointLabels?: GraphEndpointKeys;
}
