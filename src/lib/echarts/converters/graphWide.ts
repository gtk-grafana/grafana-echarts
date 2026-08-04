import {
  type DataFrame,
  type DataFrameType,
  type Field,
  FieldType,
  type GrafanaTheme2,
  reduceField,
} from '@grafana/data';
import { type NodeGraphData, type RelationLink, type RelationNode } from 'lib/echarts/converters/nodeGraph';

/**
 * Reader for the field-based graph contract: **one node is one field, one edge is one
 * field**. Identity is `field.name`, topology is in `field.labels`, and everything else
 * — colour, unit, decimals, links, per-mark style — is ordinary `fieldConfig`.
 *
 * Spec: ../../../../data-plane/graph-wide.md. The long form this replaces is
 * ../../../../data-plane/node-graph.md, still read by `nodeGraph.ts`.
 *
 * The payoff over the long reader is that every mark is an override target, because a
 * field is the unit Grafana's whole configuration pipeline already addresses. That only
 * pays off when the frames were made wide **above** the panel — see `legacyToWide.ts`.
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

const DEFAULT_SOURCE_KEY = 'source';
const DEFAULT_TARGET_KEY = 'target';

/** Reducer used when the panel has no `reduceOptions.calcs`. */
const DEFAULT_CALC = 'lastNotNull';

const numericFields = (frame: DataFrame): Field[] => frame.fields.filter((field) => field.type === FieldType.number);

/**
 * Endpoints from a field, labels first.
 *
 * Labels win over the name split because they are the only carrier that survives a
 * node id which itself contains the separator. When splitting, **first separator
 * wins**: `a-->b-->c` is `a` and `b-->c`.
 */
function endpointsOf(field: Field): { source: string; target: string } | undefined {
  const labels = field.labels ?? {};
  const source = labels[DEFAULT_SOURCE_KEY];
  const target = labels[DEFAULT_TARGET_KEY];
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

/** True when a frame's numeric fields describe edges — labels first, name split second. */
export function isEdgesWideFrame(frame: DataFrame): boolean {
  const numeric = numericFields(frame);
  return numeric.length > 0 && numeric.some((field) => endpointsOf(field) != null);
}

/**
 * Frame role resolution, in the contract's precedence order: `meta.type` first, field
 * shape second. (The third signal, a panel-option refId picker, is not implemented.)
 *
 * An edges frame is required — a lone nodes frame is a table, not a graph, exactly as
 * in the long form.
 */
export function isGraphWideFrames(frames: DataFrame[]): boolean {
  return frames.some((frame) => frame.meta?.type === GRAPH_EDGES_WIDE || isEdgesWideFrame(frame));
}

function findEdgesFrame(frames: DataFrame[]): DataFrame | undefined {
  return (
    frames.find((frame) => frame.meta?.type === GRAPH_EDGES_WIDE) ?? frames.find((frame) => isEdgesWideFrame(frame))
  );
}

/**
 * The nodes frame: declared by meta, else the remaining frame with numeric fields once
 * an edges frame has been identified.
 */
function findNodesFrame(frames: DataFrame[], edgesFrame: DataFrame): DataFrame | undefined {
  return (
    frames.find((frame) => frame.meta?.type === GRAPH_NODES_WIDE) ??
    frames.find((frame) => frame !== edgesFrame && numericFields(frame).length > 0)
  );
}

/** Reduce a mark's values to its stat. On instant (single-row) data every reducer agrees. */
function reduceValue(field: Field, calc: string): number | null {
  const value: unknown = reduceField({ field, reducers: [calc] })[calc];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * A mark's colour, resolved through its own display processor.
 *
 * This is the whole point of the pivot: `field.display` is what `applyFieldOverrides`
 * left behind, so a `byName` override, a fixed colour and a by-value scheme all arrive
 * here already resolved — no separate resolver, all eight modes for free. Undefined
 * when the override pass has not run (the in-panel fallback path), where the caller's
 * existing palette resolver still applies.
 */
function colorOf(field: Field, value: number | null): string | undefined {
  return field.display ? field.display(value).color : field.config.color?.fixedColor;
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
      // fallback is gone — it is styling now (`custom.lineWidth`).
      value: value ?? 1,
      field,
    };

    const color = colorOf(field, value);
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

function readNodes(frame: DataFrame, calc: string): RelationNode[] {
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
    // Carried as a label on instant data, where a second calc would just reduce the
    // same single value. See graph-wide.md#the-reduceoptions-contract.
    const secondary = field.labels?.secondarystat;
    if (secondary != null && secondary !== '') {
      node.secondary = secondary;
    }
    nodes.push(node);
  }

  return nodes;
}

/** Node set from the links alone, for edge-only responses. Mirrors the long reader. */
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
 * partial nodes frame does not drop edges — same contract as `frameToNodeGraph`.
 *
 * Returns `null` when no usable graph can be derived, so callers fall back to the
 * no-data view.
 */
export function frameToGraphWide(frames: DataFrame[], _theme: GrafanaTheme2, calcs?: string[]): NodeGraphData | null {
  const edgesFrame = findEdgesFrame(frames);
  if (!edgesFrame) {
    return null;
  }

  const calc = calcs?.[0] ?? DEFAULT_CALC;
  const links = readLinks(edgesFrame, calc);
  if (links.length === 0) {
    return null;
  }

  const nodesFrame = findNodesFrame(frames, edgesFrame);
  const nodes = nodesFrame ? readNodes(nodesFrame, calc) : deriveNodesFromLinks(links);

  const known = new Set(nodes.map((node) => node.id));
  for (const node of deriveNodesFromLinks(links)) {
    if (!known.has(node.id)) {
      nodes.push(node);
      known.add(node.id);
    }
  }

  return nodes.length > 0 ? { nodes, links } : null;
}
