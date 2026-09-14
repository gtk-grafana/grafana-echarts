import { type GraphSeriesOption } from 'echarts';
import { RELATIONS_EDGE_ARROWS_DEFAULT, RELATIONS_FOCUS_ADJACENCY_DEFAULT } from 'editor/relations/constants';
import { type PanelOptions } from 'types';

/**
 * Hover behaviour: the adjacency fade that dims everything but the hovered node's
 * neighbourhood, and the arrowhead that says which way an edge runs.
 */

/**
 * Arrowhead at the target end, making edge direction readable. On by default — see
 * `RELATIONS_EDGE_ARROWS_DEFAULT`.
 * https://echarts.apache.org/en/option.html#series-graph.edgeSymbol
 */
export function getGraphEdgeSymbol(options: PanelOptions): GraphSeriesOption['edgeSymbol'] | undefined {
  return (options.relationsEdgeArrows ?? RELATIONS_EDGE_ARROWS_DEFAULT) === true ? ['none', 'arrow'] : undefined;
}

/**
 * Whether hovering a mark fades everything outside its neighbourhood — the family's
 * "Highlight adjacency" switch, on by default. Shared by all three variants' emphasis
 * builders so one switch cannot mean three things.
 *
 * Also read outside the option build, by the panel: a hover that fades the rest of the
 * chart repaints every mark in it, which is rate-limited rather than run at cursor
 * speed. See `HOVER_FOCUS_THROTTLE_MS`.
 */
export function resolveRelationsFocusAdjacency(options: PanelOptions): boolean {
  return (options.relationsFocusAdjacency ?? RELATIONS_FOCUS_ADJACENCY_DEFAULT) === true;
}

/**
 * Hover emphasis. `'adjacency'` fades everything but the hovered node and its
 * neighbours. On by default; the key is omitted when switched off, which is ECharts'
 * own no-focus behaviour for `graph` and `sankey` (chord differs — see
 * `getChordEmphasis`).
 * https://echarts.apache.org/en/option.html#series-graph.emphasis
 */
export function getGraphEmphasis(options: PanelOptions): GraphSeriesOption['emphasis'] | undefined {
  return resolveRelationsFocusAdjacency(options) ? { focus: 'adjacency' } : undefined;
}
