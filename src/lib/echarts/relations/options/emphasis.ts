import { type GraphSeriesOption } from 'echarts';
import {
  RELATIONS_EDGE_ARROWS_DEFAULT,
  RELATIONS_FOCUS_ADJACENCY_DEFAULT,
  RELATIONS_SHOW_NODE_LABELS_DEFAULT,
} from 'editor/relations/constants';
import { type RelationsSeriesContext } from 'lib/echarts/relations/context';
import { getVisibleGraphLabel } from 'lib/echarts/relations/options/labels';
import { type PanelOptions } from 'types';

/**
 * Arrowhead at the target end, making edge direction readable.
 * https://echarts.apache.org/en/option.html#series-graph.edgeSymbol
 */
export function getGraphEdgeSymbol(options: PanelOptions): GraphSeriesOption['edgeSymbol'] | undefined {
  return (options.relationsEdgeArrows ?? RELATIONS_EDGE_ARROWS_DEFAULT) === true ? ['none', 'arrow'] : undefined;
}

/** Check whether hover fades unrelated marks. */
export function resolveRelationsFocusAdjacency(options: PanelOptions): boolean {
  return (options.relationsFocusAdjacency ?? RELATIONS_FOCUS_ADJACENCY_DEFAULT) === true;
}

/**
 * Hover emphasis.
 * https://echarts.apache.org/en/option.html#series-graph.emphasis
 */
export function getGraphEmphasis(ctx: RelationsSeriesContext): GraphSeriesOption['emphasis'] | undefined {
  const focus = resolveRelationsFocusAdjacency(ctx.options);
  const labelsHidden = (ctx.options.relationsShowNodeLabels ?? RELATIONS_SHOW_NODE_LABELS_DEFAULT) === false;
  if (!focus && !labelsHidden) {
    return undefined;
  }
  return {
    ...(focus ? { focus: 'adjacency' } : {}),
    // ECharts otherwise reveals a centered label with its default text color.
    ...(labelsHidden ? { label: getVisibleGraphLabel(ctx) } : {}),
  };
}
