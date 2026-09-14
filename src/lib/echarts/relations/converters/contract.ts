import { type DataFrame, type DataFrameType, type Field, FieldType, type Labels } from '@grafana/data';
import { isRecord, stringFrom } from 'lib/echarts/relations/converters/fieldRead';

/**
 * The field-based graph contract itself: its frame-type names, its endpoint label keys,
 * and the readers that turn a `field.name` / `field.labels` pair into the two node ids
 * the mark joins.
 *
 * Spec: ../../../../../data-plane/graph-wide.md.
 *
 * Separate from the reader (`graphWide.ts`) because the contract is what everything
 * *else* addresses: the converters that **write** it read the same keys
 * (`toGraphWide.ts`), the editor's filter labels name the same two, and every test
 * fixture in the family tags a frame with `GRAPH_EDGES_WIDE` / `GRAPH_NODES_WIDE`. A
 * second definition of "which label is the source" is exactly the drift the contract
 * cannot afford.
 */

/** Normative: exactly the three ASCII bytes `2D 2D 3E`. Not `->`, not `→`, not `=>`. */
export const EDGE_SEPARATOR = '-->';

/**
 * Cast because the kind is proposed, not minted: `DataFrameType` in `@grafana/data`
 * 13.1.1 has twelve members and none is graph-related, while `QueryResultMeta.type` is
 * typed as that enum rather than as `string`. Runtime is unaffected — the setter is a
 * plain assignment and every test is a string comparison. The cast disappears the day
 * `DataFrameType.GraphEdgesWide` exists upstream.
 */
// @todo Drop the assertions once `DataFrameType.GraphEdgesWide` / `.GraphNodesWide`
// exist upstream; the kind is proposed, not minted.
// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
export const GRAPH_EDGES_WIDE = 'graph-edges-wide' as DataFrameType;

// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
export const GRAPH_NODES_WIDE = 'graph-nodes-wide' as DataFrameType;

/** The contract spec's versioning rule for a kind that has not stabilised. */
export const GRAPH_TYPE_VERSION: [number, number] = [0, 1];

/**
 * The contract's canonical endpoint keys. Exported because the converters that *write*
 * this contract read the same two keys (`toGraphWide.ts`), and a second definition of
 * "which label is the source" is exactly the drift the contract cannot afford.
 */
export const SOURCE_LABEL = 'source';

export const TARGET_LABEL = 'target';

export const SECONDARYSTAT_LABEL = 'secondarystat';

export const numericFields = (frame: DataFrame): Field[] =>
  frame.fields.filter((field) => field.type === FieldType.number);

/** The two node ids a mark joins. */
export interface GraphEndpoints {
  source: string;
  target: string;
}

/** Which two **label keys** an edge's endpoints were read from. See {@link ENDPOINT_LABEL_PAIRS}. */
export interface GraphEndpointKeys {
  source: string;
  target: string;
}

/** The contract's own pair, which is what every converter *writes*. */
export const CANONICAL_ENDPOINT_KEYS: GraphEndpointKeys = { source: SOURCE_LABEL, target: TARGET_LABEL };

/**
 * The label pairs an edge's endpoints are accepted under, canonical first.
 *
 * The contract's `source`/`target` is what the panel reads and what the converters write,
 * but it is **not** what a datasource emits. Grafana's own service-graph metrics are
 * labelled `client`/`server`, and the query that reaches the panel today is
 *
 *     sum by (source, target) (label_replace(…, "source", "$1", "client", "(.*)"))
 *
 * whose only job is to rename them — and whose side effect is that the *real* key is gone
 * by the time the panel sees the response, so an endpoint filter is written under a label
 * the datasource has never heard of. Recognising the conventional pairs directly means the
 * rename is unnecessary: `sum by (client, server)` draws, and the key survives (see
 * {@link ENDPOINT_LABELS_META}).
 *
 * Deliberately a short, closed list of conventions rather than an option. The supplier
 * context for a panel-registered transformation is `{ series }` only, so no panel option
 * can reach the pivot at all — and a pair that has to be configured is a pair the panel
 * could have been told about by the response instead.
 *
 * Order is precedence: a frame carrying both `source`/`target` and `client`/`server` is
 * read as the contract says, since that is the pair a converter would have written.
 */
export const ENDPOINT_LABEL_PAIRS: readonly GraphEndpointKeys[] = [
  CANONICAL_ENDPOINT_KEYS,
  { source: 'client', target: 'server' },
  { source: 'src', target: 'dst' },
  { source: 'from', target: 'to' },
];

/**
 * Every key any recognised pair uses as an endpoint, so a mark's *other* labels can be told
 * apart from its topology whichever pair the response carried.
 *
 * Lives beside the pairs rather than in its one consumer — the tooltip footer, deciding
 * which of a mark's labels are dimensions rather than topology — because the answer is a
 * property of the pair list and drifts the moment a pair is added.
 */
export const ENDPOINT_LABEL_KEYS: ReadonlySet<string> = new Set(
  ENDPOINT_LABEL_PAIRS.flatMap((pair) => [pair.source, pair.target])
);

/**
 * `frame.meta.custom.graph`, the contract's own block — see *Frame meta* in
 * ../../../../../data-plane/graph-wide.md, which reserves `{ sourceKey?, targetKey? }` for
 * "non-default endpoint label keys, e.g. Tempo's `client` / `server`".
 *
 * It answers **the datasource's** key, which is subtly more than "where the labels are", and
 * deliberately so. A producer emitting the kind natively sets it to where its labels really
 * live, and the reader resolves the endpoints from there. A *converter* rewriting labels to
 * the canonical pair leaves it pointing at the **original** key — the pair it read — because
 * that is the only thing the pivot destroys and the only thing the panel cannot re-derive.
 * Both work off one key because resolution falls through: the declared key, then the
 * conventional pairs, then the name (see {@link endpointLabelsOf}). So a pivoted frame
 * declaring `sourceKey: 'client'` while carrying `source`/`target` labels reads correctly
 * *and* filters correctly.
 *
 * The distinction only matters to the tooltip footer, which has to write an ad-hoc filter
 * under a key the datasource will recognise. Nothing renders differently.
 */
export const GRAPH_META_CUSTOM = 'graph';

/**
 * Marks a `graph-nodes-wide` frame as a **placeholder**: one this plugin synthesised for
 * endpoints the response only implied (`converters/deriveNodes.ts`), rather than one a
 * datasource or a conversion declared.
 *
 * It exists because the pre-pass runs at the *head* of the pipeline, before the user's own
 * transformations, so a response whose real nodes frame is produced downstream — the
 * `instant + organize + rowsToFields` node-stat chain — has no nodes frame at all when the
 * pre-pass looks. The pre-pass then creates one, and a frame that declares
 * `graph-nodes-wide` beats a merely shape-matched one by contract, so the real node stats
 * were dropped in favour of placeholders carrying `null`. That is the exact failure
 * `deriveNodes` avoids when it can see the nodes frame and appends to it; this flag is how
 * the two paths stay equivalent when it cannot.
 *
 * Read in two places, and both are "a placeholder never displaces a real field":
 * {@link findNodesFrames} does not let it act as the declared filter, and
 * {@link readNodeFrames} takes the real field's node whenever both name the same id.
 */
export const GRAPH_META_DERIVED_NODES = 'derivedNodes';

/** Whether a pair is the contract's own, i.e. there is nothing worth declaring. */
export function isCanonicalEndpointKeys(keys: GraphEndpointKeys): boolean {
  return keys.source === SOURCE_LABEL && keys.target === TARGET_LABEL;
}

/**
 * Whether this frame is a placeholder nodes frame from the pre-pass. See
 * {@link GRAPH_META_DERIVED_NODES}.
 */
export function isDerivedNodesFrame(frame: DataFrame): boolean {
  const custom: unknown = isRecord(frame.meta?.custom) ? frame.meta.custom[GRAPH_META_CUSTOM] : undefined;
  return isRecord(custom) && custom[GRAPH_META_DERIVED_NODES] === true;
}

/** The endpoint keys a frame declares in {@link GRAPH_META_CUSTOM}, validated. */
export function declaredEndpointKeys(frame: DataFrame): GraphEndpointKeys | undefined {
  const custom: unknown = isRecord(frame.meta?.custom) ? frame.meta.custom[GRAPH_META_CUSTOM] : undefined;
  if (!isRecord(custom)) {
    return undefined;
  }
  const source = stringFrom(custom.sourceKey);
  const target = stringFrom(custom.targetKey);
  // Half a pair is not a pair: filtering on one declared key and one guessed one would be
  // wrong in a way nothing downstream could notice.
  return source && target ? { source, target } : undefined;
}

/**
 * Which two label keys a field's endpoints are under, or `undefined` for a field that is not
 * an edge. `declared` is its frame's {@link GRAPH_META_CUSTOM} pair and is tried first.
 *
 * Split out from {@link endpointLabelsOf} because the converters need the *keys* as well as
 * the ids: the keys are what they declare, and what they must exclude when working out the
 * label set that tells two parallel edges apart.
 */
export function endpointLabelKeysOf(field: Field, declared?: GraphEndpointKeys): GraphEndpointKeys | undefined {
  const labels = field.labels ?? {};
  if (declared && labels[declared.source] && labels[declared.target]) {
    return declared;
  }
  return ENDPOINT_LABEL_PAIRS.find((pair) => labels[pair.source] && labels[pair.target]);
}

/**
 * Endpoints from a field's **labels** — the primary carrier, and the only one that
 * survives a node id which itself contains the separator.
 *
 * Exported for the converters: reading the endpoints a datasource put in labels is the
 * first half of writing them back under the canonical keys, and both halves have to agree
 * on which keys those are.
 */
export function endpointLabelsOf(field: Field, declared?: GraphEndpointKeys): GraphEndpoints | undefined {
  const keys = endpointLabelKeysOf(field, declared);
  if (!keys) {
    return undefined;
  }
  const labels = field.labels ?? {};
  return { source: labels[keys.source], target: labels[keys.target] };
}

/**
 * Endpoints from an id — the fallback carrier, for sources that cannot emit labels.
 *
 * **First separator wins** by default: `a-->b-->c` is `a` and `b-->c`. Exported so a
 * converter can ask "is this name already an edge id?" with the same test the reader
 * applies.
 *
 * `labels` resolves that ambiguity properly when the mark has any: a name with several
 * separators is split at the point where **both** halves are values the mark actually
 * carries, so a node id containing the separator round-trips. Only a split that matches
 * both halves wins — one matching half is no more evidence than none, since every split of
 * `a-->b-->c` has some half that matches something. Falls back to first-wins, which is what
 * a mark with no labels (the carrier's whole reason to exist) always gets.
 */
export function endpointsFromName(name: string, labels?: Labels): GraphEndpoints | undefined {
  const splits: GraphEndpoints[] = [];
  for (let at = name.indexOf(EDGE_SEPARATOR); at > 0; at = name.indexOf(EDGE_SEPARATOR, at + 1)) {
    const source = name.slice(0, at);
    const target = name.slice(at + EDGE_SEPARATOR.length);
    if (source && target) {
      splits.push({ source, target });
    }
  }
  if (splits.length === 0) {
    return undefined;
  }
  const values = new Set(Object.values(labels ?? {}));
  return splits.find(({ source, target }) => values.has(source) && values.has(target)) ?? splits[0];
}

/** Endpoints from a field, labels first. */
export function endpointsOf(field: Field, declared?: GraphEndpointKeys): GraphEndpoints | undefined {
  return endpointLabelsOf(field, declared) ?? endpointsFromName(field.name, field.labels);
}

/**
 * The keys a field's endpoint **values** are also carried under, when they are not the pair
 * the endpoints were read from — the label `label_replace` *copied* from.
 *
 * This is what makes a multi-level flow filterable with nothing configured. A sankey's two
 * levels are one query whose operands are `or`-joined, each relabelled to the contract's
 * canonical pair:
 *
 *     sum by (source, target, cluster, namespace) (label_replace(label_replace(…)))
 *       or
 *     sum by (source, target, namespace, workload) (label_replace(label_replace(…)))
 *
 * `label_replace` copies rather than moves, so an operand that simply stops aggregating the
 * original away carries both — and the *keys* are then recoverable exactly, per edge, as
 * "whichever labels hold this edge's endpoint values". Two levels resolve to two different
 * pairs with no per-level override and no query restructuring. Neither
 * {@link resolveEndpointLabelKeys} nor the per-mark `custom.sourceFilterLabel` can do that:
 * both are one answer for many marks, and with two levels there is no single answer.
 *
 * Deliberately conservative, because a wrong key filters a dashboard down to nothing:
 *
 * - **both ends or neither.** One matched end is a coincidence, not a pair —
 *   `{source: 'api', target: 'db', job: 'api'}` matches `job` for the source and nothing for
 *   the target, so the canonical pair stands;
 * - **ambiguity records nothing.** Two labels holding the source's value cannot be told
 *   apart, and recording one of two would be wrong for half the response. Declining leaves
 *   the status quo, which is a failure mode the dashboard already survives;
 * - **the pair the endpoints were *read* from is skipped**, since re-reporting it says
 *   nothing. Other recognised endpoint keys are *not* skipped: `server` is half of the
 *   `client`/`server` pair and is also a perfectly ordinary label to relabel a leaf from
 *   (`… → server` in a cluster → namespace → service flow), and excluding it would decline
 *   the exact case this exists for.
 *
 * A **self-loop** has one value for both ends, so the two matches come off one list: the
 * first is the source and the next is the target. Two matches exactly, or it declines —
 * with three there is no reason to prefer any two of them.
 */
export function aliasEndpointKeys(
  field: Field,
  endpoints: GraphEndpoints,
  read?: GraphEndpointKeys
): GraphEndpointKeys | undefined {
  const candidates = Object.entries(field.labels ?? {}).filter(([key]) => key !== read?.source && key !== read?.target);
  const matching = (value: string): string[] => candidates.filter(([, held]) => held === value).map(([key]) => key);

  if (endpoints.source === endpoints.target) {
    const both = matching(endpoints.source);
    return both.length === 2 ? { source: both[0], target: both[1] } : undefined;
  }
  const sources = matching(endpoints.source);
  const targets = matching(endpoints.target);
  if (sources.length !== 1 || targets.length !== 1) {
    return undefined;
  }
  return { source: sources[0], target: targets[0] };
}
