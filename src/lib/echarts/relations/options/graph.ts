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

/** Base option shared by every relations render variant (graph, sankey, chord). */
export const relationsDefaultOptions: ECBasicOption = {
  ...createBaseOptions(),
};

/**
 * Graph series: nodes plus the links between them.
 * https://echarts.apache.org/en/option.html#series-graph
 */
export function getGraphSeries(data: NodeGraphData, ctx: RelationsSeriesContext): GraphSeriesOption {
  const layout = getGraphLayout(data, ctx.options);
  const edgeSymbol = getGraphEdgeSymbol(ctx.options);
  const emphasis = getGraphEmphasis(ctx.options);
  const edgeLabel = getRelationsEdgeLabel(ctx);
  const labelLayout = getRelationsLabelLayout(ctx.options);
  // Resolve edge colors from the final node colors.
  const nodeColors = nodeColorsById(data);
  const mode = ctx.options.relationsLinkColor ?? RELATIONS_LINK_COLOR_DEFAULT;
  // Only fixed layout uses explicit positions.
  const positions = layout === 'none' ? resolveFixedPositions(data.nodes) : undefined;
  const resolveGradient = makeEdgeGradientResolver(positions, nodeColors, ctx.options);

  return {
    type: 'graph',
    layout,
    // The panel buttons control zoom separately.
    roam: resolveRelationsRoam(ctx.options),
    ...getRelationsViewState(ctx.options),
    draggable: resolveGraphDraggable(ctx.options, layout),
    // Plugin defaults differ from ECharts defaults.
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
