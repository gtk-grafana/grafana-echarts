import { type GraphSeriesOption } from 'echarts';
import { type CallbackDataParams, type ECBasicOption, type LinearGradientObject } from 'echarts/types/dist/shared';
import { type RelationsChartContext } from 'lib/echarts/charts/types';
import { type NodeGraphData, type RelationLink } from 'lib/echarts/converters/relationsModel';
import { createBaseOptions } from 'lib/echarts/options/base';
import { formatEChartsValue } from 'lib/echarts/style';
import { seriesTooltip } from 'lib/echarts/tooltip/option';
import { buildRelationsTooltipModel, formatDerivedMarkValue } from 'lib/echarts/tooltip/relations';
import { type RelationsLinkItem, type RelationsMarks, type RelationsNodeItem } from 'lib/echarts/tooltip/types';
import { type PanelOptions } from 'types';

/**
 * Base option shared by every relations render variant (graph, sankey, chord).
 * Series data is merged at render time. The native ECharts legend is omitted: nodes
 * are surfaced through the Grafana DOM legend (see charts/relations.ts
 * `buildLegendItems`).
 */
export const relationsDefaultOptions: ECBasicOption = {
  ...createBaseOptions(),
};

/** Default node diameter in px, used when a node has no `custom.nodeRadius`. */
export const RELATIONS_NODE_SIZE_DEFAULT = 20;
/**
 * Default link colour mode: a gradient from the source node's colour to the target's.
 *
 * An edge joins two marks, so its natural colour is theirs, and a gradient is the one
 * mode that reads the direction off the edge itself without an arrowhead. An edge whose
 * own field carries a real colour choice overrides this per edge — see `edgeColorOf`.
 */
export const RELATIONS_LINK_COLOR_DEFAULT = 'gradient';
/**
 * What ECharts' `graph` series can express on its own: `edgeVisual.ts` swaps `'source'`
 * and `'target'` for the endpoint's fill and leaves anything else as a literal colour.
 * `'gradient'` is implemented by `sankey` and `chord` only, so the graph variant builds
 * it here (`makeEdgeGradientResolver`) and degrades to this when it cannot.
 */
const GRAPH_LINK_COLOR_FALLBACK = 'source';
/** Default graph layout when the data does not pin positions. */
export const RELATIONS_LAYOUT_DEFAULT = 'force';
/** Node labels on by default — an unlabelled topology is hard to read. */
export const RELATIONS_SHOW_NODE_LABELS_DEFAULT = true;
/** Node values off by default: a second label line on every node is a lot of ink. */
export const RELATIONS_SHOW_NODE_VALUES_DEFAULT = false;

/**
 * Every Advanced-gated relations option at its default. Spread over the stored
 * options in Default editor mode so a panel that was edited in Advanced mode and
 * switched back renders as an untouched Default panel — `showIf` only hides a
 * control, it does not clear the value. Required of any family that gates options
 * behind Advanced; see `docs/options-modes.md` and
 * `applyPartToWholeEditorModeDefaults`.
 */
export const ADVANCED_RELATIONS_DEFAULTS: Partial<PanelOptions> = {
  relationsRoam: undefined,
  relationsDraggable: undefined,
  relationsRepulsion: undefined,
  relationsEdgeLength: undefined,
  relationsGravity: undefined,
  relationsEdgeArrows: undefined,
  relationsCurveness: undefined,
  relationsFocusAdjacency: undefined,
  relationsLinkColor: undefined,
  animation: undefined,
};

/** The chart context plus the per-mark lookup the tooltip and node labels read. */
export interface RelationsSeriesContext extends RelationsChartContext {
  /**
   * Each mark's own display processor and data-link source, so a hovered node or
   * edge formats with its own unit and surfaces its own `config.links`. Built once
   * per render by `getRelationsTooltipMarks`; optional so a unit test can build a
   * series without one and fall back to the panel formatter.
   */
  marks?: RelationsMarks;
}

/**
 * Resolve the graph layout. An explicit option wins; otherwise `none` when *every*
 * node pins its position, so server-provided `fixedx`/`fixedy` are honored (the
 * node-graph spec requires all-or-nothing), else the default force simulation.
 * https://echarts.apache.org/en/option.html#series-graph.layout
 */
export function getGraphLayout(data: NodeGraphData, options: PanelOptions): 'force' | 'circular' | 'none' {
  if (options.relationsLayout != null) {
    return options.relationsLayout;
  }
  const allPinned = data.nodes.length > 0 && data.nodes.every((node) => node.fixedX != null && node.fixedY != null);
  return allPinned ? 'none' : RELATIONS_LAYOUT_DEFAULT;
}

/**
 * Force-layout tuning. Returns `undefined` when nothing is overridden so the key
 * is omitted and ECharts' own defaults apply.
 * https://echarts.apache.org/en/option.html#series-graph.force
 */
export function getGraphForce(options: PanelOptions): GraphSeriesOption['force'] | undefined {
  const force: NonNullable<GraphSeriesOption['force']> = {};
  if (options.relationsRepulsion != null) {
    force.repulsion = options.relationsRepulsion;
  }
  if (options.relationsEdgeLength != null) {
    force.edgeLength = options.relationsEdgeLength;
  }
  if (options.relationsGravity != null) {
    force.gravity = options.relationsGravity;
  }
  return Object.keys(force).length > 0 ? force : undefined;
}

/**
 * The node label's `formatter`, shared by all three render variants so a node
 * labels identically however it is drawn.
 *
 * Returns `undefined` when "Show node values" is off, letting each variant keep
 * the formatter it needs for the *name* alone (`'{b}'` for sankey and chord,
 * nothing for graph — see `getSankeyLabel` / `getChordLabel`).
 *
 * When on, the stat goes on a second line, formatted through the **node's own**
 * field — the same lookup the tooltip uses, so a label and the tooltip it belongs
 * to cannot print the same number in two different units. It is read off the item
 * rather than from `params.value` because the three variants carry it differently:
 * `graph` sets `value`, while `sankey` and `chord` leave `value` to ECharts' own
 * flow computation and ride the stat as `stat`. That is the same `stat ?? value`
 * precedence the tooltip uses. A node with no stat keeps a one-line label rather
 * than gaining a blank one.
 * https://echarts.apache.org/en/option.html#series-graph.label.formatter
 */
export function getRelationsNodeLabelFormatter(
  ctx: RelationsSeriesContext
): ((params: CallbackDataParams) => string) | undefined {
  if ((ctx.options.relationsShowNodeValues ?? RELATIONS_SHOW_NODE_VALUES_DEFAULT) !== true) {
    return undefined;
  }
  return (params) => {
    const name = String(params.name ?? '');
    const stat = readNodeStat(params.data);
    if (stat == null) {
      return name;
    }
    const id = readNodeId(params.data);
    // A derived node has no field, so it formats as a plain count — the same fallback
    // the tooltip uses, for the same reason. See `formatDerivedMarkValue`.
    const formatValue = (id != null ? ctx.marks?.nodes.get(id)?.formatValue : undefined) ?? formatDerivedMarkValue;
    return `${name}\n${formatEChartsValue(stat, formatValue)}`;
  };
}

/**
 * The stat carried on a relations node item, whichever key the variant used.
 * `params.data` is typed as the loose `OptionDataItem`, so this narrows structurally
 * rather than asserting the item shape back.
 */
function readNodeStat(data: CallbackDataParams['data']): number | string | undefined {
  if (typeof data !== 'object' || data === null) {
    return undefined;
  }
  const stat: unknown = 'stat' in data ? data.stat : undefined;
  const value: unknown = 'value' in data ? data.value : undefined;
  const raw = stat ?? value;
  return typeof raw === 'number' || typeof raw === 'string' ? raw : undefined;
}

/** The node's mark key (its field name); narrowed structurally, as above. */
function readNodeId(data: CallbackDataParams['data']): string | undefined {
  if (typeof data !== 'object' || data === null || !('id' in data)) {
    return undefined;
  }
  const id: unknown = data.id;
  return typeof id === 'string' ? id : undefined;
}

/**
 * Node label config. On by default; the label sits below the node.
 * https://echarts.apache.org/en/option.html#series-graph.label
 */
export function getGraphLabel(ctx: RelationsSeriesContext): GraphSeriesOption['label'] {
  const show = ctx.options.relationsShowNodeLabels ?? RELATIONS_SHOW_NODE_LABELS_DEFAULT;
  if (!show) {
    return { show: false };
  }
  const formatter = getRelationsNodeLabelFormatter(ctx);
  return {
    show: true,
    position: 'bottom',
    // Omitted unless values are shown: `Symbol.js` labels a graph node from
    // `data.getName(idx)`, which is already the name.
    ...(formatter ? { formatter } : {}),
    color: ctx.theme.colors.text.primary,
    fontFamily: ctx.theme.typography.fontFamily,
  };
}

/**
 * Arrowhead at the target end, making edge direction readable. Off by default, so
 * the key is omitted and ECharts draws plain line ends.
 * https://echarts.apache.org/en/option.html#series-graph.edgeSymbol
 */
export function getGraphEdgeSymbol(options: PanelOptions): GraphSeriesOption['edgeSymbol'] | undefined {
  return options.relationsEdgeArrows === true ? ['none', 'arrow'] : undefined;
}

/**
 * Hover emphasis. `'adjacency'` fades everything but the hovered node and its
 * neighbours. Off by default so the key is omitted.
 * https://echarts.apache.org/en/option.html#series-graph.emphasis
 */
export function getGraphEmphasis(options: PanelOptions): GraphSeriesOption['emphasis'] | undefined {
  return options.relationsFocusAdjacency === true ? { focus: 'adjacency' } : undefined;
}

/**
 * Series-level link style: the ECharts keyword every edge starts from, before a
 * per-edge colour or gradient overrides it on the item itself. `curveness` is omitted
 * at 0 so straight links stay ECharts-default.
 *
 * `'gradient'` collapses to `'source'` here, always, because the graph series cannot
 * read it. When the gradient *can* be built every item carries its own and this value is
 * never seen; when it cannot, `'source'` is the honest degradation — still
 * endpoint-derived, still changing if the edge is reversed, just not a blend.
 * https://echarts.apache.org/en/option.html#series-graph.lineStyle
 */
export function getGraphLinkStyle(options: PanelOptions): NonNullable<GraphSeriesOption['lineStyle']> {
  const mode = options.relationsLinkColor ?? RELATIONS_LINK_COLOR_DEFAULT;
  const lineStyle: NonNullable<GraphSeriesOption['lineStyle']> = {
    color: mode === 'gradient' ? GRAPH_LINK_COLOR_FALLBACK : mode,
  };
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
function nodeColorsById(data: NodeGraphData): Map<string, string> {
  const colors = new Map<string, string>();
  for (const node of data.nodes) {
    if (node.color != null) {
      colors.set(node.id, node.color);
    }
  }
  return colors;
}

/** Builds one edge's source->target gradient, or `undefined` to leave it to the keyword. */
type EdgeGradientResolver = (link: RelationLink) => LinearGradientObject | undefined;

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
 * With every node pinned (`layout: 'none'`, which is also what `getGraphLayout` infers
 * from pinned positions) the sign of `dx`/`dy` picks the correct box corner and the
 * gradient runs exactly along the edge. A degenerate axis is harmless: a horizontal edge
 * has zero box height, so the vertical component of the gradient spans nothing.
 */
function makeEdgeGradientResolver(
  data: NodeGraphData,
  nodeColors: ReadonlyMap<string, string>,
  options: PanelOptions
): EdgeGradientResolver | undefined {
  if ((options.relationsLinkColor ?? RELATIONS_LINK_COLOR_DEFAULT) !== 'gradient') {
    return undefined;
  }

  const positions = new Map<string, { x: number; y: number }>();
  for (const node of data.nodes) {
    if (node.fixedX == null || node.fixedY == null) {
      return undefined;
    }
    positions.set(node.id, { x: node.fixedX, y: node.fixedY });
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

/** Map the model's nodes to ECharts graph data items. */
function toNodeItems(data: NodeGraphData, ctx: RelationsSeriesContext): RelationsNodeItem[] {
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
    // Honor pinned coordinates; only meaningful under `layout: 'none'`.
    if (node.fixedX != null && node.fixedY != null) {
      item.x = node.fixedX;
      item.y = node.fixedY;
    }
    if (node.subtitle != null) {
      item.subtitle = node.subtitle;
    }
    if (node.secondary != null) {
      item.secondary = node.secondary;
    }
    return item;
  });
}

/** Map the model's links to ECharts graph link items. */
function toLinkItems(links: RelationLink[], resolveGradient?: EdgeGradientResolver): RelationsLinkItem[] {
  return links.map((link) => {
    // `markId` is how a hovered edge finds its own field for formatting and data
    // links; the endpoints cannot identify it, since parallel edges share them.
    // `markKey` first, for the one case where the ids are not unique either — N raw
    // frames whose value field is called `Value`. See `RelationLink.markKey`.
    const item: RelationsLinkItem = { source: link.source, target: link.target, markId: link.markKey ?? link.id };
    if (link.value != null) {
      item.value = link.value;
    }
    const lineStyle: NonNullable<RelationsLinkItem['lineStyle']> = {};
    // An explicit per-edge colour wins; otherwise the endpoint gradient, and failing
    // that the series keyword. `link.color` is only set when the edge's field carries
    // a real colour choice — see `edgeColorOf` in `converters/graphWide.ts`.
    const gradient = link.color == null ? resolveGradient?.(link) : undefined;
    if (link.color != null) {
      lineStyle.color = link.color;
    } else if (gradient != null) {
      lineStyle.color = gradient;
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

/**
 * Graph series: nodes plus the links between them. `zlevel` places the series on
 * its own canvas layer (see the panel's `zLevel.series`) so layered canvas capture
 * can isolate it, matching the other families.
 * https://echarts.apache.org/en/option.html#series-graph
 */
export function getGraphSeries(data: NodeGraphData, ctx: RelationsSeriesContext): GraphSeriesOption {
  const layout = getGraphLayout(data, ctx.options);
  const force = getGraphForce(ctx.options);
  const edgeSymbol = getGraphEdgeSymbol(ctx.options);
  const emphasis = getGraphEmphasis(ctx.options);
  // Indexed by endpoint: the edge gradients must use the very colours the nodes were
  // painted with, overrides included, or the blend would not meet its endpoints.
  const resolveGradient = makeEdgeGradientResolver(data, nodeColorsById(data), ctx.options);

  return {
    type: 'graph',
    layout,
    // Off by default, keeping the panel static like the other families.
    roam: ctx.options.relationsRoam === true,
    draggable: ctx.options.relationsDraggable === true,
    ...(force ? { force } : {}),
    ...(edgeSymbol ? { edgeSymbol } : {}),
    ...(emphasis ? { emphasis } : {}),
    label: getGraphLabel(ctx),
    lineStyle: getGraphLinkStyle(ctx.options),
    zlevel: ctx.options.zLevel?.series,
    data: toNodeItems(data, ctx),
    links: toLinkItems(data.links, resolveGradient),
    tooltip: seriesTooltip(buildRelationsTooltipModel(ctx.marks), ctx.tooltipSink),
  };
}
