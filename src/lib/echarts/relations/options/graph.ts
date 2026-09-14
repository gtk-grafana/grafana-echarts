import { type GraphSeriesOption } from 'echarts';
import { type ECBasicOption } from 'echarts/types/dist/shared';
import { RELATIONS_LINK_COLOR_DEFAULT } from 'editor/relations/constants';
import { createBaseOptions } from 'lib/echarts/options/base';
import { type RelationsSeriesContext } from 'lib/echarts/relations/context';
import { type NodeGraphData } from 'lib/echarts/relations/converters/model';
import { getGraphEdgeSymbol, getGraphEmphasis } from 'lib/echarts/relations/options/emphasis';
import { toLinkItems, toNodeItems } from 'lib/echarts/relations/options/items';
import { getGraphLabel, getRelationsEdgeLabel, getRelationsLabelLayout } from 'lib/echarts/relations/options/labels';
import {
  getGraphForce,
  getGraphLayout,
  resolveFixedPositions,
  resolveGraphDraggable,
} from 'lib/echarts/relations/options/layout';
import { getGraphLinkStyle, makeEdgeGradientResolver, nodeColorsById } from 'lib/echarts/relations/options/linkColor';
import { getRelationsViewState, resolveRelationsRoam } from 'lib/echarts/relations/options/view';

import { seriesTooltip } from 'lib/echarts/tooltip/option';

import { buildRelationsTooltipModel } from 'lib/echarts/relations/tooltip/model';
/**
 * The `graph` render variant: an arbitrary topology drawn as nodes and links.
 *
 * This module is now only the series assembly and the family's base option — the shared
 * pieces it used to also hold (labels, layout, link colour, item building, the advanced
 * defaults, the render context) are the sibling modules it imports, which is what lets
 * `sankey.ts` and `chord.ts` import those directly instead of importing "graph".
 */

/**
 * Base option shared by every relations render variant (graph, sankey, chord).
 * Series data is merged at render time. The native ECharts legend is omitted: nodes
 * are surfaced through the Grafana DOM legend (see charts/relations.ts
 * `buildLegendItems`).
 */
export const relationsDefaultOptions: ECBasicOption = {
  ...createBaseOptions(),
};

/**
 * Graph series: nodes plus the links between them. `zlevel` places the series on
 * its own canvas layer (see the panel's `zLevel.series`) so layered canvas capture
 * can isolate it, matching the other families.
 * https://echarts.apache.org/en/option.html#series-graph
 */
export function getGraphSeries(data: NodeGraphData, ctx: RelationsSeriesContext): GraphSeriesOption {
  const layout = getGraphLayout(data, ctx.options);
  const edgeSymbol = getGraphEdgeSymbol(ctx.options);
  const emphasis = getGraphEmphasis(ctx.options);
  const edgeLabel = getRelationsEdgeLabel(ctx);
  const labelLayout = getRelationsLabelLayout(ctx.options);
  // Indexed by endpoint: the edge colours and gradients must use the very colours the
  // nodes were painted with, overrides included, or a blend would not meet its
  // endpoints and a `source` edge would not match its source.
  const nodeColors = nodeColorsById(data);
  const mode = ctx.options.relationsLinkColor ?? RELATIONS_LINK_COLOR_DEFAULT;
  // Every node's rendered position, but only for the layout that reads one: the other
  // two lay out for themselves, and emitting `x`/`y` there would just move the view's
  // bounding box around. See `resolveFixedPositions`.
  const positions = layout === 'none' ? resolveFixedPositions(data.nodes) : undefined;
  const resolveGradient = makeEdgeGradientResolver(positions, nodeColors, ctx.options);

  return {
    type: 'graph',
    layout,
    // Pan only, and off by default; zoom is driven by the panel's buttons rather than
    // by the scroll wheel. See `resolveRelationsRoam`.
    roam: resolveRelationsRoam(ctx.options),
    // The remembered pan/zoom, when the user asked for one to be remembered.
    ...getRelationsViewState(ctx.options),
    // Only under the layout that keeps a position. See `resolveGraphDraggable`.
    draggable: resolveGraphDraggable(ctx.options, layout),
    // Always emitted: three of its keys deliberately disagree with ECharts'.
    force: getGraphForce(ctx.options),
    ...(edgeSymbol ? { edgeSymbol } : {}),
    ...(emphasis ? { emphasis } : {}),
    ...(edgeLabel ? { edgeLabel } : {}),
    ...(labelLayout ? { labelLayout } : {}),
    label: getGraphLabel(ctx),
    lineStyle: getGraphLinkStyle(ctx.options),
    zlevel: ctx.options.zLevel?.series,
    data: toNodeItems(data, ctx, positions),
    links: toLinkItems(data.links, nodeColors, mode, resolveGradient),
    tooltip: seriesTooltip(buildRelationsTooltipModel(ctx.marks, ctx.options), ctx.tooltipSink),
  };
}
