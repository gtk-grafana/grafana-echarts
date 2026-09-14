import { type GraphSeriesOption } from 'echarts';
import { type LinearGradientObject } from 'echarts/types/dist/shared';
import { RELATIONS_LINK_COLOR_DEFAULT } from 'editor/relations/constants';
import { type NodeGraphData, type RelationLink } from 'lib/echarts/relations/converters/model';
import { type GraphPoint } from 'lib/echarts/relations/options/layout';
import { type PanelOptions } from 'types';

/**
 * What colour an edge is drawn in.
 *
 * The family's default is a gradient from the source node's colour to the target's, which
 * ECharts cannot resolve itself on a graph: the keyword form needs node positions, so the
 * gradient is built here from the settled layout and degrades to the source node's own
 * colour when the positions are not known. See {@link makeEdgeGradientResolver}.
 */

/**
 * What the `graph` variant degrades a gradient to when it cannot orient one: the source
 * node's own colour, resolved here rather than by ECharts. Still endpoint-derived and
 * still flips when the edge is reversed — just not a blend. See
 * `makeEdgeGradientResolver` for when that happens and `resolveLinkColor` for why the
 * keyword cannot be handed to ECharts at all.
 */
const GRAPH_LINK_COLOR_FALLBACK = 'source';

/**
 * Series-level link style. **Carries no colour**, deliberately: every edge is coloured
 * on its own item by `resolveLinkColor`, and the ECharts keywords this used to emit do
 * not work on a `graph` series at all — see there. What is left is `curveness`, omitted
 * at 0 so straight links stay ECharts-default, and ECharts' own neutral grey as the
 * last resort for an edge whose endpoint somehow has no colour.
 * https://echarts.apache.org/en/option.html#series-graph.lineStyle
 */
export function getGraphLinkStyle(options: PanelOptions): NonNullable<GraphSeriesOption['lineStyle']> {
  const lineStyle: NonNullable<GraphSeriesOption['lineStyle']> = {};
  if (options.relationsCurveness != null && options.relationsCurveness !== 0) {
    lineStyle.curveness = options.relationsCurveness;
  }
  return lineStyle;
}

/**
 * Each node's rendered colour, by node id, so the edge gradients can look one up by
 * endpoint. There is no resolution left to do: the mark's own display processor
 * decided the colour in `converters/graphWide.ts`, which is what makes a `byName`
 * override, a fixed colour and a by-value scheme all work with no code here.
 */
export function nodeColorsById(data: NodeGraphData): Map<string, string> {
  const colors = new Map<string, string>();
  for (const node of data.nodes) {
    if (node.color != null) {
      colors.set(node.id, node.color);
    }
  }
  return colors;
}

/** Builds one edge's source->target gradient, or `undefined` when it cannot be oriented. */
export type EdgeGradientResolver = (link: RelationLink) => LinearGradientObject | undefined;

/**
 * One edge's colour, resolved **here rather than by ECharts** — which is the whole
 * point of this function, because on a `graph` series ECharts gets it wrong.
 *
 * `edgeVisual.ts` swaps a `lineStyle.color` of `'source'` / `'target'` for the endpoint
 * node's `style.fill`, and it is registered at `PRIORITY.VISUAL.CHART` (3000) while the
 * per-item style task that reads each node's `itemStyle.color` runs at
 * `CHART_DATA_CUSTOM` (4500). So at the moment the swap happens the nodes still carry
 * only the *series-level* fill, and every edge in the panel comes out the same ECharts
 * palette colour — the keywords look supported and are inert. (ECharts' own graph demos
 * hide this: they colour nodes by `categories`, and `categoryVisual` does run first.)
 *
 * The node colours here are the rendered ones, overrides included, so an edge meets its
 * endpoints exactly. Order of precedence, highest first:
 *
 * 1. the edge's **own** field colour (`link.color`, set unless that field's mode is a
 *    palette — see `isPaletteColorMode`);
 * 2. the source-to-target gradient, when it can be oriented (`resolveGradient`);
 * 3. the endpoint colour the mode names, degrading `'gradient'` to the source's.
 */
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

/**
 * Per-edge `source -> target` gradients for the `graph` variant, which ECharts cannot
 * express itself.
 *
 * **Only when the node positions are known**, and that restriction is the whole
 * subtlety. zrender resolves a non-global gradient against the shape's *bounding box*,
 * so `x: 0 -> x2: 1` runs left-to-right across the edge — which is source-to-target only
 * if the source happens to sit on the left. Under a force or circular layout the
 * positions do not exist until after ECharts has laid the graph out, so the orientation
 * would be a coin flip and half the edges would report their direction backwards. That
 * is worse than not blending, so this returns `undefined` and the series keyword
 * (`'source'`) takes over.
 *
 * Under `layout: 'none'` the sign of `dx`/`dy` picks the correct box corner and the
 * gradient runs exactly along the edge. A degenerate axis is harmless: a horizontal edge
 * has zero box height, so the vertical component of the gradient spans nothing.
 *
 * `positions` is therefore supplied only for that layout, and is the *rendered* position
 * of every node — pinned or seeded (`resolveFixedPositions`). Reading `fixedX`/`fixedY`
 * directly instead would be wrong in both directions now: a seeded node has neither, and
 * a force-layout graph whose data happens to pin every node would orient its gradients by
 * coordinates ECharts never uses.
 */
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
    // A self-loop has no direction to express, and two identical colours are not a
    // gradient — leave both to the keyword.
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
