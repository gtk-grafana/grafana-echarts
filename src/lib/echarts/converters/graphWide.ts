import {
  type DataFrame,
  type DataFrameType,
  type Field,
  FieldColorModeId,
  FieldType,
  formattedValueToString,
  type GrafanaTheme2,
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
import { contestedIds, edgeId, uniqueId, withoutEndpoints } from 'lib/echarts/converters/toGraphWide';
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
 * but the tooltip, which has as many rows as it needs, so nothing is truncated. This used to
 * return a pair and drop `calcs[2..]` on the floor.
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

/** Whether a pair is the contract's own, i.e. there is nothing worth declaring. */
export function isCanonicalEndpointKeys(keys: GraphEndpointKeys): boolean {
  return keys.source === SOURCE_LABEL && keys.target === TARGET_LABEL;
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
 * **First separator wins**: `a-->b-->c` is `a` and `b-->c`. Exported so a converter can
 * ask "is this name already an edge id?" with the same test the reader applies.
 */
export function endpointsFromName(name: string): GraphEndpoints | undefined {
  const at = name.indexOf(EDGE_SEPARATOR);
  if (at <= 0) {
    return undefined;
  }
  const left = name.slice(0, at);
  const right = name.slice(at + EDGE_SEPARATOR.length);
  return left && right ? { source: left, target: right } : undefined;
}

/** Endpoints from a field, labels first. */
function endpointsOf(field: Field, declared?: GraphEndpointKeys): GraphEndpoints | undefined {
  return endpointLabelsOf(field, declared) ?? endpointsFromName(field.name);
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
 */
function findNodesFrames(frames: DataFrame[], endpoints: ReadonlySet<string>): DataFrame[] {
  const declared = frames.filter((frame) => frame.meta?.type === GRAPH_NODES_WIDE);
  if (declared.length > 0) {
    return declared;
  }
  return frames.filter(
    (frame) => !isEdgesWideFrame(frame) && numericFields(frame).some((field) => endpoints.has(field.name))
  );
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
 * Overridable per panel (`relationsSourceFilterLabel`) for the case no response can answer
 * — a query that aggregated the original key away. See `relationsFilterLabels`.
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

/** Reduce a mark's values to one of its stats. On instant data every reducer agrees. */
function reduceValue(field: Field, calc: string): number | null {
  const value: unknown = reduceField({ field, reducers: [calc] })[calc];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
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
 * The palette modes, which colour a field by its position among its siblings.
 *
 * For a **node** that is exactly right — it reproduces the per-node palette the family
 * has always drawn. For an **edge** it is not a colour choice at all: an edge's natural
 * colour comes from the nodes it joins (`relationsLinkColor`, gradient by default), so
 * a palette mode is treated as "nothing configured" and no per-edge colour is emitted.
 * Any other mode — fixed, by-value, thresholds, shades — is a real choice and wins.
 */
const PALETTE_MODES: ReadonlySet<string> = new Set([
  FieldColorModeId.PaletteClassic,
  FieldColorModeId.PaletteClassicByName,
]);

function edgeColorOf(field: Field, value: number | null): string | undefined {
  const mode = field.config.color?.mode;
  return mode == null || PALETTE_MODES.has(mode) ? undefined : colorOf(field, value);
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
function secondaryStatsOf(field: Field, calcs: readonly string[]): MarkStat[] {
  const stats: MarkStat[] = [];
  for (const calc of calcs) {
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

function readLinks(frame: DataFrame, calc: string, secondaryCalcs: readonly string[]): RelationLink[] {
  const links: RelationLink[] = [];
  // The frame's own answer to "which labels are the endpoints", tried ahead of the
  // conventional pairs. See `GRAPH_META_CUSTOM`.
  const declared = declaredEndpointKeys(frame);

  for (const field of numericFields(frame)) {
    const endpoints = endpointsOf(field, declared);
    if (!endpoints) {
      continue;
    }

    const value = reduceValue(field, calc);
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
      // Row 0 — the first sample, which is only "the reduced row" for a single-row
      // frame. On a ranged response a data link interpolating `${__value.numeric}`
      // therefore disagrees with the tooltip's reduced value, and across raw frames it
      // disagrees differently per edge, because row 0 of a 1-row series is now and row 0
      // of a 57-row series is an hour ago. Pre-existing since the row dimension arrived,
      // and not fixable here: "the row the reducer picked" is well defined for
      // first/last/min/max and meaningless for mean/sum. The pivot does fix it — one
      // shared row grid means row 0 is one timestamp for every mark.
      sourceRowIndex: 0,
      field,
    };

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
    // The same extra reducers the nodes get. `calcs[1]` used to be read for nodes only,
    // so picking a second calculation on a panel whose marks are edges — an edges-only
    // response, which is the common shape — produced no second value anywhere and the
    // option read as broken. See `secondaryStatsOf`.
    const secondaries = secondaryStatsOf(field, secondaryCalcs);
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
    const endpointKeys = link.field ? endpointLabelKeysOf(link.field) : undefined;
    const key = uniqueId(taken, base, withoutEndpoints(link.field?.labels, endpointKeys), contested.has(base));
    taken.add(key);
    link.markKey = key;
  });

  debug(`Colliding edges: ${keyed.length} edges with colliding names: ${[...colliding].join(', ')}`, LOG_LEVELS.warn, {
    ids: [...colliding],
    markKeys: keyed.map((link) => link.markKey),
  });
}

function readNodes(frame: DataFrame, calc: string, secondaryCalcs: readonly string[]): RelationNode[] {
  const nodes: RelationNode[] = [];

  for (const field of numericFields(frame)) {
    const value = reduceValue(field, calc);
    const custom = customOf(field);
    const node: RelationNode = {
      id: field.name,
      // `config.displayName` is the contract's `title`. Deliberately not
      // `getFieldDisplayName`, which appends the label set.
      name: field.config.displayName ?? field.name,
      value,
      sourceRowIndex: 0,
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
    const secondaries = secondaryStatsOf(field, secondaryCalcs);
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
 * Every declared node, across every nodes frame, **first field per id winning**.
 *
 * A node id is the ECharts graph key that each edge's `source`/`target` resolves against,
 * so two frames declaring the same node is a genuine collision rather than a display
 * problem — there is one node either way. Response order decides, which is the only
 * stable answer available and matches the reader's "first appearance" rule for derived
 * nodes.
 */
function readNodeFrames(frames: DataFrame[], calc: string, secondaryCalcs: readonly string[]): RelationNode[] {
  const nodes: RelationNode[] = [];
  const known = new Set<string>();
  for (const frame of frames) {
    for (const node of readNodes(frame, calc, secondaryCalcs)) {
      if (!known.has(node.id)) {
        known.add(node.id);
        nodes.push(node);
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
 * Convert `graph-*-wide` frames into the shared node/link model.
 *
 * At least one edges frame is required; nodes frames are optional and only add metadata.
 * Every frame in a role contributes — see {@link resolveGraphWideRoles}. Nodes referenced
 * by an edge but absent from the nodes frames are appended, so a partial nodes frame does
 * not drop edges.
 *
 * Returns `null` when no usable graph can be derived, so callers fall back to the
 * no-data view.
 */
export function frameToGraphWide(
  frames: DataFrame[],
  theme: GrafanaTheme2,
  reduceOptions?: ReduceDataOptions
): NodeGraphData | null {
  const roles = resolveGraphWideRoles(frames);
  if (!roles) {
    return null;
  }

  const [calc, ...secondaryCalcs] = normalizeRelationsCalcs(reduceOptions);
  // Per frame first, so the diagnostic can say what the old reading would have drawn.
  // Each mark reduces over its **own** rows, however ragged: every reducer skips nulls,
  // so a raw series and the same series null-padded onto a pivot's shared row grid give
  // the same number. What the pivot does fix is `sourceRowIndex` — see `readLinks`.
  const perFrame = roles.edgesFrames.map((frame) => readLinks(frame, calc, secondaryCalcs));
  const links = perFrame.flat();
  if (links.length === 0) {
    return null;
  }
  noteCollectedFrames(perFrame);
  assignMarkKeys(links);

  const derived = deriveNodesFromLinks(links);
  // Empty when no frame took the nodes role, which leaves the append below to fill the
  // list from the endpoints alone — the edges-only response.
  const nodes = readNodeFrames(roles.nodesFrames, calc, secondaryCalcs);

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
