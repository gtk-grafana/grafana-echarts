import { type GraphSeriesOption } from 'echarts';
import { type CallbackDataParams, type LabelLayoutOptionCallback } from 'echarts/types/dist/shared';
import {
  RELATIONS_HIDE_OVERLAPPING_LABELS_DEFAULT,
  RELATIONS_LABEL_OVERFLOW_DEFAULT,
  RELATIONS_LABEL_WIDTH_DEFAULT,
  RELATIONS_SHOW_EDGE_VALUES_DEFAULT,
  RELATIONS_SHOW_NODE_LABELS_DEFAULT,
  RELATIONS_SHOW_NODE_VALUES_DEFAULT,
} from 'editor/relations/constants';
import { type RelationsSeriesContext } from 'lib/echarts/relations/context';

import { formatEChartsValue } from 'lib/echarts/style';
import { type PanelOptions } from 'types';

import { formatDerivedMarkValue } from 'lib/echarts/relations/tooltip/marks';

/**
 * The three chart variants use this formatter to show node labels in the same way.
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
    // Derived nodes have no field formatter.
    const formatValue = (id != null ? ctx.marks?.nodes.get(id)?.formatValue : undefined) ?? formatDerivedMarkValue;
    return `${name}\n${formatEChartsValue(stat, formatValue)}`;
  };
}

/** The stat carried on a relations node item, whichever key the variant used. */
function readNodeStat(data: CallbackDataParams['data']): number | string | undefined {
  if (typeof data !== 'object' || data === null) {
    return undefined;
  }
  const stat: unknown = 'stat' in data ? data.stat : undefined;
  const value: unknown = 'value' in data ? data.value : undefined;
  const raw = stat ?? value;
  return typeof raw === 'number' || typeof raw === 'string' ? raw : undefined;
}

/** Read the node mark key. */
function readNodeId(data: CallbackDataParams['data']): string | undefined {
  if (typeof data !== 'object' || data === null || !('id' in data)) {
    return undefined;
  }
  const id: unknown = data.id;
  return typeof id === 'string' ? id : undefined;
}

/** Shared label style. */
export interface RelationsLabelStyle {
  color: string;
  fontFamily: string;
  /** Never `'none'`: that is ECharts' own default, so it is written as no key at all. */
  overflow?: 'truncate' | 'break' | 'breakAll';
  width?: number;
}

/**
 * Build shared label styling.
 * https://echarts.apache.org/en/option.html#series-graph.label
 */
export function getRelationsLabelStyle(ctx: RelationsSeriesContext): RelationsLabelStyle {
  const overflow = ctx.options.relationsLabelOverflow ?? RELATIONS_LABEL_OVERFLOW_DEFAULT;
  return {
    color: ctx.theme.colors.text.primary,
    fontFamily: ctx.theme.typography.fontFamily,
    // ECharts ignores `overflow` without a width.
    ...(overflow !== 'none'
      ? { overflow, width: ctx.options.relationsLabelWidth ?? RELATIONS_LABEL_WIDTH_DEFAULT }
      : {}),
  };
}

/**
 * Drop a label that would collide with one already placed, via ECharts' shared label-layout stage.
 * https://echarts.apache.org/en/option.html#series-graph.labelLayout
 */
export function getRelationsLabelLayout(options: PanelOptions): LabelLayoutOptionCallback | undefined {
  const hide = options.relationsHideOverlappingLabels ?? RELATIONS_HIDE_OVERLAPPING_LABELS_DEFAULT;
  if (!hide) {
    return undefined;
  }
  // Edge labels use a separate overlap pass.
  return (params) => (params.dataType === 'edge' ? {} : { hideOverlap: true });
}

/**
 * Node label config.
 * https://echarts.apache.org/en/option.html#series-graph.label
 */
export function getGraphLabel(ctx: RelationsSeriesContext): GraphSeriesOption['label'] {
  const show = ctx.options.relationsShowNodeLabels ?? RELATIONS_SHOW_NODE_LABELS_DEFAULT;
  if (!show) {
    return { show: false };
  }
  return getVisibleGraphLabel(ctx);
}

/** Build the graph label used for normal and hover states. */
export function getVisibleGraphLabel(ctx: RelationsSeriesContext): NonNullable<GraphSeriesOption['label']> {
  const formatter = getRelationsNodeLabelFormatter(ctx);
  return {
    show: true,
    position: 'bottom',
    ...(formatter ? { formatter } : {}),
    ...getRelationsLabelStyle(ctx),
  };
}

/** Shared edge-label configuration. */
export interface RelationsEdgeLabel extends RelationsLabelStyle {
  show: true;
  formatter: (params: CallbackDataParams) => string;
}

/**
 * Each edge's own weight, drawn on the link.
 * https://echarts.apache.org/en/option.html#series-graph.edgeLabel
 */
export function getRelationsEdgeLabel(ctx: RelationsSeriesContext): RelationsEdgeLabel | undefined {
  if ((ctx.options.relationsShowEdgeValues ?? RELATIONS_SHOW_EDGE_VALUES_DEFAULT) !== true) {
    return undefined;
  }
  return {
    show: true,
    formatter: (params: CallbackDataParams) => {
      const value = readEdgeValue(params.data);
      if (value == null) {
        return '';
      }
      const markId = readEdgeMarkId(params.data);
      const formatValue = (markId != null ? ctx.marks?.links.get(markId)?.formatValue : undefined) ?? undefined;
      return formatEChartsValue(value, formatValue ?? ctx.formatValue);
    },
    ...getRelationsLabelStyle(ctx),
  };
}

/** Read a relations link weight. */
function readEdgeValue(data: CallbackDataParams['data']): number | string | undefined {
  if (typeof data !== 'object' || data === null || !('value' in data)) {
    return undefined;
  }
  const value: unknown = data.value;
  return typeof value === 'number' || typeof value === 'string' ? value : undefined;
}

/** Read an edge tooltip key. */
function readEdgeMarkId(data: CallbackDataParams['data']): string | undefined {
  if (typeof data !== 'object' || data === null || !('markId' in data)) {
    return undefined;
  }
  const markId: unknown = data.markId;
  return typeof markId === 'string' ? markId : undefined;
}
