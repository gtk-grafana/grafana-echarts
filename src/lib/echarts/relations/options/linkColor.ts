import { type GraphSeriesOption } from 'echarts';
import { type LinearGradientObject } from 'echarts/types/dist/shared';
import { RELATIONS_LINK_COLOR_DEFAULT } from 'editor/relations/constants';
import { type NodeGraphData, type RelationLink } from 'lib/echarts/relations/converters/model';
import { type GraphPoint } from 'lib/echarts/relations/options/layout';
import { type PanelOptions } from 'types';

/** Fallback for a graph gradient with no layout direction. */
const GRAPH_LINK_COLOR_FALLBACK = 'source';

/**
 * Series-level link style.
 * https://echarts.apache.org/en/option.html#series-graph.lineStyle
 */
export function getGraphLinkStyle(options: PanelOptions): NonNullable<GraphSeriesOption['lineStyle']> {
  const lineStyle: NonNullable<GraphSeriesOption['lineStyle']> = {};
  if (options.relationsCurveness != null && options.relationsCurveness !== 0) {
    lineStyle.curveness = options.relationsCurveness;
  }
  return lineStyle;
}

/** Map rendered node colors by node id. */
export function nodeColorsById(data: NodeGraphData): Map<string, string> {
  const colors = new Map<string, string>();
  for (const node of data.nodes) {
    if (node.color != null) {
      colors.set(node.id, node.color);
    }
  }
  return colors;
}

/** Build an edge gradient, if its direction is known. */
export type EdgeGradientResolver = (link: RelationLink) => LinearGradientObject | undefined;

/** Resolve one edge color. */
export function resolveLinkColor(
  link: RelationLink,
  nodeColors: ReadonlyMap<string, string>,
  mode: string,
  resolveGradient?: EdgeGradientResolver
): string | LinearGradientObject | undefined {
  if (link.color != null) {
    return link.color;
  }
  const gradient = resolveGradient?.(link);
  if (gradient != null) {
    return gradient;
  }
  const endpoint = mode === 'gradient' ? GRAPH_LINK_COLOR_FALLBACK : mode;
  return nodeColors.get(endpoint === 'target' ? link.target : link.source);
}

/** Build graph gradients from source to target. */
export function makeEdgeGradientResolver(
  positions: ReadonlyMap<string, GraphPoint> | undefined,
  nodeColors: ReadonlyMap<string, string>,
  options: PanelOptions
): EdgeGradientResolver | undefined {
  if (positions == null || (options.relationsLinkColor ?? RELATIONS_LINK_COLOR_DEFAULT) !== 'gradient') {
    return undefined;
  }

  return (link) => {
    const from = positions.get(link.source);
    const to = positions.get(link.target);
    const sourceColor = nodeColors.get(link.source);
    const targetColor = nodeColors.get(link.target);
    // Self-loops and equal endpoint colors do not need a gradient.
    if (!from || !to || sourceColor == null || targetColor == null || sourceColor === targetColor) {
      return undefined;
    }
    const x = to.x >= from.x ? 0 : 1;
    const y = to.y >= from.y ? 0 : 1;
    return {
      type: 'linear',
      x,
      y,
      x2: 1 - x,
      y2: 1 - y,
      colorStops: [
        { offset: 0, color: sourceColor },
        { offset: 1, color: targetColor },
      ],
    };
  };
}
