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

/** Reading the node half of the model. */

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

/** Every declared node, across every nodes frame, first field per id winning. */
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

/** Give every node a color, so none falls through to ECharts' own palette. */
export function fillPaletteColors(nodes: RelationNode[], theme: GrafanaTheme2): void {
  nodes.forEach((node, index) => {
    if (node.color == null) {
      node.color = getPaletteColorByIndex(index, theme);
    }
  });
}

/** Node set from the links alone, for an edges-only response. */
export function deriveNodesFromLinks(links: RelationLink[]): RelationNode[] {
  const ids = new Set<string>();
  for (const link of links) {
    ids.add(link.source);
    ids.add(link.target);
  }
  return [...ids].map((id) => ({ id, name: id, value: null }));
}
