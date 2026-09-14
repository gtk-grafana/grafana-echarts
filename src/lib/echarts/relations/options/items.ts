import { RELATIONS_NODE_SIZE_DEFAULT } from 'editor/relations/constants';
import { type RelationsSeriesContext } from 'lib/echarts/relations/context';
import { type NodeGraphData, type RelationLink } from 'lib/echarts/relations/converters/model';
import { type GraphPoint } from 'lib/echarts/relations/options/layout';
import { type EdgeGradientResolver, resolveLinkColor } from 'lib/echarts/relations/options/linkColor';

import { type RelationsLinkItem, type RelationsNodeItem } from 'lib/echarts/relations/tooltip/types';
/**
 * Turning the family's model into the two `data` arrays a `series.graph` takes: one item
 * per node and one per link, each carrying the per-mark style, the mark id the tooltip and
 * the label formatters look up, and the endpoint ids ECharts joins on.
 */

/**
 * Map the model's nodes to ECharts graph data items. `positions` is supplied only under
 * `layout: 'none'`, where it holds *every* node — see {@link resolveFixedPositions}.
 */
export function toNodeItems(
  data: NodeGraphData,
  ctx: RelationsSeriesContext,
  positions: ReadonlyMap<string, GraphPoint> | undefined
): RelationsNodeItem[] {
  const defaultSize = ctx.options.relationsNodeSize ?? RELATIONS_NODE_SIZE_DEFAULT;

  return data.nodes.map((node) => {
    const item: RelationsNodeItem = {
      // ECharts keys nodes by `retrieve(id, name, dataIndex)` and resolves each
      // link's source/target against that key (`createGraphFromNodeEdge`). Setting
      // `id` therefore pins link resolution to the mark's field name, which frees
      // `name` to carry the human-readable `displayName` for the label.
      id: node.id,
      name: node.name,
      // `custom.nodeRadius` always wins over the panel-level size.
      symbolSize: node.radius ?? defaultSize,
    };
    if (node.value != null) {
      item.value = node.value;
    }
    if (node.color != null) {
      item.itemStyle = { color: node.color };
    }
    // Only meaningful under `layout: 'none'`, which is the only layout `positions` is
    // built for — and there it answers for every node, pinned or seeded.
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
    // `markId` is how a hovered edge finds its own field for formatting and data
    // links; the endpoints cannot identify it, since parallel edges share them.
    // `markKey` first, for the one case where the ids are not unique either — N raw
    // frames whose value field is called `Value`. See `RelationLink.markKey`.
    const item: RelationsLinkItem = { source: link.source, target: link.target, markId: link.markKey ?? link.id };
    if (link.value != null) {
      item.value = link.value;
    }
    if (link.secondaries != null) {
      item.secondaries = link.secondaries;
    }
    const lineStyle: NonNullable<RelationsLinkItem['lineStyle']> = {};
    // Every edge carries its own colour: the series-level ECharts keywords do not
    // work on a `graph` series. See `resolveLinkColor`.
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
    // Overrides the series-level `relationsCurveness` for this edge alone —
    // `GraphSeries` reads `curveness` off the item's own `lineStyle` first.
    if (link.curveness != null) {
      lineStyle.curveness = link.curveness;
    }
    if (Object.keys(lineStyle).length > 0) {
      item.lineStyle = lineStyle;
    }
    return item;
  });
}
