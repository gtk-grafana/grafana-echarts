import { type DataFrame, type GrafanaTheme2 } from '@grafana/data';
import { isDerivedNodesFrame, numericFields } from 'lib/echarts/relations/converters/contract';
import { customOf, isHiddenFrom, numberFrom, stringFrom } from 'lib/echarts/relations/converters/fieldRead';
import {
  colorOf,
  type MarkRead,
  markValue,
  secondaryStatsOf,
  sourceRowOf,
} from 'lib/echarts/relations/converters/markRead';
import { type RelationLink, type RelationNode } from 'lib/echarts/relations/converters/model';
import { getPaletteColorByIndex } from 'lib/echarts/style';

/**
 * Reading the **node** half of the model: one node per numeric field on a nodes frame,
 * plus the two fallbacks for a response that carries no nodes frame at all — palette
 * colours assigned in model order, and nodes synthesized from the edges' endpoints.
 */

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
export function readNodeFrames(frames: DataFrame[], readFor: (frame: DataFrame) => MarkRead): RelationNode[] {
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
export function fillPaletteColors(nodes: RelationNode[], theme: GrafanaTheme2): void {
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
 * ../../../../../docs/relations-derived-nodes.md.
 */
export function deriveNodesFromLinks(links: RelationLink[]): RelationNode[] {
  const ids = new Set<string>();
  for (const link of links) {
    ids.add(link.source);
    ids.add(link.target);
  }
  return [...ids].map((id) => ({ id, name: id, value: null }));
}
