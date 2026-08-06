import { type SankeySeriesOption } from 'echarts';
import {
  SANKEY_CURVENESS_DEFAULT,
  SANKEY_LAYOUT_ITERATIONS_DEFAULT,
  SANKEY_LINK_OPACITY_DEFAULT,
  SANKEY_NODE_ALIGN_DEFAULT,
  SANKEY_NODE_GAP_DEFAULT,
  SANKEY_NODE_WIDTH_DEFAULT,
  SANKEY_ORIENT_DEFAULT,
} from 'editor/sankey';
import { type RelationsSankeyNodeAlign, type RelationsSankeyOrient } from 'editor/types';
import { toSankeyLinks } from 'lib/echarts/converters/dag';
import { type NodeGraphData, type RelationLink, type RelationNode } from 'lib/echarts/converters/relationsModel';
import {
  getRelationsNodeLabelFormatter,
  RELATIONS_LINK_COLOR_DEFAULT,
  RELATIONS_SHOW_NODE_LABELS_DEFAULT,
  type RelationsSeriesContext,
} from 'lib/echarts/options/graph';
import { seriesTooltip } from 'lib/echarts/tooltip/option';
import { buildRelationsTooltipModel } from 'lib/echarts/tooltip/relations';
import { type RelationsLinkItem, type RelationsNodeItem } from 'lib/echarts/tooltip/types';
import { type PanelOptions } from 'types';

/**
 * Sankey render variant of the relations family: the same `{ nodes, links }` model
 * the `graph` variant uses, laid out as weighted flow ribbons between node columns.
 *
 * Two things make this more than a layout swap:
 *
 * 1. **Cycles must be broken first.** ECharts' sankey layout throws on cyclic input,
 *    unguarded in production builds, so `getSankeySeries` runs the links through
 *    `toSankeyLinks` itself rather than trusting its caller. See `converters/dag.ts`.
 * 2. **Ribbon size is the link weight.** A sankey reads `edge.getValue()` for
 *    geometry, where `graph` uses `lineStyle.width`. The converter's weight fallback
 *    chain (`mainstat` -> `thickness` -> 1) is what keeps ribbons from collapsing.
 *
 * https://echarts.apache.org/en/option.html#series-sankey
 */

/**
 * Sankey-specific Advanced-gated options at their defaults, merged into
 * `ADVANCED_RELATIONS_DEFAULTS` so Default editor mode resets them like every other
 * family's Advanced tier. `orient` and `nodeAlign` are absent deliberately: they are
 * Default-tier controls, not Advanced-gated. See `docs/options-modes.md`.
 */
export const ADVANCED_SANKEY_DEFAULTS: Partial<PanelOptions> = {
  relationsSankeyNodeWidth: undefined,
  relationsSankeyNodeGap: undefined,
  relationsSankeyCurveness: undefined,
  relationsSankeyLinkOpacity: undefined,
  relationsSankeyLayoutIterations: undefined,
};

/**
 * Flow direction. Omitted at the horizontal default.
 * https://echarts.apache.org/en/option.html#series-sankey.orient
 */
export function getSankeyOrient(options: PanelOptions): RelationsSankeyOrient | undefined {
  const orient = options.relationsSankeyOrient ?? SANKEY_ORIENT_DEFAULT;
  return orient === SANKEY_ORIENT_DEFAULT ? undefined : orient;
}

/**
 * Column placement for nodes that could occupy more than one. Omitted at the
 * justify default.
 * https://echarts.apache.org/en/option.html#series-sankey.nodeAlign
 */
export function getSankeyNodeAlign(options: PanelOptions): RelationsSankeyNodeAlign | undefined {
  const align = options.relationsSankeyNodeAlign ?? SANKEY_NODE_ALIGN_DEFAULT;
  return align === SANKEY_NODE_ALIGN_DEFAULT ? undefined : align;
}

/**
 * Node label config. On by default. ECharts places a sankey label `right` of the
 * node (unlike the graph variant's `bottom`), which is left alone — only the theme
 * font and color are applied, so labels match the rest of the panel.
 *
 * **`formatter` is a correction, not an option.** `SankeyView` labels a node with
 * `defaultText: node.id` — the *graph key*, i.e. whatever
 * `createGraphFromNodeEdge`'s `retrieve(id, name, dataIndex)` resolved to. Since the
 * converter sets `id` from the frame's `id` field so links resolve against it, the
 * label would be the raw id and a nodes frame's human-readable `title` would never
 * show. (The graph variant is unaffected: `Symbol.js` labels from
 * `data.getName(idx)`, which is the `name`.) `'{b}'` is the data name, so this
 * routes the label back through `name` and the two variants label alike.
 * https://echarts.apache.org/en/option.html#series-sankey.label
 */
export function getSankeyLabel(ctx: RelationsSeriesContext): SankeySeriesOption['label'] {
  const show = ctx.options.relationsShowNodeLabels ?? RELATIONS_SHOW_NODE_LABELS_DEFAULT;
  if (!show) {
    return { show: false };
  }
  return {
    show: true,
    // With "Show node values" on, the shared formatter emits the name *and* the
    // stat, so it replaces the `'{b}'` correction (it reads `params.name`, which
    // is the same value `'{b}'` resolves to).
    formatter: getRelationsNodeLabelFormatter(ctx) ?? '{b}',
    color: ctx.theme.colors.text.primary,
    fontFamily: ctx.theme.typography.fontFamily,
  };
}

/**
 * Ribbon styling. `color` takes the same ECharts keywords as the graph variant
 * (`source` / `target` / `gradient`), resolved in `SankeyView`; the family default of
 * `gradient` deliberately overrides ECharts' own neutral-gray default so a ribbon reads
 * as flowing from one node's colour into the other's. Unlike the graph variant, this one
 * needs no help — `SankeyView` implements all three keywords itself.
 * `curveness` and `opacity` are omitted at ECharts' defaults.
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
 * Hover emphasis. `'adjacency'` fades everything but the hovered node and the
 * ribbons touching it — the same option the graph variant exposes. Off by default,
 * so the key is omitted.
 * https://echarts.apache.org/en/option.html#series-sankey.emphasis
 */
export function getSankeyEmphasis(options: PanelOptions): SankeySeriesOption['emphasis'] | undefined {
  return options.relationsFocusAdjacency === true ? { focus: 'adjacency' } : undefined;
}

/**
 * Map the model's nodes to ECharts sankey data items.
 *
 * Narrower than the graph variant's mapping, because a sankey node is a rectangle
 * laid out from the flow rather than a positioned symbol:
 *
 * - **no `value`** — see `RelationsNodeItem.stat` for why `mainstat` rides separately;
 * - **no `symbolSize`** — `noderadius` has no sankey meaning; node thickness is the
 *   series-level `nodeWidth` and node length is the flow;
 * - **no `x`/`y`** — `SankeyNodeItemOption` positions with `localX`/`localY`/`depth`,
 *   not the graph variant's pixel coordinates, so `fixedx`/`fixedy` are dropped.
 */
function toSankeyNodeItems(nodes: RelationNode[]): RelationsNodeItem[] {
  return nodes.map((node) => {
    const item: RelationsNodeItem = {
      // As with graph: `id` pins link resolution to the frame's `id`, freeing `name`
      // to carry the human-readable `title` for the label.
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
    if (node.secondary != null) {
      item.secondary = node.secondary;
    }
    return item;
  });
}

/**
 * Map the model's links to ECharts sankey link items.
 *
 * `value` is load-bearing here in a way it is not for `graph`: it *is* the ribbon
 * thickness. Two per-edge fields the graph variant honors are deliberately dropped
 * because a sankey cannot express them — `custom.lineWidth` (`lineStyle.width`), since
 * ribbon size comes from the weight instead, and `custom.lineType` (`lineStyle.type`),
 * since a ribbon is a filled area rather than a stroked line.
 * Both divergences are recorded in `src/modules/relations/parity.md`.
 */
function toSankeyLinkItems(links: RelationLink[]): RelationsLinkItem[] {
  return links.map((link) => {
    // `markId` carries the edge's field name for the tooltip, or its `markKey` when
    // several marks share that name; see `toLinkItems`.
    const item: RelationsLinkItem = { source: link.source, target: link.target, markId: link.markKey ?? link.id };
    if (link.value != null) {
      item.value = link.value;
    }
    if (link.color != null) {
      item.lineStyle = { color: link.color };
    }
    return item;
  });
}

/**
 * Text reporting links removed by the cycle policy, so the edit is not a silent
 * correctness surprise. Returns `undefined` when nothing was dropped, so a
 * well-formed DAG reports nothing at all.
 *
 * Surfaced as a panel corner notice (`ChartModule.getNotices` ->
 * `ChartNotices`), not as canvas text: it is an advisory about the *data*, so it
 * does not belong inside the plot, where it also collided with the bottom-left
 * ribbon of a horizontal sankey.
 */
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
  /** Feeds `getSankeyDroppedNote`; 0 for acyclic input. */
  droppedCount: number;
}

/**
 * Sankey series: weighted flow ribbons between node columns.
 *
 * Runs the cycle policy itself rather than taking pre-sanitized links, so there is
 * no way to build this series from an edge set that would throw out of ECharts'
 * layout. `zlevel` places the series on its own canvas layer (see the panel's
 * `zLevel.series`), matching the other families.
 * https://echarts.apache.org/en/option.html#series-sankey
 */
export function getSankeySeries(data: NodeGraphData, ctx: RelationsSeriesContext): SankeySeriesResult {
  const { links, droppedCount } = toSankeyLinks(data.links);
  const orient = getSankeyOrient(ctx.options);
  const nodeAlign = getSankeyNodeAlign(ctx.options);
  const emphasis = getSankeyEmphasis(ctx.options);
  const { relationsSankeyNodeWidth, relationsSankeyNodeGap, relationsSankeyLayoutIterations } = ctx.options;

  const series: SankeySeriesOption = {
    type: 'sankey',
    ...(orient ? { orient } : {}),
    ...(nodeAlign ? { nodeAlign } : {}),
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
    // Both are pinned rather than omitted. ECharts' sankey defaults are
    // `draggable: true` and `roam: false`; the graph variant is static on both
    // counts, so emitting them keeps the two variants behaving alike instead of
    // letting a sankey be dragged apart by default.
    draggable: ctx.options.relationsDraggable === true,
    roam: ctx.options.relationsRoam === true,
    label: getSankeyLabel(ctx),
    lineStyle: getSankeyLinkStyle(ctx.options),
    zlevel: ctx.options.zLevel?.series,
    data: toSankeyNodeItems(data.nodes),
    links: toSankeyLinkItems(links),
    tooltip: seriesTooltip(buildRelationsTooltipModel(ctx.marks), ctx.tooltipSink),
  };

  return { series, droppedCount };
}
