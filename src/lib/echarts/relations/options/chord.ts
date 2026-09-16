import { type ChordSeriesOption } from 'echarts';

import { type NodeGraphData, type RelationLink, type RelationNode } from 'lib/echarts/relations/converters/model';

import { seriesTooltip } from 'lib/echarts/tooltip/option';

import { type PanelOptions } from 'types';

import {
  CHORD_CLOCKWISE_DEFAULT,
  CHORD_LINK_OPACITY_DEFAULT,
  CHORD_MIN_ANGLE_DEFAULT,
  CHORD_PAD_ANGLE_DEFAULT,
  CHORD_START_ANGLE_DEFAULT,
} from 'editor/relations/chord';
import { RELATIONS_LINK_COLOR_DEFAULT, RELATIONS_SHOW_NODE_LABELS_DEFAULT } from 'editor/relations/constants';
import { type RelationsSeriesContext } from 'lib/echarts/relations/context';
import { resolveRelationsFocusAdjacency } from 'lib/echarts/relations/options/emphasis';
import {
  getRelationsLabelLayout,
  getRelationsLabelStyle,
  getRelationsNodeLabelFormatter,
} from 'lib/echarts/relations/options/labels';
import { buildRelationsTooltipModel } from 'lib/echarts/relations/tooltip/model';
import { type RelationsLinkItem, type RelationsNodeItem } from 'lib/echarts/relations/tooltip/types';

/**
 * Node label config.
 * https://echarts.apache.org/en/option.html#series-chord.label
 */
export function getChordLabel(ctx: RelationsSeriesContext): ChordSeriesOption['label'] {
  const show = ctx.options.relationsShowNodeLabels ?? RELATIONS_SHOW_NODE_LABELS_DEFAULT;
  if (!show) {
    return { show: false };
  }
  return {
    show: true,
    // The formatter adds the stat when node values are enabled.
    formatter: getRelationsNodeLabelFormatter(ctx) ?? '{b}',
    ...getRelationsLabelStyle(ctx),
  };
}

/** ECharts' own `series-chord.lineStyle.color` default (`ChordSeries.ts`). */
const CHORD_LINK_COLOR_ECHARTS_DEFAULT = 'source';

/**
 * Ribbon styling.
 * https://echarts.apache.org/en/option.html#series-chord.lineStyle
 */
export function getChordLinkStyle(options: PanelOptions): ChordSeriesOption['lineStyle'] | undefined {
  const lineStyle: NonNullable<ChordSeriesOption['lineStyle']> = {};
  const color = options.relationsLinkColor ?? RELATIONS_LINK_COLOR_DEFAULT;
  if (color !== CHORD_LINK_COLOR_ECHARTS_DEFAULT) {
    lineStyle.color = color;
  }
  if (options.relationsChordLinkOpacity != null && options.relationsChordLinkOpacity !== CHORD_LINK_OPACITY_DEFAULT) {
    lineStyle.opacity = options.relationsChordLinkOpacity;
  }
  return Object.keys(lineStyle).length > 0 ? lineStyle : undefined;
}

/**
 * Hover emphasis.
 * https://echarts.apache.org/en/option.html#series-chord.emphasis
 */
export function getChordEmphasis(options: PanelOptions): NonNullable<ChordSeriesOption['emphasis']> {
  return { focus: resolveRelationsFocusAdjacency(options) ? 'adjacency' : 'none' };
}

/** Map the model's nodes to ECharts chord data items. */
function toChordNodeItems(nodes: RelationNode[]): RelationsNodeItem[] {
  return nodes.map((node) => {
    const item: RelationsNodeItem = { id: node.id, name: node.name };
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
    return item;
  });
}

/** Map the model's links to ECharts chord link items. */
function toChordLinkItems(links: RelationLink[]): RelationsLinkItem[] {
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

/**
 * Chord series: a ring of node arcs joined by weighted ribbons.
 * https://echarts.apache.org/en/option.html#series-chord
 */
export function getChordSeries(data: NodeGraphData, ctx: RelationsSeriesContext): ChordSeriesOption {
  const { relationsChordStartAngle, relationsChordClockwise, relationsChordPadAngle, relationsChordMinAngle } =
    ctx.options;
  const lineStyle = getChordLinkStyle(ctx.options);
  // Chord has no native equivalent of `avoidLabelOverlap`.
  const labelLayout = getRelationsLabelLayout(ctx.options);

  return {
    type: 'chord',
    ...(relationsChordStartAngle != null && relationsChordStartAngle !== CHORD_START_ANGLE_DEFAULT
      ? { startAngle: relationsChordStartAngle }
      : {}),
    ...(relationsChordClockwise != null && relationsChordClockwise !== CHORD_CLOCKWISE_DEFAULT
      ? { clockwise: relationsChordClockwise }
      : {}),
    ...(relationsChordPadAngle != null && relationsChordPadAngle !== CHORD_PAD_ANGLE_DEFAULT
      ? { padAngle: relationsChordPadAngle }
      : {}),
    ...(relationsChordMinAngle != null && relationsChordMinAngle !== CHORD_MIN_ANGLE_DEFAULT
      ? { minAngle: relationsChordMinAngle }
      : {}),
    ...(lineStyle ? { lineStyle } : {}),
    ...(labelLayout ? { labelLayout } : {}),
    // Always emit this value because the plugin default differs from ECharts.
    emphasis: getChordEmphasis(ctx.options),
    label: getChordLabel(ctx),
    zlevel: ctx.options.zLevel?.series,
    data: toChordNodeItems(data.nodes),
    links: toChordLinkItems(data.links),
    tooltip: seriesTooltip(buildRelationsTooltipModel(ctx.marks, ctx.options), ctx.tooltipSink),
  };
}
