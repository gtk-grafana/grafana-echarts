import {
  type DataFrame,
  type DataFrameType,
  type Field,
  formatLabels,
  type Labels,
  type QueryResultMeta,
} from '@grafana/data';
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
 * The **naming ladder** at the end has a third caller: the reader itself, which mints a
 * `markKey` when two collected marks share a `field.name`. It does not mint an *id* — that
 * is `field.name` by contract — but the question "what tells two marks over one node pair
 * apart?" has to be answered the same way in both places, or the same response would be
 * keyed differently depending on whether the pivot ran. Hence one ladder, here.
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
 * Every label except the endpoints — the inverse half of {@link edgeLabels}.
 *
 * What is left is what actually distinguishes two marks joining the same node pair
 * (`protocol`, `connection_type`, …), which is why both the pivot and the reader reach for
 * it as the discriminator in {@link uniqueId}.
 *
 * `keys` is the pair the endpoints were actually *read* from, which is not always the pair
 * this module writes: a response labelled `client`/`server` is an edge response
 * ({@link ENDPOINT_LABEL_PAIRS}), and leaving those two in would put the whole topology into
 * the discriminator — every parallel edge would then look distinguishable by its endpoints,
 * which is the one thing they have in common. Defaults to the canonical pair, which is right
 * for anything read back off this module's own output.
 */
export function withoutEndpoints(
  labels: Labels | undefined,
  keys: GraphEndpointKeys = CANONICAL_ENDPOINT_KEYS
): Labels {
  const rest: Labels = {};
  for (const [key, value] of Object.entries(labels ?? {})) {
    // Both pairs are dropped, not just `keys`: a converter's output carries the canonical
    // pair, so a re-read of it must not resurrect them as a discriminator either.
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

/**
 * Make a name unique among its siblings, because two marks sharing one is silent mark
 * loss: nothing keyed by the name — a `byName` override, a legend row, a tooltip's
 * field lookup — can tell them apart afterwards.
 *
 * Parallel edges are the real case — two marks over one node pair, separated only by a
 * third label (`connection_type`, `protocol`) — so the discriminator is the label set that
 * distinguishes them, which is what a user writing the name by hand would reach for. It is
 * applied to **every** member of a contested name (see {@link contestedIds}), not just the
 * later ones: an asymmetric `a-->b` beside `a-->b {protocol="grpc"}` reads as a bug and
 * hides which is which.
 *
 * The counter behind it only runs for marks that are genuinely indistinguishable.
 *
 * Two callers with different stakes. `longToWide.ts` mints a **field name**, i.e. a real
 * override target, so the ladder's output is user-visible and has to stay stable across
 * responses. `graphWide.ts` mints a `markKey`, an internal item key that is never rendered
 * and never matched against. Sharing the ladder is what stops one response being keyed two
 * different ways depending on whether the pivot ran above the panel.
 */
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

/**
 * `meta` with the contract's `custom.graph` block declaring the endpoint labels the converter
 * *read*, so the panel can still write an ad-hoc filter under the key the datasource knows.
 *
 * The fields this module emits are labelled with the canonical pair — that is the contract —
 * so this declaration is the one thing a pivot destroys and the only thing the panel cannot
 * re-derive. Readers resolve the endpoints by falling through the declared key to the
 * conventional pairs, so declaring the original key is safe as well as useful; see
 * {@link GRAPH_META_CUSTOM}.
 *
 * A no-op for the canonical pair: the block exists to say "these were called something else",
 * and stamping `{sourceKey: 'source'}` on every pivoted frame would be noise in every
 * `Inspect → Data` panel.
 */
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
