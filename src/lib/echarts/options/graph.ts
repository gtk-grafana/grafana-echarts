import {
  type Field,
  type FieldConfigSource,
  getDisplayProcessor,
  getFieldColorModeForField,
  type GrafanaTheme2,
} from '@grafana/data';
import { type GraphSeriesOption } from 'echarts';
import { type ECBasicOption } from 'echarts/types/dist/shared';
import { type RelationsChartContext } from 'lib/echarts/charts/types';
import { type NodeGraphData, type RelationLink, type RelationNode } from 'lib/echarts/converters/nodeGraph';
import { createBaseOptions } from 'lib/echarts/options/base';
import { getPaletteColorByIndex } from 'lib/echarts/style';
import { seriesTooltip } from 'lib/echarts/tooltip/option';
import { buildRelationsTooltipModel } from 'lib/echarts/tooltip/relations';
import { type RelationsLinkItem, type RelationsNodeItem } from 'lib/echarts/tooltip/types';
import { getSeriesColorOverride } from 'lib/grafana/fields/seriesConfig';
import { type PanelOptions } from 'types';

/**
 * Base option for relations charts. Series data is merged at render time. The
 * native ECharts legend is omitted: nodes are surfaced through the Grafana DOM
 * legend (see charts/relations.ts `buildLegendItems`).
 */
export const relationsDefaultOptions: ECBasicOption = {
  ...createBaseOptions(),
};

/** Default node diameter in px, used when a node has no `noderadius`. */
export const RELATIONS_NODE_SIZE_DEFAULT = 20;
/** Default link color mode: inherit the source node's color. */
export const RELATIONS_LINK_COLOR_DEFAULT = 'source';
/** Default graph layout when the data does not pin positions. */
export const RELATIONS_LAYOUT_DEFAULT = 'force';
/** Node labels on by default — an unlabelled topology is hard to read. */
export const RELATIONS_SHOW_NODE_LABELS_DEFAULT = true;
/**
 * Border width in px used to approximate an `arc__*` ring. Wide enough to read as a
 * ring rather than an outline, since it is standing in for a multi-section circle.
 */
export const ARC_BORDER_WIDTH = 3;

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

/** Context needed to build a relations series (colors + tooltip formatting). */
export interface RelationsSeriesContext extends RelationsChartContext {
  /** The numeric `mainstat` field; drives by-value node colors and tooltip units. */
  valueField?: Field;
  /** The edges frame's `mainstat`, for a hovered link's footer data links. */
  linkValueField?: Field;
}

/** Resolves the color for a single node; `undefined` leaves it to ECharts. */
export type RelationsColorResolver = (node: RelationNode, index: number) => string | undefined;

/**
 * Build a node color resolver, mirroring `makeHierarchyColorResolver`'s three
 * tiers so the families behave alike:
 *
 * - a fixed-color override (legend color picker) wins, matched by node name;
 * - the node's own `color` field wins next — the node-graph spec's explicit
 *   per-node HTML color;
 * - an explicitly-configured by-value scheme colors every node from its
 *   `mainstat` via the field's display processor;
 * - otherwise the classic palette colors nodes by position.
 *
 * See https://grafana.com/docs/grafana/latest/panels-visualizations/configure-standard-options/#color-scheme
 */
export function makeRelationsColorResolver(
  theme: GrafanaTheme2,
  fieldConfig: FieldConfigSource,
  valueField?: Field
): RelationsColorResolver {
  // As in hierarchy: treat "no color config" as the classic palette, because the
  // panel's registered default is PaletteClassic even though Grafana's own default
  // mode is by-value (thresholds).
  const byValue =
    valueField != null &&
    valueField.config.color?.mode != null &&
    getFieldColorModeForField(valueField).isByValue === true;
  const display =
    byValue && valueField ? (valueField.display ?? getDisplayProcessor({ field: valueField, theme })) : undefined;

  return (node, index) => {
    const override = getSeriesColorOverride(fieldConfig, node.name);
    if (override) {
      return override;
    }
    if (node.color != null) {
      return node.color;
    }
    if (display) {
      return (node.value != null ? display(node.value).color : undefined) ?? getPaletteColorByIndex(index, theme);
    }
    return getPaletteColorByIndex(index, theme);
  };
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
 * Node label config. On by default; the label sits below the node.
 * https://echarts.apache.org/en/option.html#series-graph.label
 */
export function getGraphLabel(ctx: RelationsSeriesContext): GraphSeriesOption['label'] {
  const show = ctx.options.relationsShowNodeLabels ?? RELATIONS_SHOW_NODE_LABELS_DEFAULT;
  if (!show) {
    return { show: false };
  }
  return {
    show: true,
    position: 'bottom',
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
 * Series-level link style. The color mode is an ECharts keyword (`source` /
 * `target` / `gradient`); a per-edge `color` overrides it on the item itself.
 * `curveness` is omitted at 0 so straight links stay ECharts-default.
 * https://echarts.apache.org/en/option.html#series-graph.lineStyle
 */
export function getGraphLinkStyle(options: PanelOptions): NonNullable<GraphSeriesOption['lineStyle']> {
  const lineStyle: NonNullable<GraphSeriesOption['lineStyle']> = {
    color: options.relationsLinkColor ?? RELATIONS_LINK_COLOR_DEFAULT,
  };
  if (options.relationsCurveness != null && options.relationsCurveness !== 0) {
    lineStyle.curveness = options.relationsCurveness;
  }
  return lineStyle;
}

/** Map an SVG `stroke-dasharray` to the nearest ECharts `lineStyle.type`. */
function toLineType(dashArray: string | undefined): 'solid' | 'dashed' | 'dotted' | undefined {
  if (dashArray == null || dashArray.trim() === '') {
    return undefined;
  }
  // ECharts' `lineStyle.type` takes solid/dashed/dotted (or a dash array, which its
  // types do not expose here), so approximate: a small first dash reads as dotted.
  const first = Number.parseFloat(dashArray);
  if (!Number.isFinite(first)) {
    return 'dashed';
  }
  return first <= 2 ? 'dotted' : 'dashed';
}

/** Map the model's nodes to ECharts graph data items. */
function toNodeItems(data: NodeGraphData, ctx: RelationsSeriesContext): RelationsNodeItem[] {
  const resolveColor = makeRelationsColorResolver(ctx.theme, ctx.fieldConfig, ctx.valueField);
  const defaultSize = ctx.options.relationsNodeSize ?? RELATIONS_NODE_SIZE_DEFAULT;

  return data.nodes.map((node, index) => {
    const item: RelationsNodeItem = {
      // ECharts keys nodes by `retrieve(id, name, dataIndex)` and resolves each
      // link's source/target against that key (`createGraphFromNodeEdge`). Setting
      // `id` therefore pins link resolution to the frame's `id`, which frees `name`
      // to carry the human-readable `title` for the label.
      id: node.id,
      name: node.name,
      // `noderadius` always wins over the panel-level size.
      symbolSize: node.radius ?? defaultSize,
    };
    if (node.value != null) {
      item.value = node.value;
    }
    const color = resolveColor(node, index);
    if (color != null) {
      item.itemStyle = { color };
    }
    // `arc__*` ring approximated as a single border in the dominant section's color
    // (proportions are lost — see `resolveArcBorderColor`).
    if (node.borderColor != null) {
      item.itemStyle = { ...item.itemStyle, borderColor: node.borderColor, borderWidth: ARC_BORDER_WIDTH };
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
    if (node.sourceRowIndex != null) {
      item.sourceRowIndex = node.sourceRowIndex;
    }
    return item;
  });
}

/** Map the model's links to ECharts graph link items. */
function toLinkItems(links: RelationLink[]): RelationsLinkItem[] {
  return links.map((link) => {
    const item: RelationsLinkItem = { source: link.source, target: link.target };
    if (link.value != null) {
      item.value = link.value;
    }
    const lineStyle: NonNullable<RelationsLinkItem['lineStyle']> = {};
    if (link.color != null) {
      lineStyle.color = link.color;
    }
    if (link.width != null) {
      lineStyle.width = link.width;
    }
    const type = toLineType(link.dashArray);
    if (type != null) {
      lineStyle.type = type;
    }
    if (Object.keys(lineStyle).length > 0) {
      item.lineStyle = lineStyle;
    }
    if (link.sourceRowIndex != null) {
      item.sourceRowIndex = link.sourceRowIndex;
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
    links: toLinkItems(data.links),
    tooltip: seriesTooltip(
      buildRelationsTooltipModel({
        formatValue: ctx.formatValue,
        valueField: ctx.valueField,
        linkValueField: ctx.linkValueField,
      }),
      ctx.tooltipSink
    ),
  };
}
