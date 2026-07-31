import { type DataFrame, type Field, FieldType, getDisplayProcessor, type GrafanaTheme2 } from '@grafana/data';

/**
 * Chart-agnostic node/link model shared by the relations family's render variants
 * (graph today; sankey and chord reuse it unchanged, because ECharts' `graph`,
 * `sankey` and `chord` series all read `option.data || option.nodes` plus
 * `option.edges || option.links`).
 *
 * Built from Grafana's node-graph frame pair, which is **out of the data plane
 * contract** — see ../../../../data-plane/node-graph.md for the field spec and
 * ../../../../docs/relations-data-sources.md for where such frames come from.
 */

/** A single node. `value` is `mainstat`, which drives sizing/color and the tooltip. */
export interface RelationNode {
  id: string;
  /** Display name: `title` when present, else the `id`. */
  name: string;
  subtitle?: string;
  value: number | null;
  /** `secondarystat`, tooltip only. May be a string (the field spec allows either). */
  secondary?: number | string | null;
  /** `noderadius` — ECharts `symbolSize`. */
  radius?: number;
  /** `color` when it is an HTML color string. */
  color?: string;
  /**
   * Single border color approximating the `arc__*` ring — the dominant section's
   * configured color. The proportions are lost; see `resolveArcBorderColor`.
   */
  borderColor?: string;
  fixedX?: number;
  fixedY?: number;
  /**
   * Row index within the nodes frame this node was built from, so the tooltip
   * footer can surface that row's data links. Unset for nodes *derived* from the
   * edges frame, which have no backing row.
   */
  sourceRowIndex?: number;
  /**
   * Position in the *unfiltered* node list. Set only once the legend has hidden
   * something (see `withoutHiddenNodes`), so palette colors stay attached to their
   * node instead of shifting up as nodes above them are toggled off.
   */
  paletteIndex?: number;
}

/** A single directed edge. `value` is the numeric weight sankey/chord need. */
export interface RelationLink {
  id: string;
  source: string;
  target: string;
  value: number | null;
  color?: string;
  /** `thickness` — ECharts `lineStyle.width`. */
  width?: number;
  /** `strokedasharray` — mapped to an ECharts `lineStyle.type`. */
  dashArray?: string;
  /** Row index within the edges frame, for footer data links. */
  sourceRowIndex?: number;
}

/** Chart-agnostic graph, ready for a graph / sankey / chord series. */
export interface NodeGraphData {
  nodes: RelationNode[];
  links: RelationLink[];
}

// Field names from Grafana's `NodeGraphDataFrameFieldNames`. All lowercase.
const ID_FIELD = 'id';
const SOURCE_FIELD = 'source';
const TARGET_FIELD = 'target';
const TITLE_FIELD = 'title';
const SUBTITLE_FIELD = 'subtitle';
const MAINSTAT_FIELD = 'mainstat';
const SECONDARYSTAT_FIELD = 'secondarystat';
const THICKNESS_FIELD = 'thickness';
const COLOR_FIELD = 'color';
const STROKEDASHARRAY_FIELD = 'strokedasharray';
const NODERADIUS_FIELD = 'noderadius';
const FIXEDX_FIELD = 'fixedx';
const FIXEDY_FIELD = 'fixedy';
const ARC_PREFIX = 'arc__';

/** Case-insensitive field lookup — Grafana matches these names lowercased. */
function findField(frame: DataFrame, name: string): Field | undefined {
  return frame.fields.find((field) => field.name.toLowerCase() === name);
}

const hasField = (frame: DataFrame, name: string): boolean => findField(frame, name) != null;

/**
 * True when a frame is an **edges** frame.
 *
 * Grafana's own role test is just "has a `source` field" (`applyOptionsToFrames`),
 * but that only runs after the user has already picked the node graph panel. We
 * additionally require `target`, because this predicate doubles as *detection*:
 * `source` alone would claim any table with a column of that name.
 */
export function isEdgesFrame(frame: DataFrame): boolean {
  return hasField(frame, SOURCE_FIELD) && hasField(frame, TARGET_FIELD);
}

/**
 * True when a frame is a **nodes** frame: an `id` and no `source`/`target`.
 *
 * Deliberately stricter than Grafana, which treats any non-edges candidate frame
 * as nodes. Here the `id` field is required so an unrelated frame in a mixed
 * response is not silently read as a node list.
 */
export function isNodesFrame(frame: DataFrame): boolean {
  return hasField(frame, ID_FIELD) && !isEdgesFrame(frame);
}

/**
 * True when these frames carry node-graph data.
 *
 * Detection is purely **field shape**, and deliberately ignores Grafana's two
 * metadata signals (`meta.preferredVisualisationType === 'nodeGraph'`, a frame
 * named `nodes`/`edges`). They are redundant here: `source` and `target` are
 * *required* on an edges frame, so the shape check is already sufficient — and
 * neither signal survives the paths that matter, since provisioned TestData
 * `csv_content` fixtures cannot set frame metadata and SQL Expression outputs are
 * named by `refId`. Compare `isFlameGraphFrame`, where the meta signal *is*
 * canonical and the shape check is the fallback.
 *
 * An edges frame is required — a lone nodes frame is a table, not a graph.
 */
export function isNodeGraphFrames(frames: DataFrame[]): boolean {
  return frames.some(isEdgesFrame);
}

/**
 * Read a field's value at `row` as a number, or `null`. `mainstat` and friends may
 * be strings per the field spec, so a non-numeric value is not coerced — it is
 * dropped, and callers fall back.
 */
function numberAt(field: Field | undefined, row: number): number | null {
  // `Field.values` is untyped (`any[]`), so narrow through `unknown` rather than
  // trusting the declared field type.
  const value: unknown = field?.values[row];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Read a field's value at `row` as a display string, or `undefined` when empty. */
function stringAt(field: Field | undefined, row: number, theme: GrafanaTheme2): string | undefined {
  if (!field) {
    return undefined;
  }
  const raw: unknown = field.values[row];
  if (raw == null || raw === '') {
    return undefined;
  }
  // May be an enum field (numeric indices), so resolve through the display
  // processor to read the text rather than the raw value.
  const display = field.display ?? getDisplayProcessor({ field, theme });
  return display(raw).text || undefined;
}

/**
 * A node's single `color`, when it is an HTML color string. A *numeric* `color`
 * means "shade me by value per `field.config.color.mode`", which the options layer
 * resolves from the field's color scheme instead — so it is not read here.
 */
function colorAt(field: Field | undefined, row: number): string | undefined {
  const value: unknown = field?.values[row];
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/**
 * The numeric field driving node size/color: the nodes frame's `mainstat`, else the
 * edges frame's. Exposed so the options layer can color nodes by that field's
 * configured Color scheme and format tooltip values with its unit — mirroring
 * `getHierarchyValueField`.
 */
export function getNodeGraphValueField(frames: DataFrame[]): Field | undefined {
  const nodesFrame = frames.find(isNodesFrame);
  const mainstat = nodesFrame ? findField(nodesFrame, MAINSTAT_FIELD) : undefined;
  if (mainstat?.type === FieldType.number) {
    return mainstat;
  }
  const edgesFrame = frames.find(isEdgesFrame);
  const edgeMainstat = edgesFrame ? findField(edgesFrame, MAINSTAT_FIELD) : undefined;
  return edgeMainstat?.type === FieldType.number ? edgeMainstat : undefined;
}

/**
 * Approximate a node's `arc__*` ring with a single border color: the configured
 * color of its **largest** section.
 *
 * No ECharts relationship series can draw a multi-section ring, so the section
 * *proportions* are unavoidably lost — only the dominant one survives. Reading
 * `config.color.fixedColor` is Grafana-side work, so it belongs here rather than in
 * the options layer. See the divergence note in ../../../../data-plane/node-graph.md.
 */
function resolveArcBorderColor(arcFields: Field[], row: number): string | undefined {
  let best: { value: number; color?: string } | undefined;
  for (const field of arcFields) {
    const value = numberAt(field, row);
    if (value == null) {
      continue;
    }
    if (best == null || value > best.value) {
      best = { value, color: field.config.color?.fixedColor };
    }
  }
  return best?.color;
}

/** Build the link list from an edges frame. */
function readLinks(frame: DataFrame, theme: GrafanaTheme2): RelationLink[] {
  const idField = findField(frame, ID_FIELD);
  const sourceField = findField(frame, SOURCE_FIELD);
  const targetField = findField(frame, TARGET_FIELD);
  const mainstatField = findField(frame, MAINSTAT_FIELD);
  const thicknessField = findField(frame, THICKNESS_FIELD);
  const colorField = findField(frame, COLOR_FIELD);
  const dashField = findField(frame, STROKEDASHARRAY_FIELD);

  if (!sourceField || !targetField) {
    return [];
  }

  const links: RelationLink[] = [];
  for (let row = 0; row < frame.length; row++) {
    const source = stringAt(sourceField, row, theme);
    const target = stringAt(targetField, row, theme);
    // An edge missing either endpoint cannot be placed; drop it rather than
    // inventing an empty-string node.
    if (source == null || target == null) {
      continue;
    }
    const thickness = numberAt(thicknessField, row);
    const link: RelationLink = {
      id: stringAt(idField, row, theme) ?? `${source}--${target}`,
      source,
      target,
      // Weight fallback chain: `mainstat` (when numeric) -> `thickness` -> 1.
      // Sankey and chord size their ribbons from this and collapse without it;
      // `mainstat` is optional and may be a string, hence the chain.
      value: numberAt(mainstatField, row) ?? thickness ?? 1,
      sourceRowIndex: row,
    };
    if (thickness != null) {
      link.width = thickness;
    }
    const color = colorAt(colorField, row);
    if (color != null) {
      link.color = color;
    }
    const dashArray = stringAt(dashField, row, theme);
    if (dashArray != null) {
      link.dashArray = dashArray;
    }
    links.push(link);
  }
  return links;
}

/** Build the node list from a nodes frame. */
function readNodes(frame: DataFrame, theme: GrafanaTheme2): RelationNode[] {
  const idField = findField(frame, ID_FIELD);
  const titleField = findField(frame, TITLE_FIELD);
  const subtitleField = findField(frame, SUBTITLE_FIELD);
  const mainstatField = findField(frame, MAINSTAT_FIELD);
  const secondaryField = findField(frame, SECONDARYSTAT_FIELD);
  const radiusField = findField(frame, NODERADIUS_FIELD);
  const colorField = findField(frame, COLOR_FIELD);
  const fixedXField = findField(frame, FIXEDX_FIELD);
  const fixedYField = findField(frame, FIXEDY_FIELD);
  const arcFields = frame.fields.filter((field) => field.name.toLowerCase().startsWith(ARC_PREFIX));

  if (!idField) {
    return [];
  }

  const nodes: RelationNode[] = [];
  for (let row = 0; row < frame.length; row++) {
    const id = stringAt(idField, row, theme);
    if (id == null) {
      continue;
    }
    const node: RelationNode = {
      id,
      name: stringAt(titleField, row, theme) ?? id,
      value: numberAt(mainstatField, row),
      sourceRowIndex: row,
    };
    const subtitle = stringAt(subtitleField, row, theme);
    if (subtitle != null) {
      node.subtitle = subtitle;
    }
    // Kept raw: `secondarystat` is tooltip-only and may legitimately be a string.
    const secondary = numberAt(secondaryField, row) ?? stringAt(secondaryField, row, theme);
    if (secondary != null) {
      node.secondary = secondary;
    }
    const radius = numberAt(radiusField, row);
    if (radius != null) {
      node.radius = radius;
    }
    const color = colorAt(colorField, row);
    if (color != null) {
      node.color = color;
    }
    // Per the field spec `color` and `arc__*` are mutually exclusive, so only read
    // the arc approximation when no single color was given.
    if (color == null && arcFields.length > 0) {
      const borderColor = resolveArcBorderColor(arcFields, row);
      if (borderColor != null) {
        node.borderColor = borderColor;
      }
    }
    const fixedX = numberAt(fixedXField, row);
    const fixedY = numberAt(fixedYField, row);
    if (fixedX != null) {
      node.fixedX = fixedX;
    }
    if (fixedY != null) {
      node.fixedY = fixedY;
    }
    nodes.push(node);
  }
  return nodes;
}

/**
 * Derive the node set from the links alone, for edge-only responses.
 *
 * Grafana does the same when no nodes frame is supplied, so a converter that
 * required both frames would render nothing for a valid response (TestData's
 * `nodes.type: "random edges"` is exactly this shape). Node order follows first
 * appearance in the link list, which keeps palette colors stable across renders.
 * `value` is the node's degree — the only stat derivable without a nodes frame.
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
 * Convert Grafana data frames into the node/link model.
 *
 * The **edges** frame is required; the **nodes** frame is optional and only adds
 * metadata (see `deriveNodesFromLinks`). Nodes referenced by an edge but absent
 * from the nodes frame are appended, so a partial nodes frame does not drop edges.
 *
 * Returns `null` when no usable graph can be derived, so callers can fall back to
 * a no-data view (matching `frameToHierarchy`).
 */
export function frameToNodeGraph(frames: DataFrame[], theme: GrafanaTheme2): NodeGraphData | null {
  const edgesFrame = frames.find(isEdgesFrame);
  if (!edgesFrame) {
    return null;
  }

  const links = readLinks(edgesFrame, theme);
  if (links.length === 0) {
    return null;
  }

  const nodesFrame = frames.find(isNodesFrame);
  const nodes = nodesFrame ? readNodes(nodesFrame, theme) : deriveNodesFromLinks(links);

  // Append any endpoint the nodes frame did not declare. Without this an edge to
  // an unlisted node would be dropped by ECharts (it resolves links by node id).
  const known = new Set(nodes.map((node) => node.id));
  const derived = deriveNodesFromLinks(links);
  for (const node of derived) {
    if (!known.has(node.id)) {
      nodes.push(node);
      known.add(node.id);
    }
  }

  return nodes.length > 0 ? { nodes, links } : null;
}
