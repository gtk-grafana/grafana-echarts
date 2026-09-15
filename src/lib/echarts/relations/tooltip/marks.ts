import { type Field, type GrafanaTheme2, type ValueFormatter } from '@grafana/data';

import { SOURCE_LABEL, TARGET_LABEL, type GraphEndpointKeys } from 'lib/echarts/relations/converters/contract';
import { type NodeGraphData } from 'lib/echarts/relations/converters/model';
import {
  type NodeFilterLabels,
  type RelationsAdjacentEdge,
  type RelationsLinkItem,
  type RelationsMark,
  type RelationsMarks,
  type RelationsNodeItem,
} from 'lib/echarts/relations/tooltip/types';
import { formatEChartsValue, getValueFormatter } from 'lib/echarts/style';
import { type TooltipRow } from 'lib/echarts/tooltip/types';

import { type EChartsRelationsFieldConfig } from 'editor/relations/types';

/** Format a mark that has no field or unit. */
export const formatDerivedMarkValue: ValueFormatter = (value) => ({ text: String(value) });

/** A mark backed by a field. */
type FieldedMark = {
  id: string;
  markKey?: string;
  field?: Field;
  sourceRowIndex?: number;
  /** Edge filter labels. */
  filterLabels?: GraphEndpointKeys;
};

/** Build mark metadata by mark key or id. */
function toMarkMap(marks: FieldedMark[], theme: GrafanaTheme2, timeZone?: string): Map<string, RelationsMark> {
  const byKey = new Map<string, RelationsMark>();
  for (const { id, markKey, field, sourceRowIndex, filterLabels } of marks) {
    if (field != null) {
      byKey.set(markKey ?? id, {
        formatValue: getValueFormatter(field, theme, timeZone),
        // Use row zero when a fixture omits the source row.
        source: { field, rowIndex: sourceRowIndex ?? 0 },
        ...(filterLabels ? { filterLabels } : {}),
      });
    }
  }
  return byKey;
}

/** Maximum adjacent edges shown in a tooltip. */
const MAX_ADJACENT_EDGE_ROWS = 10;

/** The edges touching each node, keyed by node id. */
function toAdjacency(
  data: NodeGraphData,
  links: ReadonlyMap<string, RelationsMark>
): Map<string, RelationsAdjacentEdge[]> {
  const byNode = new Map<string, RelationsAdjacentEdge[]>();
  // Use visible node names in adjacency rows.
  const names = new Map(data.nodes.map((node) => [node.id, node.name]));

  for (const link of data.links) {
    // Each edge keeps its field formatter.
    const mark = links.get(link.markKey ?? link.id);
    const value = formatEChartsValue(link.value ?? null, mark?.formatValue ?? formatDerivedMarkValue);

    const ends = [{ id: link.source, other: link.target, outgoing: true }];
    // List self-loops once.
    if (link.target !== link.source) {
      ends.push({ id: link.target, other: link.source, outgoing: false });
    }
    for (const { id, other, outgoing } of ends) {
      const rows = byNode.get(id) ?? [];
      rows.push({ node: names.get(other) ?? other, outgoing, value });
      byNode.set(id, rows);
    }
  }
  return byNode;
}

/** Build one tooltip row for each adjacent edge. */
export function adjacencyRows(edges: RelationsAdjacentEdge[]): TooltipRow[] {
  const rows: TooltipRow[] = edges
    .slice(0, MAX_ADJACENT_EDGE_ROWS)
    .map((edge) => ({ label: edge.outgoing ? `→ ${edge.node}` : `${edge.node} →`, value: edge.value }));
  const remaining = edges.length - rows.length;
  if (remaining > 0) {
    rows.push({ label: `+${remaining} more`, value: '' });
  }
  return rows;
}

/** Each mark's own display processor and link source, built once per render. */
export function getRelationsTooltipMarks(data: NodeGraphData, theme: GrafanaTheme2, timeZone?: string): RelationsMarks {
  const links = toMarkMap(data.links, theme, timeZone);
  return {
    nodes: toMarkMap(data.nodes, theme, timeZone),
    links,
    adjacency: toAdjacency(data, links),
    nodeFilterLabels: toNodeFilterLabels(data),
    endpointsFilterable: data.links.some((link) => link.field?.config.filterable === true),
    ...(data.endpointLabels ? { endpointLabels: data.endpointLabels } : {}),
  };
}

/** The keys each node is an endpoint under, from the edges touching it. */
function toNodeFilterLabels(data: NodeGraphData): Map<string, NodeFilterLabels> {
  const roles = new Map<string, NodeFilterLabels>();
  const entry = (id: string): NodeFilterLabels => {
    const existing = roles.get(id);
    if (existing) {
      return existing;
    }
    const created: NodeFilterLabels = { sources: [], targets: [] };
    roles.set(id, created);
    return created;
  };
  const push = (keys: string[], key: string): void => {
    if (!keys.includes(key)) {
      keys.push(key);
    }
  };

  for (const link of data.links) {
    const keys = relationsFilterLabels(link.field, link.filterLabels ?? data.endpointLabels);
    const source = entry(link.source);
    push(source.sources, keys.source);
    const target = entry(link.target);
    push(target.targets, keys.target);
  }
  return roles;
}

/**
 * A `graph` series emits both node and link hovers through one formatter, so the model has to tell them apart.
 * https://echarts.apache.org/en/option.html#series-graph.tooltip
 */
export function isLinkItem(value: unknown): value is RelationsLinkItem {
  return typeof value === 'object' && value !== null && 'source' in value && 'target' in value;
}

export function isNodeItem(value: unknown): value is RelationsNodeItem {
  return typeof value === 'object' && value !== null && 'id' in value && !isLinkItem(value);
}

/** The two label keys this mark's endpoints are offered under as ad-hoc filters. */
export function relationsFilterLabels(
  field?: Field,
  fromData?: GraphEndpointKeys
): {
  source: string;
  target: string;
} {
  return {
    source: customFilterLabel(field, 'sourceFilterLabel') ?? fromData?.source ?? SOURCE_LABEL,
    target: customFilterLabel(field, 'targetFilterLabel') ?? fromData?.target ?? TARGET_LABEL,
  };
}

/** Read a custom endpoint filter label. */
export function customFilterLabel(
  field: Field | undefined,
  key: keyof Pick<EChartsRelationsFieldConfig, 'sourceFilterLabel' | 'targetFilterLabel'>
): string | undefined {
  const custom: unknown = field?.config.custom;
  if (typeof custom !== 'object' || custom === null || !(key in custom)) {
    return undefined;
  }
  const value: unknown = Reflect.get(custom, key);
  return typeof value === 'string' && value !== '' ? value : undefined;
}
