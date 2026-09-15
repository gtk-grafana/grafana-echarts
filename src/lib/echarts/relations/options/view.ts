import { type GraphSeriesOption } from 'echarts';
import {
  RELATIONS_NODE_SIZE_DEFAULT,
  RELATIONS_SHOW_NODE_LABELS_DEFAULT,
  RELATIONS_SHOW_NODE_VALUES_DEFAULT,
} from 'editor/relations/constants';
import { type NodeGraphData } from 'lib/echarts/relations/converters/model';
import { type PanelOptions } from 'types';

/** ECharts' default graph-label font size in pixels. */
const GRAPH_LABEL_FONT_SIZE = 12;
/** ECharts' default distance between a graph node and its label in pixels. */
const GRAPH_LABEL_DISTANCE = 5;
/** ECharts fits a graph view to 80% when its width and height are unset. */
const GRAPH_VIEW_SIZE_RATIO = 0.8;
/** Keep an automatic shift useful when a panel is too short to fit all content. */
const MAX_AUTO_CENTER_Y = 75;

/** Count the lines that the lowest node label can use. */
function getGraphLabelLineCount(data: NodeGraphData, options: PanelOptions): number {
  const showValues = options.relationsShowNodeValues ?? RELATIONS_SHOW_NODE_VALUES_DEFAULT;
  return data.nodes.reduce(
    (largest, node) => Math.max(largest, node.name.split('\n').length + (showValues && node.value != null ? 1 : 0)),
    0
  );
}

/** Return the largest ECharts symbol size after node overrides are applied. */
function getLargestGraphNodeSize(data: NodeGraphData, options: PanelOptions): number {
  const defaultSize = options.relationsNodeSize ?? RELATIONS_NODE_SIZE_DEFAULT;
  return data.nodes.reduce((largest, node) => {
    const size = node.radius ?? defaultSize;
    return Number.isFinite(size) ? Math.max(largest, size) : largest;
  }, 0);
}

/**
 * Move a circular graph up to reserve space for bottom labels.
 * A value above 50% moves the graph up because ECharts maps that data point to the plot center.
 * https://echarts.apache.org/en/option.html#series-graph.center
 */
export function getAutomaticGraphCenter(
  data: NodeGraphData,
  options: PanelOptions,
  layout: GraphSeriesOption['layout'],
  plotHeight?: number
): GraphSeriesOption['center'] | undefined {
  const showLabels = options.relationsShowNodeLabels ?? RELATIONS_SHOW_NODE_LABELS_DEFAULT;
  if (
    layout !== 'circular' ||
    !showLabels ||
    plotHeight == null ||
    !Number.isFinite(plotHeight) ||
    plotHeight <= 0 ||
    data.nodes.length === 0
  ) {
    return undefined;
  }

  const nodeRadius = Math.max(0, getLargestGraphNodeSize(data, options)) / 2;
  const labelHeight = getGraphLabelLineCount(data, options) * GRAPH_LABEL_FONT_SIZE;
  const bottomFootprint = nodeRadius + GRAPH_LABEL_DISTANCE + labelHeight;
  // Keep the existing position for a default node with one label line.
  const defaultFootprint = RELATIONS_NODE_SIZE_DEFAULT / 2 + GRAPH_LABEL_DISTANCE + GRAPH_LABEL_FONT_SIZE;
  const viewMargin = (plotHeight * (1 - GRAPH_VIEW_SIZE_RATIO)) / 2;
  const availableBottomSpace = Math.max(defaultFootprint, viewMargin);
  const overflow = bottomFootprint - availableBottomSpace;
  if (overflow <= 0) {
    return undefined;
  }

  const centerY = Math.min(MAX_AUTO_CENTER_Y, 50 + (overflow / (plotHeight * GRAPH_VIEW_SIZE_RATIO)) * 100);
  return ['50%', `${Number(centerY.toFixed(2))}%`];
}

/**
 * Resolve the ECharts pan mode.
 * https://echarts.apache.org/en/option.html#series-graph.roam
 */
export function resolveRelationsRoam(options: PanelOptions): 'move' | false {
  return resolveRelationsPan(options) ? 'move' : false;
}

/** Check whether drag-to-pan is enabled. */
export function resolveRelationsPan(options: PanelOptions): boolean {
  return options.relationsPan === true;
}

/** Check whether the panel shows zoom buttons. */
export function resolveRelationsZoom(options: PanelOptions): boolean {
  return options.relationsZoom === true;
}

/** Saved ECharts view state. */
export interface RelationsViewState {
  zoom?: number;
  center?: [number, number];
}

/**
 * The saved pan/zoom, for the two variants that have a view to save.
 * https://echarts.apache.org/en/option.html#series-graph.zoom
 */
export function getRelationsViewState(options: PanelOptions): RelationsViewState {
  if (options.relationsRememberView !== true) {
    return {};
  }
  return {
    ...(options.relationsViewZoom != null ? { zoom: options.relationsViewZoom } : {}),
    ...(options.relationsViewCenter != null ? { center: options.relationsViewCenter } : {}),
  };
}
