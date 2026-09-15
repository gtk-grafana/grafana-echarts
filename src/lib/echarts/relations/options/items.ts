import { RELATIONS_NODE_SIZE_DEFAULT } from 'editor/relations/constants';
import { type RelationsSeriesContext } from 'lib/echarts/relations/context';
import { type NodeGraphData, type RelationLink } from 'lib/echarts/relations/converters/model';
import { type GraphPoint } from 'lib/echarts/relations/options/layout';
import { type EdgeGradientResolver, resolveLinkColor } from 'lib/echarts/relations/options/linkColor';

import { type RelationsLinkItem, type RelationsNodeItem } from 'lib/echarts/relations/tooltip/types';

/** Map the model's nodes to ECharts graph data items. */
export function toNodeItems(
  data: NodeGraphData,
  ctx: RelationsSeriesContext,
  positions: ReadonlyMap<string, GraphPoint> | undefined
): RelationsNodeItem[] {
  const defaultSize = ctx.options.relationsNodeSize ?? RELATIONS_NODE_SIZE_DEFAULT;

  return data.nodes.map((node) => {
    const item: RelationsNodeItem = {
      // Use `id` for links and `name` for the visible title.
      id: node.id,
      name: node.name,
      symbolSize: node.radius ?? defaultSize,
    };
    if (node.value != null) {
      item.value = node.value;
    }
    if (node.color != null) {
      item.itemStyle = { color: node.color };
    }
    // Only fixed layouts provide positions.
    const position = positions?.get(node.id);
    if (position != null) {
      item.x = position.x;
      item.y = position.y;
    }
    if (node.subtitle != null) {
      item.subtitle = node.subtitle;
    }
    if (node.secondaries != null) {
      item.secondaries = node.secondaries;
    }
    return item;
  });
}

/** Map the model's links to ECharts graph link items. */
export function toLinkItems(
  links: RelationLink[],
  nodeColors: ReadonlyMap<string, string>,
  mode: string,
  resolveGradient?: EdgeGradientResolver
): RelationsLinkItem[] {
  return links.map((link) => {
    // `markKey` distinguishes parallel edges with the same id.
    const item: RelationsLinkItem = { source: link.source, target: link.target, markId: link.markKey ?? link.id };
    if (link.value != null) {
      item.value = link.value;
    }
    if (link.secondaries != null) {
      item.secondaries = link.secondaries;
    }
    const lineStyle: NonNullable<RelationsLinkItem['lineStyle']> = {};
    // Graph series cannot resolve endpoint color keywords.
    const color = resolveLinkColor(link, nodeColors, mode, resolveGradient);
    if (color != null) {
      lineStyle.color = color;
    }
    if (link.width != null) {
      lineStyle.width = link.width;
    }
    if (link.lineType != null) {
      lineStyle.type = link.lineType;
    }
    // Per-edge curveness overrides the series value.
    if (link.curveness != null) {
      lineStyle.curveness = link.curveness;
    }
    if (Object.keys(lineStyle).length > 0) {
      item.lineStyle = lineStyle;
    }
    return item;
  });
}
