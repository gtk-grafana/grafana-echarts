import { type DataFrame } from '@grafana/data';
import {
  declaredEndpointKeys,
  endpointLabelKeysOf,
  endpointsOf,
  GRAPH_EDGES_WIDE,
  GRAPH_NODES_WIDE,
  type GraphEndpointKeys,
  isCanonicalEndpointKeys,
  isDerivedNodesFrame,
  numericFields,
} from 'lib/echarts/relations/converters/contract';

/**
 * Which frame in a response is the edges frame and which is the nodes frame, decided
 * from shape alone — the contract is structural, so a frame earns its role by carrying
 * endpoint labels (edges) or by naming nodes those edges reference (nodes), not by
 * arriving in a fixed order.
 *
 * **A role is one-to-many**: every frame that passes the shape test contributes its
 * marks, not just the first. See `graphWide.ts` for why that cannot be fixed above the
 * panel.
 */

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
