import { type SankeySeriesOption } from 'echarts';

import { toSankeyLinks } from 'lib/echarts/relations/converters/dag';
import { type NodeGraphData, type RelationLink, type RelationNode } from 'lib/echarts/relations/converters/model';

import { seriesTooltip } from 'lib/echarts/tooltip/option';

import { type PanelOptions } from 'types';

import { RELATIONS_LINK_COLOR_DEFAULT, RELATIONS_SHOW_NODE_LABELS_DEFAULT } from 'editor/relations/constants';
import {
  SANKEY_CURVENESS_DEFAULT,
  SANKEY_LAYOUT_ITERATIONS_DEFAULT,
  SANKEY_LINK_OPACITY_DEFAULT,
  SANKEY_NODE_ALIGN_DEFAULT,
  SANKEY_NODE_GAP_DEFAULT,
  SANKEY_NODE_WIDTH_DEFAULT,
  SANKEY_ORIENT_DEFAULT,
} from 'editor/relations/sankey';
import { type RelationsSeriesContext } from 'lib/echarts/relations/context';
import { resolveRelationsFocusAdjacency } from 'lib/echarts/relations/options/emphasis';
import {
  getRelationsEdgeLabel,
  getRelationsLabelLayout,
  getRelationsLabelStyle,
  getRelationsNodeLabelFormatter,
} from 'lib/echarts/relations/options/labels';
import { getRelationsViewState, resolveRelationsRoam } from 'lib/echarts/relations/options/view';
import { buildRelationsTooltipModel } from 'lib/echarts/relations/tooltip/model';
import { type RelationsLinkItem, type RelationsNodeItem } from 'lib/echarts/relations/tooltip/types';
import { type RelationsSankeyNodeAlign, type RelationsSankeyOrient } from 'editor/relations/types';

/**
 * Flow direction.
 * https://echarts.apache.org/en/option.html#series-sankey.orient
 */
export function getSankeyOrient(options: PanelOptions): RelationsSankeyOrient | undefined {
  const orient = options.relationsSankeyOrient ?? SANKEY_ORIENT_DEFAULT;
  return orient === SANKEY_ORIENT_DEFAULT ? undefined : orient;
}

/**
 * Place nodes that can fit in more than one column.
 * https://echarts.apache.org/en/option.html#series-sankey.nodeAlign
 */
export function getSankeyNodeAlign(options: PanelOptions): RelationsSankeyNodeAlign {
  return options.relationsSankeyNodeAlign ?? SANKEY_NODE_ALIGN_DEFAULT;
}

/**
 * Place node labels for the selected flow direction.
 * https://echarts.apache.org/en/option.html#series-sankey.label.position
 */
export function getSankeyLabelPosition(options: PanelOptions): 'right' | 'bottom' {
  return (options.relationsSankeyOrient ?? SANKEY_ORIENT_DEFAULT) === 'vertical' ? 'bottom' : 'right';
}

/**
 * Node label config.
 * https://echarts.apache.org/en/option.html#series-sankey.label
 */
export function getSankeyLabel(ctx: RelationsSeriesContext): SankeySeriesOption['label'] {
  const show = ctx.options.relationsShowNodeLabels ?? RELATIONS_SHOW_NODE_LABELS_DEFAULT;
  if (!show) {
    return { show: false };
  }
  return {
    show: true,
    position: getSankeyLabelPosition(ctx.options),
    // The formatter adds the stat when node values are enabled.
    formatter: getRelationsNodeLabelFormatter(ctx) ?? '{b}',
    ...getRelationsLabelStyle(ctx),
  };
}

/**
 * Ribbon styling.
 * https://echarts.apache.org/en/option.html#series-sankey.lineStyle
 */
export function getSankeyLinkStyle(options: PanelOptions): NonNullable<SankeySeriesOption['lineStyle']> {
  const lineStyle: NonNullable<SankeySeriesOption['lineStyle']> = {
    color: options.relationsLinkColor ?? RELATIONS_LINK_COLOR_DEFAULT,
  };
  if (options.relationsSankeyCurveness != null && options.relationsSankeyCurveness !== SANKEY_CURVENESS_DEFAULT) {
    lineStyle.curveness = options.relationsSankeyCurveness;
  }
  if (
    options.relationsSankeyLinkOpacity != null &&
    options.relationsSankeyLinkOpacity !== SANKEY_LINK_OPACITY_DEFAULT
  ) {
    lineStyle.opacity = options.relationsSankeyLinkOpacity;
  }
  return lineStyle;
}

/**
 * Hover emphasis.
 * https://echarts.apache.org/en/option.html#series-sankey.emphasis
 */
export function getSankeyEmphasis(options: PanelOptions): SankeySeriesOption['emphasis'] | undefined {
  return resolveRelationsFocusAdjacency(options) ? { focus: 'adjacency' } : undefined;
}

/** Map the model's nodes to ECharts sankey data items. */
function toSankeyNodeItems(nodes: RelationNode[]): RelationsNodeItem[] {
  return nodes.map((node) => {
    const item: RelationsNodeItem = {
      // Use `id` for links and `name` for the visible title.
      id: node.id,
      name: node.name,
    };
    if (node.value != null) {
      item.stat = node.value;
    }
    if (node.color != null) {
      item.itemStyle = { color: node.color };
    }
    if (node.subtitle != null) {
      item.subtitle = node.subtitle;
    }
    if (node.secondaries != null) {
      item.secondaries = node.secondaries;
    }
    // Sankey positions are fractions of the layout rectangle.
    if (isLocalFraction(node.fixedX) && isLocalFraction(node.fixedY)) {
      item.localX = node.fixedX;
      item.localY = node.fixedY;
    }
    return item;
  });
}

/** Check whether a stored sankey coordinate is valid. */
function isLocalFraction(value: number | undefined): value is number {
  return value != null && value >= 0 && value <= 1;
}

/** Map the model's links to ECharts sankey link items. */
function toSankeyLinkItems(links: RelationLink[]): RelationsLinkItem[] {
  return links.map((link) => {
    // `markKey` distinguishes edges that share a field name.
    const item: RelationsLinkItem = { source: link.source, target: link.target, markId: link.markKey ?? link.id };
    if (link.value != null) {
      item.value = link.value;
    }
    if (link.secondaries != null) {
      item.secondaries = link.secondaries;
    }
    if (link.color != null) {
      item.lineStyle = { color: link.color };
    }
    return item;
  });
}

/** Report links removed by the cycle policy. */
export function getSankeyDroppedNoticeText(droppedCount: number): string | undefined {
  if (droppedCount <= 0) {
    return undefined;
  }
  const links = droppedCount === 1 ? 'link' : 'links';
  return `${droppedCount} ${links} hidden to remove cycles`;
}

/** A built sankey series, plus how many links the cycle policy removed. */
export interface SankeySeriesResult {
  series: SankeySeriesOption;
  /** Feeds `getSankeyDroppedNote`. 0 for acyclic input. */
  droppedCount: number;
}

/**
 * Sankey series: weighted flow ribbons between node columns.
 * https://echarts.apache.org/en/option.html#series-sankey
 */
export function getSankeySeries(data: NodeGraphData, ctx: RelationsSeriesContext): SankeySeriesResult {
  const { links, droppedCount } = toSankeyLinks(data.links);
  const orient = getSankeyOrient(ctx.options);
  const nodeAlign = getSankeyNodeAlign(ctx.options);
  const emphasis = getSankeyEmphasis(ctx.options);
  const edgeLabel = getRelationsEdgeLabel(ctx);
  const labelLayout = getRelationsLabelLayout(ctx.options);
  const { relationsSankeyNodeWidth, relationsSankeyNodeGap, relationsSankeyLayoutIterations } = ctx.options;

  const series: SankeySeriesOption = {
    type: 'sankey',
    ...(orient ? { orient } : {}),
    nodeAlign,
    ...(relationsSankeyNodeWidth != null && relationsSankeyNodeWidth !== SANKEY_NODE_WIDTH_DEFAULT
      ? { nodeWidth: relationsSankeyNodeWidth }
      : {}),
    ...(relationsSankeyNodeGap != null && relationsSankeyNodeGap !== SANKEY_NODE_GAP_DEFAULT
      ? { nodeGap: relationsSankeyNodeGap }
      : {}),
    ...(relationsSankeyLayoutIterations != null && relationsSankeyLayoutIterations !== SANKEY_LAYOUT_ITERATIONS_DEFAULT
      ? { layoutIterations: relationsSankeyLayoutIterations }
      : {}),
    ...(emphasis ? { emphasis } : {}),
    ...(edgeLabel ? { edgeLabel } : {}),
    ...(labelLayout ? { labelLayout } : {}),
    // Override ECharts defaults so graph and sankey use the same controls.
    draggable: ctx.options.relationsDraggable === true,
    roam: resolveRelationsRoam(ctx.options),
    ...getRelationsViewState(ctx.options),
    label: getSankeyLabel(ctx),
    lineStyle: getSankeyLinkStyle(ctx.options),
    zlevel: ctx.options.zLevel?.series,
    data: toSankeyNodeItems(data.nodes),
    links: toSankeyLinkItems(links),
    tooltip: seriesTooltip(buildRelationsTooltipModel(ctx.marks, ctx.options), ctx.tooltipSink),
  };

  return { series, droppedCount };
}
