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
import { type NodeGraphData, type RelationLink, type RelationNode } from 'lib/echarts/converters/relationsModel';
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
 * The two reducers a mark can use: `calcs[0]` is the main stat, `calcs[1]` the
 * secondary. Truncated to two because a mark has exactly two stat slots — the same
 * shape as `normalizePieReduceOptions`, which truncates to one.
 *
 * `reduceOptions.values` is not honoured: "all values" would mean one mark per row,
 * and a mark is a field by contract. No editor offers it for this family.
 */
export function normalizeRelationsCalcs(reduceOptions: ReduceDataOptions | undefined): [string, string | undefined] {
  const calcs = reduceOptions?.calcs ?? [];
  return [calcs[0] ?? RELATIONS_CALC_DEFAULT, calcs[1]];
}

/** The two node ids a mark joins. */
export interface GraphEndpoints {
  source: string;
  target: string;
}

/**
 * Endpoints from a field's **labels** — the primary carrier, and the only one that
 * survives a node id which itself contains the separator.
 *
 * Exported for the converters: reading the endpoints a datasource put in labels is the
 * first half of writing them back under the canonical keys, and both halves have to agree
 * on which keys those are.
 */
export function endpointLabelsOf(field: Field): GraphEndpoints | undefined {
  const labels = field.labels ?? {};
  const source = labels[SOURCE_LABEL];
  const target = labels[TARGET_LABEL];
  return source && target ? { source, target } : undefined;
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
function endpointsOf(field: Field): GraphEndpoints | undefined {
  return endpointLabelsOf(field) ?? endpointsFromName(field.name);
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
  return numeric.length > 0 && numeric.some((field) => endpointsOf(field) != null);
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

/** Every node id the edges frames refer to, for the nodes-frame shape test. */
function endpointNames(edgesFrames: DataFrame[]): Set<string> {
  const names = new Set<string>();
  for (const frame of edgesFrames) {
    for (const field of numericFields(frame)) {
      const endpoints = endpointsOf(field);
      if (endpoints) {
        names.add(endpoints.source);
        names.add(endpoints.target);
      }
    }
  }
  return names;
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
 * The secondary stat as a display string.
 *
 * Formatted through the mark's **own** display processor rather than the panel's
 * shared formatter, so two nodes can carry different units — which the row form
 * cannot express at all. Falls back to the `secondarystat` label the conversion
 * carries for row input, where there is no second value to reduce.
 */
function secondaryOf(field: Field, calc: string | undefined): string | undefined {
  if (calc != null) {
    const value = reduceValue(field, calc);
    if (value != null) {
      return field.display ? formattedValueToString(field.display(value)) : String(value);
    }
  }
  return stringFrom(field.labels?.[SECONDARYSTAT_LABEL]);
}

function readLinks(frame: DataFrame, calc: string): RelationLink[] {
  const links: RelationLink[] = [];

  for (const field of numericFields(frame)) {
    const endpoints = endpointsOf(field);
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
    const key = uniqueId(taken, base, withoutEndpoints(link.field?.labels), contested.has(base));
    taken.add(key);
    link.markKey = key;
  });

  debug(`Colliding edges: ${keyed.length} edges with colliding names: ${[...colliding].join(', ')}`, LOG_LEVELS.warn, {
    ids: [...colliding],
    markKeys: keyed.map((link) => link.markKey),
  });
}

function readNodes(frame: DataFrame, calc: string, secondaryCalc: string | undefined): RelationNode[] {
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
    const secondary = secondaryOf(field, secondaryCalc);
    if (secondary != null) {
      node.secondary = secondary;
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
function readNodeFrames(frames: DataFrame[], calc: string, secondaryCalc: string | undefined): RelationNode[] {
  const nodes: RelationNode[] = [];
  const known = new Set<string>();
  for (const frame of frames) {
    for (const node of readNodes(frame, calc, secondaryCalc)) {
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
 * Node set from the links alone, for edge-only responses.
 *
 * Order follows first appearance in the link list, which keeps palette colours stable
 * across renders. `value` is the node's degree — the only stat derivable with no field
 * behind the node, which is also why these nodes carry neither `field` nor a row.
 */
function deriveNodesFromLinks(links: RelationLink[]): RelationNode[] {
  const degree = new Map<string, number>();
  for (const link of links) {
    degree.set(link.source, (degree.get(link.source) ?? 0) + 1);
    degree.set(link.target, (degree.get(link.target) ?? 0) + 1);
  }
  return [...degree].map(([id, count]) => ({ id, name: id, value: count }));
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

  const [calc, secondaryCalc] = normalizeRelationsCalcs(reduceOptions);
  // Per frame first, so the diagnostic can say what the old reading would have drawn.
  // Each mark reduces over its **own** rows, however ragged: every reducer skips nulls,
  // so a raw series and the same series null-padded onto a pivot's shared row grid give
  // the same number. What the pivot does fix is `sourceRowIndex` — see `readLinks`.
  const perFrame = roles.edgesFrames.map((frame) => readLinks(frame, calc));
  const links = perFrame.flat();
  if (links.length === 0) {
    return null;
  }
  noteCollectedFrames(perFrame);
  assignMarkKeys(links);

  const derived = deriveNodesFromLinks(links);
  // Empty when no frame took the nodes role, which leaves the append below to fill the
  // list from the endpoints alone — the edges-only response.
  const nodes = readNodeFrames(roles.nodesFrames, calc, secondaryCalc);

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
  return { nodes, links };
}
