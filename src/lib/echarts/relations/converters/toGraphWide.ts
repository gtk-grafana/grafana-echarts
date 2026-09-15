import {
  type DataFrame,
  type DataFrameType,
  type Field,
  formatLabels,
  type Labels,
  type QueryResultMeta,
} from '@grafana/data';

import { type RelationsFamilyField, type RelationsFamilyFrame } from 'lib/grafana/fields/relationsFields';

import {
  CANONICAL_ENDPOINT_KEYS,
  EDGE_SEPARATOR,
  ENDPOINT_LABEL_PAIRS,
  GRAPH_EDGES_WIDE,
  GRAPH_META_CUSTOM,
  GRAPH_NODES_WIDE,
  GRAPH_TYPE_VERSION,
  type GraphEndpointKeys,
  isCanonicalEndpointKeys,
  SOURCE_LABEL,
  TARGET_LABEL,
} from 'lib/echarts/relations/converters/contract';

/** The default edge id: the endpoints joined by the separator. */
export function edgeId(source: string, target: string): string {
  return `${source}${EDGE_SEPARATOR}${target}`;
}

/** A mark's labels, with the endpoints under the contract's canonical keys. */
export function edgeLabels(extra: Labels, { source, target }: { source: string; target: string }): Labels {
  return { ...extra, [SOURCE_LABEL]: source, [TARGET_LABEL]: target };
}

/** Return labels that are not endpoint keys. See {@link ENDPOINT_LABEL_PAIRS}. */
export function withoutEndpoints(
  labels: Labels | undefined,
  keys: GraphEndpointKeys = CANONICAL_ENDPOINT_KEYS
): Labels {
  const rest: Labels = {};
  for (const [key, value] of Object.entries(labels ?? {})) {
    // Drop canonical and source endpoint labels.
    if (key !== keys.source && key !== keys.target && key !== SOURCE_LABEL && key !== TARGET_LABEL) {
      rest[key] = value;
    }
  }
  return rest;
}

/** The names more than one mark wants, so every member of a clash can be discriminated. */
export function contestedIds(bases: readonly string[]): ReadonlySet<string> {
  const seen = new Set<string>();
  const contested = new Set<string>();
  for (const base of bases) {
    if (seen.has(base)) {
      contested.add(base);
    }
    seen.add(base);
  }
  return contested;
}

/** Make a mark name unique among its siblings. */
export function uniqueId(taken: ReadonlySet<string>, base: string, rest: Labels, contested: boolean): string {
  if (contested && Object.keys(rest).length > 0) {
    const labelled = `${base} ${formatLabels(rest)}`;
    if (!taken.has(labelled)) {
      return labelled;
    }
  }
  if (!taken.has(base)) {
    return base;
  }
  let suffix = 2;
  while (taken.has(`${base} #${suffix}`)) {
    suffix++;
  }
  return `${base} #${suffix}`;
}

/** Read a numeric cell without trusting `Field['values']`, which is `any[]`. */
export function numberAt(field: Field | undefined, row: number): number | null {
  const raw: unknown = field?.values[row];
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
}

/** The frame's row count, taken from its longest field. */
function rowCount(fields: RelationsFamilyField[]): number {
  return fields.reduce((longest, field) => Math.max(longest, field.values.length), 0);
}

function graphWideFrame(
  base: Partial<DataFrame>,
  fields: RelationsFamilyField[],
  type: DataFrameType
): RelationsFamilyFrame {
  return {
    ...base,
    fields,
    length: rowCount(fields),
    meta: { ...base.meta, type, typeVersion: GRAPH_TYPE_VERSION },
  };
}

/** One numeric field per edge, stamped `graph-edges-wide`. */
export function edgesWideFrame(base: Partial<DataFrame>, fields: RelationsFamilyField[]): RelationsFamilyFrame {
  return graphWideFrame(base, fields, GRAPH_EDGES_WIDE);
}

/** Build metadata that declares the source endpoint labels. */
export function withEndpointLabelsMeta(
  meta: QueryResultMeta | undefined,
  keys: GraphEndpointKeys | undefined
): QueryResultMeta | undefined {
  if (!keys || isCanonicalEndpointKeys(keys)) {
    return meta;
  }
  const graph = { sourceKey: keys.source, targetKey: keys.target };
  return { ...meta, custom: { ...meta?.custom, [GRAPH_META_CUSTOM]: { ...graph } } };
}

/** One numeric field per node, stamped `graph-nodes-wide`. */
export function nodesWideFrame(base: Partial<DataFrame>, fields: RelationsFamilyField[]): RelationsFamilyFrame {
  return graphWideFrame(base, fields, GRAPH_NODES_WIDE);
}
