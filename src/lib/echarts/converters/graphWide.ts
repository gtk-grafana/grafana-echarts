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
import { type NodeGraphData, type RelationLink, type RelationNode } from 'lib/echarts/converters/relationsModel';
import { getPaletteColorByIndex } from 'lib/echarts/style';

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

const SOURCE_LABEL = 'source';
const TARGET_LABEL = 'target';
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

/**
 * Endpoints from a field, labels first.
 *
 * Labels win over the name split because they are the only carrier that survives a
 * node id which itself contains the separator. When splitting, **first separator
 * wins**: `a-->b-->c` is `a` and `b-->c`.
 */
function endpointsOf(field: Field): { source: string; target: string } | undefined {
  const labels = field.labels ?? {};
  const source = labels[SOURCE_LABEL];
  const target = labels[TARGET_LABEL];
  if (source && target) {
    return { source, target };
  }

  const at = field.name.indexOf(EDGE_SEPARATOR);
  if (at <= 0) {
    return undefined;
  }
  const left = field.name.slice(0, at);
  const right = field.name.slice(at + EDGE_SEPARATOR.length);
  return left && right ? { source: left, target: right } : undefined;
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

function findEdgesFrame(frames: DataFrame[]): DataFrame | undefined {
  return (
    frames.find((frame) => frame.meta?.type === GRAPH_EDGES_WIDE) ?? frames.find((frame) => isEdgesWideFrame(frame))
  );
}

/**
 * The nodes frame: declared by `meta.type`, else a frame whose numeric fields actually
 * name nodes the edges refer to.
 *
 * That second test matters. "Any other frame with a numeric field" would read an
 * unrelated series in a mixed response as a node list — a second query returning
 * `cpu` would silently add a disconnected `cpu` node to the graph. Requiring at least
 * one field name to be a known endpoint is the wide equivalent of the row form's
 * "a nodes frame must have an `id` column".
 */
function findNodesFrame(
  frames: DataFrame[],
  edgesFrame: DataFrame,
  endpoints: ReadonlySet<string>
): DataFrame | undefined {
  const declared = frames.find((frame) => frame.meta?.type === GRAPH_NODES_WIDE);
  if (declared) {
    return declared;
  }
  return frames.find(
    (frame) =>
      frame !== edgesFrame &&
      frame.meta?.type !== GRAPH_EDGES_WIDE &&
      numericFields(frame).some((field) => endpoints.has(field.name))
  );
}

/** Every node id the edges frame refers to, for the nodes-frame shape test. */
function endpointNames(edgesFrame: DataFrame): Set<string> {
  const names = new Set<string>();
  for (const field of numericFields(edgesFrame)) {
    const endpoints = endpointsOf(field);
    if (endpoints) {
      names.add(endpoints.source);
      names.add(endpoints.target);
    }
  }
  return names;
}

/**
 * The one place frame roles are decided. Every consumer — the reader and the value-field
 * lookups the options layer needs — goes through this, so they cannot disagree about
 * which frame is which.
 */
export function resolveGraphWideRoles(frames: DataFrame[]): { edgesFrame: DataFrame; nodesFrame?: DataFrame } | null {
  const edgesFrame = findEdgesFrame(frames);
  if (!edgesFrame) {
    return null;
  }
  return { edgesFrame, nodesFrame: findNodesFrame(frames, edgesFrame, endpointNames(edgesFrame)) };
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

function customOf(field: Field): Readonly<Record<string, unknown>> {
  const custom: unknown = field.config.custom;
  return isRecord(custom) ? custom : {};
}

function numberFrom(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
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
      value: value ?? 1,
      // A wide frame is a single row, so the mark's own row is always 0.
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
    links.push(link);
  }

  return links;
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
    nodes.push(node);
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
 * Convert `graph-*-wide` frames into the shared node/link model.
 *
 * The edges frame is required; the nodes frame is optional and only adds metadata.
 * Nodes referenced by an edge but absent from the nodes frame are appended, so a
 * partial nodes frame does not drop edges.
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
  const links = readLinks(roles.edgesFrame, calc);
  if (links.length === 0) {
    return null;
  }

  const derived = deriveNodesFromLinks(links);
  const nodes = roles.nodesFrame ? readNodes(roles.nodesFrame, calc, secondaryCalc) : derived;

  // Append any endpoint the nodes frame did not declare. Without this an edge to an
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
