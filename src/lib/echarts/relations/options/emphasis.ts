import { type GraphSeriesOption } from 'echarts';
import { RELATIONS_EDGE_ARROWS_DEFAULT, RELATIONS_FOCUS_ADJACENCY_DEFAULT } from 'editor/relations/constants';
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
export function getGraphEmphasis(options: PanelOptions): GraphSeriesOption['emphasis'] | undefined {
  return resolveRelationsFocusAdjacency(options) ? { focus: 'adjacency' } : undefined;
}
