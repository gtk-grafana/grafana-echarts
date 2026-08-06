import { type DataFrame, type DataFrameType, type Field, type Labels } from '@grafana/data';
import {
  EDGE_SEPARATOR,
  GRAPH_EDGES_WIDE,
  GRAPH_NODES_WIDE,
  GRAPH_TYPE_VERSION,
  SOURCE_LABEL,
  TARGET_LABEL,
} from 'lib/echarts/converters/graphWide';
import { type RelationsFamilyField, type RelationsFamilyFrame } from 'lib/grafana/fields/fieldTypes';

/**
 * The construction half of the graph-wide contract, shared by every converter into it.
 *
 * `legacyToWide.ts` (Grafana's row-based node-graph frames) and `longToWide.ts` (a
 * datasource's per-series frames) start from unrelated input and have to land on the
 * *same* output, because the reader (`graphWide.ts`) is the only thing downstream of both
 * and it reads exactly three carriers: `field.name` for identity, `field.labels` for
 * topology and `meta.type` for role. Those three are built here, once, so the two
 * converters cannot drift apart on the shape they emit.
 *
 * Spec: ../../../../data-plane/graph-wide.md.
 */

/**
 * The default edge id: the endpoints joined by the separator.
 *
 * A *default* only — a converter with a real id to hand (a row's `id` column, a rendered
 * legend format) uses that instead, because this one cannot round-trip a node id that
 * itself contains the separator. Which is why topology never comes from the name; it comes
 * from the labels below.
 */
export function edgeId(source: string, target: string): string {
  return `${source}${EDGE_SEPARATOR}${target}`;
}

/**
 * A mark's labels, with the endpoints under the contract's canonical keys — whatever they
 * were called on the wire.
 *
 * `extra` is spread **first** deliberately. It is arbitrary user data — a `detail__source`
 * column, a `source` label on a response whose endpoints live under different keys — and
 * must not be able to move the edge to a node that does not exist.
 */
export function edgeLabels(extra: Labels, { source, target }: { source: string; target: string }): Labels {
  return { ...extra, [SOURCE_LABEL]: source, [TARGET_LABEL]: target };
}

/**
 * Read a numeric cell without trusting `Field['values']`, which is `any[]`.
 *
 * Also the single place non-finite values are rejected: `NaN` and `Infinity` reach a
 * reducer as numbers and leave it as a mark with no drawable weight.
 */
export function numberAt(field: Field | undefined, row: number): number | null {
  const raw: unknown = field?.values[row];
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
}

/**
 * The frame's row count, taken from its longest field.
 *
 * Derived rather than passed in, so the two converters cannot disagree: an instant
 * conversion (one value per mark) comes out one row, and a ranged one keeps every row it
 * was given — which is what leaves `calcs[0]` something to reduce.
 */
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

/** One numeric field per node, stamped `graph-nodes-wide`. */
export function nodesWideFrame(base: Partial<DataFrame>, fields: RelationsFamilyField[]): RelationsFamilyFrame {
  return graphWideFrame(base, fields, GRAPH_NODES_WIDE);
}
