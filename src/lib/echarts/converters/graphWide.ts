import {
  type DataFrame,
  DataFrameType,
  type Field,
  FieldType,
  formattedValueToString,
  getFieldColorMode,
  type GrafanaTheme2,
  type Labels,
  type ReduceDataOptions,
  reduceField,
  ReducerID,
} from '@grafana/data';
import { type GraphFieldConfig } from '@grafana/schema';
import { debug, LOG_LEVELS } from 'development';
import { type EChartsRelationsFieldConfig } from 'editor/types';
import {
  type MarkStat,
  type NodeGraphData,
  type RelationLink,
  type RelationNode,
} from 'lib/echarts/converters/relationsModel';
import { contestedIds, edgeId, numberAt, uniqueId, withoutEndpoints } from 'lib/echarts/converters/toGraphWide';
import { getPaletteColorByIndex } from 'lib/echarts/style';
import { type ConfigTypedField } from 'lib/grafana/types';

/**
 * Reader for the field-based graph contract: **one node is one field, one edge is one
 * field**. Identity is `field.name`, topology is in `field.labels`, and everything else
 * — colour, unit, decimals, links, per-mark style — is ordinary `fieldConfig`.
 *
 * Spec: ../../../../data-plane/graph-wide.md. This is the family's only reader; the
 * row-based format is converted to this one above the panel (`legacyToWide.ts`).
 *
 * The payoff is that every mark is an override target, because a field is the unit
 * Grafana's whole configuration pipeline already addresses. That only pays off when the
 * frames were made wide **above** the panel, before `applyFieldOverrides`.
 *
 * **A role is one-to-many.** Every frame that passes the shape test contributes its
 * marks, not just the first — the contract's *Multi* row-dimension variant, and the shape
 * any labelled datasource returns without transformation (N frames of `[Time, Value]`,
 * endpoints on each `Value`). The single-frame reading drew a one-edge graph from a
 * ten-series response with no error anywhere, and it could not be fixed above the panel:
 * the conversion prefix is feature-detected *and* gated behind `panelPluginTransformations`,
 * which is off by default (`lib/grafana/panelDataTransformations.ts`), so on a stock host
 * the reader is the entire data path. Two edges frames from two queries are also something
 * no core transformation can union.
 *
 * What the prefix still buys is **identity**, not topology: only a transformation running
 * before `applyFieldOverrides` can turn a model id into a real `field.name`, i.e. into
 * something a `byName` override, the override picker and the legend can address. N raw
 * frames whose value field is called `Value` are N marks with one id — see
 * {@link assignMarkKeys} for the one thing that actually breaks, and the contract's
 * *Identity* section for what stays lost.
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
const SECONDARYSTAT_LABEL = 'secondarystat';

/** Reducer used when the panel has no `reduceOptions.calcs`. */
export const RELATIONS_CALC_DEFAULT = ReducerID.lastNotNull;

const numericFields = (frame: DataFrame): Field[] => frame.fields.filter((field) => field.type === FieldType.number);

/**
 * The reducers a mark uses, first one guaranteed: `calcs[0]` is the **main stat** and the
 * rest are extra tooltip rows.
 *
 * Only the first is structurally singular, and it is singular for a reason a cap cannot be
 * put on the others: `calcs[0]` is the number that sizes a node, colours it, and weighs an
 * edge or a sankey ribbon — a chart has one geometry. Everything after it has nowhere to go
 * but the tooltip, which has as many rows as it needs, so nothing is truncated.
 *
 * `reduceOptions.values` is not honoured: "all values" would mean one mark per row, and a
 * mark is a field by contract. No editor offers it for this family.
 */
export function normalizeRelationsCalcs(reduceOptions: ReduceDataOptions | undefined): string[] {
  const calcs = reduceOptions?.calcs ?? [];
  return calcs.length > 0 ? [...calcs] : [RELATIONS_CALC_DEFAULT];
}

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
 * ../../../../data-plane/graph-wide.md, which reserves `{ sourceKey?, targetKey? }` for
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
function endpointsOf(field: Field, declared?: GraphEndpointKeys): GraphEndpoints | undefined {
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

/**
 * True when a frame's numeric fields describe edges.
 *
 * `meta.type` is authoritative in **both** directions, which is the contract's
 * precedence rule taken seriously: a frame that declares itself as nodes is never
 * claimed as edges, however its fields happen to be named. Without that guard a node
 * legitimately called `a-->b` would be read as an edge and the frame would be its own
 * edges frame. The shape test is only consulted for a frame that declares nothing.
 */
export function isEdgesWideFrame(frame: DataFrame): boolean {
  if (frame.meta?.type === GRAPH_EDGES_WIDE) {
    return true;
  }
  if (frame.meta?.type === GRAPH_NODES_WIDE) {
    return false;
  }
  const numeric = numericFields(frame);
  const declared = declaredEndpointKeys(frame);
  return numeric.length > 0 && numeric.some((field) => endpointsOf(field, declared) != null);
}

/**
 * Frame role resolution, in the contract's precedence order: `meta.type` first, field
 * shape second. (The third signal, a panel-option refId picker, is not implemented.)
 *
 * An edges frame is required — a lone nodes frame is a table, not a graph, exactly as
 * in the row form.
 */
export function isGraphWideFrames(frames: DataFrame[]): boolean {
  return frames.some(isEdgesWideFrame);
}

/**
 * **Every** edges frame in the response, not the first.
 *
 * A response whose edges arrive as N single-series frames is the contract's *Multi* row
 * variant, and it is what `sum by (source, target) (…)` in `Format: Time series` returns
 * from any labelled datasource. Each of those frames passes {@link isEdgesWideFrame} on
 * its own, so a `.find()` here silently threw away every edge but one.
 *
 * **Declared wins as a filter, not as a find.** When any frame declares
 * `graph-edges-wide`, only declared frames are collected and the shape test is not
 * consulted at all. Three reasons: it is what keeps a declared frame beating a lookalike
 * (the single-frame rule generalised); it keeps `meta.type` authoritative in the negative
 * direction, so a frame that says what it is never gets mixed with frames that were merely
 * guessed at; and it makes the reader agree with the pivot about one response, since
 * `longEdgeSeries` (`longToWide.ts`) also declines the whole response when something else
 * is already the edges frame.
 */
function findEdgesFrames(frames: DataFrame[]): DataFrame[] {
  const declared = frames.filter((frame) => frame.meta?.type === GRAPH_EDGES_WIDE);
  return declared.length > 0 ? declared : frames.filter((frame) => isEdgesWideFrame(frame));
}

/**
 * The nodes frames: declared by `meta.type`, else frames whose numeric fields actually
 * name nodes the edges refer to.
 *
 * That second test matters. "Any other frame with a numeric field" would read an
 * unrelated series in a mixed response as a node list — a second query returning
 * `cpu` would silently add a disconnected `cpu` node to the graph. Requiring at least
 * one field name to be a known endpoint is the wide equivalent of the row form's
 * "a nodes frame must have an `id` column".
 *
 * Plural for the same reason as {@link findEdgesFrames}: `legacyToWide` converts *every*
 * legacy nodes frame it finds, so a two-query legacy response produces two
 * `graph-nodes-wide` frames of which the reader used to read one. Where two of them
 * declare the same node, the first field wins (`readNodeFrames`) — a node id is the
 * ECharts graph key, so the reader has to pick one and picking by response order is the
 * only stable answer.
 *
 * The exclusion is `isEdgesWideFrame`, i.e. **every** edges candidate, collected or not:
 * a shape-matched frame passed over because something else declared itself is not a
 * fallback nodes frame either.
 *
 * **A placeholder frame does not act as the filter.** The pre-pass declares
 * `graph-nodes-wide` for endpoints the response only implied, and it runs before the user's
 * transformations — so on the node-stat chain (`instant + organize + rowsToFields`) the only
 * declared frame is the placeholder and the real nodes frame is merely shape-matched. Letting
 * the placeholder filter would drop every real node stat in favour of a field holding `null`,
 * which is the one thing {@link GRAPH_META_DERIVED_NODES} exists to prevent. Placeholders are
 * therefore collected *in addition to* the shape-matched frames, and kept first so the node
 * order stays the endpoint order (see {@link endpointNames}).
 */
function findNodesFrames(frames: DataFrame[], endpoints: ReadonlySet<string>): DataFrame[] {
  const declared = frames.filter((frame) => frame.meta?.type === GRAPH_NODES_WIDE);
  if (declared.some((frame) => !isDerivedNodesFrame(frame))) {
    return declared;
  }
  const matched = frames.filter(
    (frame) =>
      !declared.includes(frame) &&
      !isEdgesWideFrame(frame) &&
      numericFields(frame).some((field) => endpoints.has(field.name))
  );
  return [...declared, ...matched];
}

/**
 * Every node id the edges frames refer to, for the nodes-frame shape test.
 *
 * Exported for `deriveNodes.ts`, which needs the same union to decide which endpoints the
 * response never declared — and must compute it the way the reader does, or the pre-pass
 * would create a field for a node the reader does not believe in (or miss one it does).
 * Insertion order is the reader's own — source then target, edges frame by edges frame —
 * and is load-bearing: it is the order `deriveNodesFromLinks` derives in, so the palette
 * colour a node ends up with does not depend on whether the pre-pass ran.
 */
export function endpointNames(edgesFrames: DataFrame[]): Set<string> {
  const names = new Set<string>();
  for (const frame of edgesFrames) {
    const declared = declaredEndpointKeys(frame);
    for (const field of numericFields(frame)) {
      const endpoints = endpointsOf(field, declared);
      if (endpoints) {
        names.add(endpoints.source);
        names.add(endpoints.target);
      }
    }
  }
  return names;
}

/**
 * The **datasource's** endpoint label keys for this response, or `undefined` when they are
 * the contract's own and there is nothing to translate.
 *
 * Two carriers, in order:
 *
 * - the frame's declared {@link GRAPH_META_CUSTOM} pair. The only carrier that survives a
 *   pivot, whose output is canonical by definition;
 * - the keys the edge fields still carry, for a response that reached the panel unconverted
 *   — a datasource emitting `graph-edges-wide` natively, `rowsToFields` over a table that
 *   kept its label columns, or a host that cannot run the prefix at all.
 *
 * Consumed by the tooltip footer, which writes ad-hoc filters under these keys rather than
 * under the contract's: `source="web-api"` is a filter on a label the datasource dropped.
 * Overridable per mark (`custom.sourceFilterLabel`) for the case no response can answer —
 * a query that aggregated the original key away. See `relationsFilterLabels`.
 */
export function resolveEndpointLabelKeys(edgesFrames: DataFrame[]): GraphEndpointKeys | undefined {
  for (const frame of edgesFrames) {
    const declared = declaredEndpointKeys(frame);
    if (declared && !isCanonicalEndpointKeys(declared)) {
      return declared;
    }
  }
  for (const frame of edgesFrames) {
    for (const field of numericFields(frame)) {
      const keys = endpointLabelKeysOf(field);
      if (keys && !isCanonicalEndpointKeys(keys)) {
        return keys;
      }
    }
  }
  return undefined;
}

/**
 * The one place frame roles are decided, so nothing downstream can disagree about which
 * frame is which. Exported for its own tests: the reader is now the only caller, since
 * the frame-level value-field lookups the options layer used to need are gone — every
 * mark carries its own field (see `getRelationsTooltipMarks`).
 *
 * A role maps to a **list** of frames. The contract's precedence rule is unchanged by
 * that — `meta.type` first, field shape second — it never said one frame per role.
 */
export function resolveGraphWideRoles(
  frames: DataFrame[]
): { edgesFrames: DataFrame[]; nodesFrames: DataFrame[] } | null {
  const edgesFrames = findEdgesFrames(frames);
  if (edgesFrames.length === 0) {
    return null;
  }
  return { edgesFrames, nodesFrames: findNodesFrames(frames, endpointNames(edgesFrames)) };
}

/**
 * Whether **no** node in this response has a stat of its own — so "Show node values"
 * would add nothing whatever it is switched to.
 *
 * Two ways that happens, and both are the same fact: the node was never declared, only
 * implied by an edge's endpoints. Either no nodes frame reached the panel at all (the
 * reader invents the whole node set — `deriveNodesFromLinks`), or the pre-pass declared
 * them as fields above the panel and those fields carry `null` for every row by design
 * (`converters/deriveNodes.ts` — a degree is not a measurement).
 *
 * Answers **false whenever it cannot tell**, which is the important half: this drives an
 * editor `showIf`, and hiding a working control is worse than showing an inert one. A
 * response that is not the wide contract at all (the row form, on a host that cannot run
 * the pre-pass) therefore keeps the control.
 *
 * Reads values rather than reducing them: any reducer of an all-null field is null, and
 * "has a value at all" is the question. Short-circuits on the first one found.
 */
export function hasNoNodeStats(frames: DataFrame[] | undefined): boolean {
  const roles = frames != null && frames.length > 0 ? resolveGraphWideRoles(frames) : null;
  if (roles == null) {
    return false;
  }
  const nodeFields = roles.nodesFrames.flatMap(numericFields);
  if (nodeFields.length === 0) {
    // No declared nodes, but edges to derive them from: every node will be derived.
    return true;
  }
  return !nodeFields.some((field) => field.values.some((value) => value != null));
}

/**
 * How a mark's value is read: **reduced over its rows**, or **taken at one row**.
 *
 * The row dimension is the only thing a mark has more than one of, so this is the whole
 * question the reader asks of it. `reduce` collapses every value to one stat by
 * `reduceOptions.calcs`, `lastNotNull` by default. `at` is the time slider's: one row,
 * chosen by timestamp and resolved **per frame**, because a ragged response shares no row
 * grid. See {@link graphWideTimeline}.
 */
type MarkRead =
  /**
   * `calcs[0]` is the main stat and the rest are extra tooltip rows, as everywhere else.
   * Also the reading a frame with **no row dimension** keeps under the slider, having no row
   * to select by time — see `readFor`.
   */
  | { kind: 'reduce'; calcs: readonly string[] }
  /** `null` when this frame has no sample at the selected timestamp — every mark reads null. */
  | { kind: 'at'; row: number | null };

/** Reduce a mark's values to one of its stats. On instant data every reducer agrees. */
function reduceValue(field: Field, calc: string): number | null {
  const value: unknown = reduceField({ field, reducers: [calc] })[calc];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** A mark's value under the reading in force — see {@link MarkRead}. */
function markValue(field: Field, markRead: MarkRead): number | null {
  if (markRead.kind === 'reduce') {
    return reduceValue(field, markRead.calcs[0]);
  }
  return markRead.row == null ? null : numberAt(field, markRead.row);
}

/**
 * The row a mark's data link interpolates against — see `readLinks`.
 *
 * Row 0 under `reduce`: there is no one row a mean came from. Under `at` it is the
 * selected row, and 0 again when the frame has no sample there, so an interpolated link
 * still resolves.
 */
function sourceRowOf(markRead: MarkRead): number {
  return markRead.kind === 'at' ? (markRead.row ?? 0) : 0;
}

/** The row dimension of a frame — the time column a ranged response carries. */
function rowDimension(frame: DataFrame): Field | undefined {
  return frame.fields.find((field) => field.type === FieldType.time);
}

/**
 * The data-plane kinds that declare **no row dimension**: numbers, one per series, with no
 * time axis. https://grafana.com/developers/dataplane/numeric
 */
const NUMERIC_FRAME_TYPES: ReadonlySet<string> = new Set([
  DataFrameType.NumericWide,
  DataFrameType.NumericMulti,
  DataFrameType.NumericLong,
]);

/**
 * Does this frame have **nothing to select by time** — one reading, true for the whole
 * range?
 *
 * Not the same question as "has a time field", and that is the trap. A Prometheus *instant*
 * query answers `numeric-multi` and still ships a `Time` column: one row, stamped with the
 * **evaluation instant**. That instant is `now`, so it lands nowhere near the step grid a
 * ranged query returns — which made a mixed response (ranged edges beside an instant nodes
 * query, exactly how a service graph carries per-node error ratios) lose every node the
 * moment the time slider was switched on. `rowAt` matched no row, every node read `null`,
 * and a `null` node is not just a missing tooltip row: a by-value scheme has no value to
 * grade, so `colorOf` returns nothing and `fillPaletteColors` hands the node a palette slot
 * instead — the reported symptom was "thresholds stop working under the slider".
 *
 * So the *declared kind* decides, not the columns. A numeric frame's time column is a
 * timestamp **about** the reading rather than an axis through it, and the reading is the
 * same at every stop.
 *
 * Shape alone cannot answer this. "One row" is the tempting test and it is wrong: a raw
 * ragged response is N frames of one sample each, and there a missing sample at the selected
 * stop really is `null` — no carry-forward, which is what keeps a scrubbed edge honest. The
 * kind is what separates "one sample of a series" from "one number for the range".
 *
 * A frame whose datasource declares nothing keeps the old reading, so nothing regresses on
 * a response this cannot classify.
 */
function isTimelessFrame(frame: DataFrame): boolean {
  const type = frame.meta?.type;
  return rowDimension(frame) == null || (type != null && NUMERIC_FRAME_TYPES.has(type));
}

/**
 * Every timestamp this response carries, ascending and deduped — the stops a time slider
 * can select. **Empty on instant data**, which is what hides the control there.
 *
 * A union across every role frame rather than one frame's column, for the same reason
 * `longToWide.ts:joinedRows` unions before pivoting: a series with a gap is shorter than its
 * siblings, and the raw shape shares no row grid at all, so no single column is the
 * timeline. Kept separate from that one — the pivot runs above the panel, on frames this
 * reader may never be handed.
 */
export function graphWideTimeline(frames: DataFrame[]): number[] {
  return [...collectStops(frames)].sort((first, second) => first - second);
}

/**
 * The distinct timestamps every role frame carries, **stopping as soon as `limit` of them
 * are known**.
 *
 * The limit is what lets {@link hasGraphTimeline} answer a yes/no question without walking
 * a ranged response end to end: it runs from an editor `showIf`, which is re-evaluated on
 * every keystroke in the options pane, where {@link graphWideTimeline} runs once per render
 * behind a memo.
 */
function collectStops(frames: DataFrame[], limit = Infinity): Set<number> {
  const stops = new Set<number>();
  const roles = frames.length > 0 ? resolveGraphWideRoles(frames) : null;
  if (roles == null) {
    return stops;
  }
  for (const frame of [...roles.edgesFrames, ...roles.nodesFrames]) {
    // A timeless frame contributes nothing to scrub *through*, however its datasource
    // stamped it. An instant Prometheus query ships one row stamped `now`, which would
    // otherwise become a stop of its own — one sitting off the ranged frames' step grid,
    // where every edge reads null and the graph goes weightless. Two instant queries with
    // different evaluation instants would even raise a slider on a response that has no
    // timeline at all, which is the opposite of what this function promises above.
    const time = isTimelessFrame(frame) ? undefined : rowDimension(frame);
    for (let row = 0; row < (time?.values.length ?? 0); row++) {
      const at = numberAt(time, row);
      if (at != null) {
        stops.add(at);
        if (stops.size >= limit) {
          return stops;
        }
      }
    }
  }
  return stops;
}

/**
 * Whether this response has **somewhere to scrub to** — a row dimension carrying more than
 * one distinct timestamp. Drives the "Time slider" control's visibility.
 *
 * Answers `false` when it cannot tell. Unlike {@link hasNoNodeStats}, where `false` keeps
 * its control, the cautious answer here would show the switch on every instant panel, where
 * turning it on hides the reducer picker and produces nothing but an advisory. Hiding is
 * safe because the control's `showIf` keeps a switch that is *already on* visible.
 */
export function hasGraphTimeline(frames: DataFrame[] | undefined): boolean {
  return frames != null && collectStops(frames, 2).size > 1;
}

/**
 * The row this frame carries `at` on, or `null` when it has no sample there.
 *
 * Resolved per frame, which is the only correct resolution for a ragged response: row 4
 * of a 57-row series and row 4 of a one-row series are not the same instant. A shared row
 * index would silently read one mark at another mark's timestamp.
 */
function rowAt(frame: DataFrame, at: number): number | null {
  const time = rowDimension(frame);
  for (let row = 0; row < (time?.values.length ?? 0); row++) {
    if (numberAt(time, row) === at) {
      return row;
    }
  }
  return null;
}

/**
 * A mark's colour, resolved through its own display processor.
 *
 * This is the whole point of the pivot: `field.display` is what `applyFieldOverrides`
 * left behind, so a `byName` override, a fixed colour and a by-value scheme all arrive
 * here already resolved — no separate resolver, all eight modes for free. Falls back to
 * the configured fixed colour when the override pass has not run (unit tests, and any
 * caller upstream of the pipeline).
 */
function colorOf(field: Field, value: number | null): string | undefined {
  return field.display ? field.display(value).color : field.config.color?.fixedColor;
}

/**
 * The prefix every palette mode's id carries, checked ahead of the registry so a palette
 * added upstream after this build is still recognised as one. See {@link isPaletteColorMode}.
 */
const PALETTE_MODE_PREFIX = 'palette-';

/**
 * Is this colour mode a **palette** — a colour picked by the field's position among its
 * siblings, or by a hash of its name?
 *
 * This is the gate on per-edge colour, and a palette is the one class of mode an edge
 * does not read. For a **node** a palette is exactly right: it reproduces the per-node
 * colouring the family has always drawn. For an **edge** it is not a colour choice at
 * all — a series index says nothing about which two nodes the edge joins — so a palette
 * counts as "nothing configured" and the edge falls through to `relationsLinkColor`.
 * Every other mode is read: a literal colour (`fixed`, `shades`, `gradient`) is a
 * decision about this mark, and a by-value scheme (`thresholds`, `continuous-*`) grades
 * the edge by its own weight, which is a thing only the edge can say. Both therefore
 * beat the endpoint colouring, and under a by-value scheme "Link color" has nothing left
 * to decide — which is what its description now says, since no `showIf` can see
 * `fieldConfig` to hide it.
 *
 * Two tests, because neither is sufficient alone:
 *
 * - the **registry** classifies a known id — `isByValue` marks the value-derived modes
 *   and `getColors` marks the scheme-backed ones, so the pair `isByValue !== true` and
 *   `getColors != null` is exactly the index/name palettes (`palette-classic`,
 *   `-by-name`, `-colorblind`, `-saturated`, 13.3's `palette-categorical-next*`).
 *   `getColors` alone would not do: it is a *method* on `FieldColorSchemeMode`, so the
 *   `continuous-*` modes carry one too.
 * - the **prefix** catches an id this build has never heard of, which the registry
 *   cannot: `getFieldColorMode` answers an unknown id with the `thresholds` mode, so a
 *   palette shipped upstream after this build would otherwise be read as by-value and
 *   would colour every edge — the exact bug this replaced, which was a two-entry list of
 *   `palette-classic` and `palette-classic-by-name` that left `palette-colorblind` and
 *   the categorical palettes silently turning "Link color" off for the whole panel.
 */
function isPaletteColorMode(mode: string | undefined): boolean {
  if (mode == null) {
    return true;
  }
  if (mode.startsWith(PALETTE_MODE_PREFIX)) {
    return true;
  }
  const colorMode = getFieldColorMode(mode);
  return colorMode.isByValue !== true && colorMode.getColors != null;
}

/**
 * An edge's **own** colour, or `undefined` to leave it to `relationsLinkColor`. See
 * {@link isPaletteColorMode}, and `resolveLinkColor` for where the fall-through lands.
 */
function edgeColorOf(field: Field, value: number | null): string | undefined {
  return isPaletteColorMode(field.config.color?.mode) ? undefined : colorOf(field, value);
}

/**
 * A mark's `custom` config, read defensively: `FieldConfig['custom']` is `any`, and the
 * per-mark keys this contract defines are plugin-declared rather than guaranteed by any
 * type. Every read below is narrowed individually.
 */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null;
}

function customOf(
  field: ConfigTypedField<number | string, EChartsRelationsFieldConfig>
): Readonly<EChartsRelationsFieldConfig> {
  const custom = field.config.custom;
  return isRecord(custom) ? custom : {};
}

function numberFrom(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * Whether the mark's own field is hidden from the visualization.
 *
 * The standard `custom.hideFrom.viz` config, read straight off the field — which is
 * only meaningful because a mark *is* a field: Grafana's override engine matched and
 * applied it upstream, so both the legend's visibility toggle and a hand-written
 * `byName` "Hide in area" override arrive here already resolved onto the right mark.
 */
function isHiddenFrom(field: ConfigTypedField<number | string, GraphFieldConfig>): boolean {
  const hideFrom = customOf(field).hideFrom;
  return isRecord(hideFrom) && hideFrom.viz;
}

function stringFrom(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/**
 * The mark's stats past the first, one per reducer, as display strings.
 *
 * Formatted through the mark's **own** display processor rather than the panel's shared
 * formatter, so two nodes can carry different units — which the row form cannot express at
 * all. Each keeps the reducer that produced it, so a calc that reduces to nothing on this
 * mark drops its row without shifting the labels of the rows after it.
 *
 * Falls back to the `secondarystat` label the conversion carries for row input — one value,
 * with no calculation behind it — and only when no reducer produced anything: an instant
 * response has no second value to reduce, so that label *is* the secondary stat there.
 */
function secondaryStatsOf(field: Field, markRead: MarkRead): MarkStat[] {
  const stats: MarkStat[] = [];
  // None of its own at a selected row: every reducer agrees over one value, so the extra
  // calcs would render as duplicate tooltip rows. The label fallback below still applies.
  for (const calc of markRead.kind === 'reduce' ? markRead.calcs.slice(1) : []) {
    const value = reduceValue(field, calc);
    if (value != null) {
      stats.push({ calc, value: field.display ? formattedValueToString(field.display(value)) : String(value) });
    }
  }
  if (stats.length > 0) {
    return stats;
  }
  const legacy = stringFrom(field.labels?.[SECONDARYSTAT_LABEL]);
  return legacy != null ? [{ value: legacy }] : [];
}

/**
 * The keys **this edge's** endpoints filter under, as far as the response can say. Three
 * carriers, most authoritative first, and every one of them is per edge:
 *
 * - the frame's {@link GRAPH_META_CUSTOM} declaration, the only carrier that survives a
 *   pivot — but frame-wide, so a response mixing pairs records none (`commonEndpointKeys`);
 * - the field's own non-canonical pair, for a response that reached the panel unconverted;
 * - the alias recovered from the field's values ({@link aliasEndpointKeys}), which is the
 *   only one of the three that can answer differently for two edges of one frame.
 *
 * Undefined means "nothing but the contract's own pair", which the tooltip already treats
 * as the fallback — so an edge that answers nothing costs nothing.
 */
function edgeFilterLabels(
  field: Field,
  endpoints: GraphEndpoints,
  read: GraphEndpointKeys | undefined,
  declared: GraphEndpointKeys | undefined
): { keys: GraphEndpointKeys; recovered: boolean } | undefined {
  if (declared && !isCanonicalEndpointKeys(declared)) {
    return { keys: declared, recovered: false };
  }
  const own = endpointLabelKeysOf(field);
  if (own && !isCanonicalEndpointKeys(own)) {
    return { keys: own, recovered: false };
  }
  const alias = aliasEndpointKeys(field, endpoints, read);
  return alias ? { keys: alias, recovered: true } : undefined;
}

function readLinks(frame: DataFrame, markRead: MarkRead, recovered: Set<RelationLink>): RelationLink[] {
  const links: RelationLink[] = [];
  // The frame's own answer to "which labels are the endpoints", tried ahead of the
  // conventional pairs. See `GRAPH_META_CUSTOM`.
  const declared = declaredEndpointKeys(frame);

  for (const field of numericFields(frame)) {
    // The pair the endpoints were *read* from, which the recovery has to skip: reporting
    // back the key it read the value out of would say nothing.
    const read = endpointLabelKeysOf(field, declared);
    const endpoints = endpointsOf(field, declared);
    if (!endpoints) {
      continue;
    }

    const value = markValue(field, markRead);
    const custom = customOf(field);
    const link: RelationLink = {
      id: field.name,
      source: endpoints.source,
      target: endpoints.target,
      // The weight is the field's own value. `thickness`'s old role as a weight
      // fallback belongs to the conversion now; here a mark is numeric by contract.
      // A field with no samples at all reduces to `null` and draws a weightless edge
      // rather than disappearing: the frame still claimed to describe this edge.
      value: value ?? 1,
      // The row the value was read from. Only `at` makes this exact: under `reduce` it is
      // row 0, so a data link interpolating `${__value.numeric}` disagrees with the
      // tooltip on ranged data. Not fixable there — "the row the reducer picked" is well
      // defined for first/last/min/max and meaningless for mean/sum.
      sourceRowIndex: sourceRowOf(markRead),
      field,
    };

    const filterLabels = edgeFilterLabels(field, endpoints, read, declared);
    if (filterLabels != null) {
      link.filterLabels = filterLabels.keys;
      if (filterLabels.recovered) {
        recovered.add(link);
      }
    }

    const color = edgeColorOf(field, value);
    if (color != null) {
      link.color = color;
    }
    const width = numberFrom(custom.lineWidth);
    if (width != null) {
      link.width = width;
    }
    const lineType = stringFrom(custom.lineType);
    if (lineType === 'solid' || lineType === 'dashed' || lineType === 'dotted') {
      link.lineType = lineType;
    }
    const curveness = numberFrom(custom.curveness);
    if (curveness != null) {
      link.curveness = curveness;
    }
    // The same extra reducers the nodes get: on an edges-only response, which is the
    // common shape, the edges are the only marks a second calculation can reach.
    const secondaries = secondaryStatsOf(field, markRead);
    if (secondaries.length > 0) {
      link.secondaries = secondaries;
    }
    if (isHiddenFrom(field)) {
      link.hidden = true;
    }
    links.push(link);
  }

  return links;
}

/**
 * Give every mark in a collision its own lookup key — and **only** that.
 *
 * `id` stays `field.name`, always. That is the contract's first sentence, and the reason
 * to keep it under duplication is that a minted id would be a lie: `byName`/`byNames`
 * compare against `field.name` or the display name, so a synthetic `a-->b` is not an
 * override target, is not what the override picker lists, and — worst — would break
 * `getOverrideTargetNames`, whose output feeds an *exclude* matcher. Emit an id no field
 * answers to there and hiding one node hides every link in the panel.
 *
 * Duplicated ids are harmless to everything else: ECharts resolves links by
 * `source`/`target`, the cycle policy keys on the endpoints, the value comes off the item,
 * and per-edge hiding reads the mark's own field. Exactly one consumer is wrong —
 * `getRelationsTooltipMarks` keys its link map by id, so with N marks called `Value` the
 * last one's unit, decimals and `config.links` would be served to all N. `markKey` is that
 * map's key, and nothing else: it is never rendered (an edge's tooltip header is
 * `source → target`) and never matched against, which is why the reader may mint it when
 * it may not mint an id.
 *
 * The ladder is `longToWide`'s, shared from `toGraphWide.ts`, so one response is not keyed
 * two different ways depending on whether the pivot ran: endpoints, then the label set
 * that tells parallel edges apart, then `#n`. Every id is reserved up front, colliding or
 * not, because a mark that keeps its id is still looked up by it.
 */
function assignMarkKeys(links: RelationLink[]): void {
  const colliding = contestedIds(links.map((link) => link.id));
  if (colliding.size === 0) {
    return;
  }

  const taken = new Set(links.map((link) => link.id));
  const keyed = links.filter((link) => colliding.has(link.id));
  const bases = keyed.map((link) => edgeId(link.source, link.target));
  const contested = contestedIds(bases);
  keyed.forEach((link, index) => {
    const base = bases[index];
    // The mark's *own* endpoint keys: an unconverted `client`/`server` response reaches the
    // reader with those still in place, and they are the endpoints, not a discriminator.
    // A recovered pair is dropped for the same reason — a query that kept `cluster` and
    // `namespace` beside the canonical pair is carrying its topology twice, not carrying a
    // label that tells two parallel edges apart.
    const endpointKeys = link.field ? endpointLabelKeysOf(link.field) : undefined;
    const rest = withoutEndpoints(withoutEndpoints(link.field?.labels, endpointKeys), link.filterLabels);
    const key = uniqueId(taken, base, rest, contested.has(base));
    taken.add(key);
    link.markKey = key;
  });

  debug(`Colliding edges: ${keyed.length} edges with colliding names: ${[...colliding].join(', ')}`, LOG_LEVELS.warn, {
    ids: [...colliding],
    markKeys: keyed.map((link) => link.markKey),
  });
}

function readNodes(frame: DataFrame, markRead: MarkRead): RelationNode[] {
  const nodes: RelationNode[] = [];

  for (const field of numericFields(frame)) {
    const value = markValue(field, markRead);
    const custom = customOf(field);
    const node: RelationNode = {
      id: field.name,
      // `config.displayName` is the contract's `title`. Deliberately not
      // `getFieldDisplayName`, which appends the label set.
      name: field.config.displayName ?? field.name,
      value,
      sourceRowIndex: sourceRowOf(markRead),
      field,
    };

    const color = colorOf(field, value);
    if (color != null) {
      node.color = color;
    }
    const subtitle = stringFrom(custom.subtitle);
    if (subtitle != null) {
      node.subtitle = subtitle;
    }
    const radius = numberFrom(custom.nodeRadius);
    if (radius != null) {
      node.radius = radius;
    }
    const fixedX = numberFrom(custom.fixedX);
    if (fixedX != null) {
      node.fixedX = fixedX;
    }
    const fixedY = numberFrom(custom.fixedY);
    if (fixedY != null) {
      node.fixedY = fixedY;
    }
    const secondaries = secondaryStatsOf(field, markRead);
    if (secondaries.length > 0) {
      node.secondaries = secondaries;
    }
    if (isHiddenFrom(field)) {
      node.hidden = true;
    }
    nodes.push(node);
  }

  return nodes;
}

/**
 * Every declared node, across every nodes frame, **first field per id winning** — except
 * that a real field always beats a placeholder one.
 *
 * A node id is the ECharts graph key that each edge's `source`/`target` resolves against,
 * so two frames declaring the same node is a genuine collision rather than a display
 * problem — there is one node either way. Response order decides, which is the only
 * stable answer available and matches the reader's "first appearance" rule for derived
 * nodes.
 *
 * The one exception is not really a collision. A placeholder field
 * ({@link GRAPH_META_DERIVED_NODES}) carries `null` by construction and exists only so the
 * override engine had something to match; a real field for the same id is what the response
 * actually measured, and it wins however the frames are ordered. Position still comes from
 * response order, so the placeholder keeps holding the node's slot — which is what keeps the
 * palette colours identical to the path where the pre-pass never ran.
 */
function readNodeFrames(frames: DataFrame[], readFor: (frame: DataFrame) => MarkRead): RelationNode[] {
  const perFrame = frames.map((frame) => ({
    placeholder: isDerivedNodesFrame(frame),
    nodes: readNodes(frame, readFor(frame)),
  }));

  const measured = new Map<string, RelationNode>();
  for (const { placeholder, nodes } of perFrame) {
    if (placeholder) {
      continue;
    }
    for (const node of nodes) {
      if (!measured.has(node.id)) {
        measured.set(node.id, node);
      }
    }
  }

  const nodes: RelationNode[] = [];
  const known = new Set<string>();
  for (const frame of perFrame) {
    for (const node of frame.nodes) {
      if (!known.has(node.id)) {
        known.add(node.id);
        nodes.push(measured.get(node.id) ?? node);
      }
    }
  }
  return nodes;
}

/**
 * Give every node a color, so none falls through to ECharts' own palette — which is
 * not the theme's.
 *
 * A node that *has* a field is already colored by `colorOf`, and that is the whole
 * color path: whatever `applyFieldOverrides` resolved onto the field arrives here
 * done. This fills the two cases where there is nothing to read. A node **derived**
 * from an edge's endpoints has no field at all, and a field seen upstream of the
 * override pass (unit tests, a bare `PanelRenderer`) may carry no color choice. Both
 * take the classic palette by position, which is the family's long-standing default
 * for "nothing configured".
 *
 * Runs once the node list is final, so the index is the one the legend and every
 * render variant see. It is also the index *before* the legend hides anything
 * (`withoutHiddenNodes` filters afterwards), so toggling a node off does not shift
 * the colours of the ones below it.
 */
function fillPaletteColors(nodes: RelationNode[], theme: GrafanaTheme2): void {
  nodes.forEach((node, index) => {
    if (node.color == null) {
      node.color = getPaletteColorByIndex(index, theme);
    }
  });
}

/**
 * Node set from the links alone, for an edges-only response.
 *
 * The reader's own fallback for a host that cannot run the pre-pass which would have made
 * these nodes real fields (`deriveNodes.ts`, gated behind `panelPluginTransformations`).
 * Order follows first appearance in the link list, which keeps palette colours stable
 * across renders and is the order `endpointNames` collects in, so a node's colour does not
 * depend on which of the two paths produced it.
 *
 * `value` is **null**: a node with neither field nor row has no stat to report. It used to
 * be the node's degree — the only number derivable here — but a link count in the value
 * slot is drawn under the node by "Show node values" and read as `Value` in the tooltip,
 * where nothing tells it apart from a measurement, and it cannot be relabelled, formatted
 * or turned off because there is no field config to do it with. See
 * ../../../../docs/relations-derived-nodes.md.
 */
function deriveNodesFromLinks(links: RelationLink[]): RelationNode[] {
  const ids = new Set<string>();
  for (const link of links) {
    ids.add(link.source);
    ids.add(link.target);
  }
  return [...ids].map((id) => ({ id, name: id, value: null }));
}

/**
 * Note how many edges the response would have lost under the single-frame reading.
 *
 * The collection is invisible — no notice, no Transform tab entry — so the one case where
 * behaviour changed against a real response has to be legible somewhere. Info rather than
 * warn: collecting them all *is* the contract.
 */
function noteCollectedFrames(perFrame: RelationLink[][]): void {
  if (perFrame.length < 2) {
    return;
  }
  const total = perFrame.reduce((sum, links) => sum + links.length, 0);
  debug(
    `Note: relations read ${total} edge(s) from ${perFrame.length} edges frames. ` +
      `Reading the first frame only — what the panel did before — would have drawn ${perFrame[0].length}.`,
    LOG_LEVELS.info,
    { frames: perFrame.length, edges: total, lost: total - perFrame[0].length }
  );
}

/**
 * Report the endpoint keys the reader **recovered** rather than read.
 *
 * The recovery is invisible otherwise — nothing renders differently and the buttons only
 * appear on a pinned tooltip — so a panel whose filters resolve to a key the user did not
 * configure has to be inspectable rather than guessed at. One line per distinct pair, since
 * a multi-level flow's whole point is that there is more than one.
 *
 * Info rather than warn: recovering the key *is* the intended path for these queries.
 */
function noteRecoveredKeys(links: RelationLink[], recovered: ReadonlySet<RelationLink>): void {
  if (recovered.size === 0) {
    return;
  }
  const pairs = new Map<string, number>();
  for (const link of links) {
    if (!recovered.has(link) || !link.filterLabels) {
      continue;
    }
    const pair = `${link.filterLabels.source} / ${link.filterLabels.target}`;
    pairs.set(pair, (pairs.get(pair) ?? 0) + 1);
  }
  debug(
    `Note: relations recovered the datasource's endpoint label keys by value for ${recovered.size} of ` +
      `${links.length} edge(s): ${[...pairs].map(([pair, count]) => `${pair} (${count})`).join(', ')}. ` +
      'Ad-hoc filters are written under those rather than under the contract’s source/target.',
    LOG_LEVELS.info,
    { pairs: [...pairs.keys()], recovered: recovered.size, edges: links.length }
  );
}

/**
 * Convert `graph-*-wide` frames into the shared node/link model.
 *
 * At least one edges frame is required; nodes frames are optional and only add metadata.
 * Every frame in a role contributes — see {@link resolveGraphWideRoles}. Nodes referenced
 * by an edge but absent from the nodes frames are appended, so a partial nodes frame does
 * not drop edges.
 *
 * `at` selects **one timestamp** instead of reducing: every mark reads the value on its
 * own frame's row for that instant, and `null` where the frame has no sample there — the
 * same thing an all-null field reduces to, so an edge still draws weightless rather than
 * vanishing and the topology stays stable while scrubbing. Omit it for the reducing
 * reading, which is the default and what an instant response can only do.
 *
 * Returns `null` when no usable graph can be derived, so callers fall back to the
 * no-data view.
 */
export function frameToGraphWide(
  frames: DataFrame[],
  theme: GrafanaTheme2,
  reduceOptions?: ReduceDataOptions,
  at?: number | null
): NodeGraphData | null {
  const roles = resolveGraphWideRoles(frames);
  if (!roles) {
    return null;
  }

  const calcs = normalizeRelationsCalcs(reduceOptions);
  // The reading, resolved per frame — see {@link MarkRead}. Under `reduce` each mark
  // reduces over its **own** rows, however ragged: reducers skip nulls, so a raw series and
  // the same series null-padded onto a shared row grid give the same number. Under `at` the
  // timestamp is resolved against each frame's own row dimension, for the same reason.
  //
  // **A timeless frame keeps reducing**, whatever `at` says — it has no row to select by
  // time, so its marks read the same at every stop. See {@link isTimelessFrame}, which is
  // also where the bug this closes is written down. Reducing is exact rather than a guess:
  // such a frame carries no rows or one, and every reducer agrees on a single row.
  const readFor = (frame: DataFrame): MarkRead =>
    at == null || isTimelessFrame(frame) ? { kind: 'reduce', calcs } : { kind: 'at', row: rowAt(frame, at) };
  // Per frame first, so the diagnostic can say what the old reading would have drawn.
  // Which edges had their filter keys *recovered* rather than read, for the diagnostic —
  // tracked here rather than on the link, which is the render model and not a log.
  const recovered = new Set<RelationLink>();
  const perFrame = roles.edgesFrames.map((frame) => readLinks(frame, readFor(frame), recovered));
  const links = perFrame.flat();
  if (links.length === 0) {
    return null;
  }
  noteCollectedFrames(perFrame);
  noteRecoveredKeys(links, recovered);
  assignMarkKeys(links);

  const derived = deriveNodesFromLinks(links);
  // Empty when no frame took the nodes role, which leaves the append below to fill the
  // list from the endpoints alone — the edges-only response.
  const nodes = readNodeFrames(roles.nodesFrames, readFor);

  // Append any endpoint the nodes frames did not declare. Without this an edge to an
  // unlisted node would be dropped by ECharts, which resolves links by node id.
  const known = new Set(nodes.map((node) => node.id));
  for (const node of derived) {
    if (!known.has(node.id)) {
      nodes.push(node);
      known.add(node.id);
    }
  }

  if (nodes.length === 0) {
    return null;
  }

  fillPaletteColors(nodes, theme);
  // Resolved here rather than in the tooltip because this is where the frames are: the
  // model is what every render variant and the tooltip see, and neither gets the response.
  const endpointLabels = resolveEndpointLabelKeys(roles.edgesFrames);
  return { nodes, links, ...(endpointLabels ? { endpointLabels } : {}) };
}
