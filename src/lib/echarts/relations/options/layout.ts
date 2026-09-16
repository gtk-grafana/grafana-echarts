import { type GraphSeriesOption } from 'echarts';
import {
  RELATIONS_LAYOUT_ANIMATION_DEFAULT,
  RELATIONS_LAYOUT_DEFAULT,
  RELATIONS_NODE_SIZE_DEFAULT,
} from 'editor/relations/constants';
import { type NodeGraphData } from 'lib/echarts/relations/converters/model';
import { type PanelOptions } from 'types';

/**
 * The force simulation's seed layout, pinned so a render is reproducible.
 * https://echarts.apache.org/en/option.html#series-graph.force.initLayout
 */
const RELATIONS_FORCE_INIT_LAYOUT = 'circular';

/** Plot size used when Grafana does not supply valid dimensions. */
const DEFAULT_PLOT_SIZE = { width: 400, height: 300 };

/** Empty space between the largest node and each plot edge. */
const FORCE_EDGE_PADDING = 16;

/** Automatic force bounds accepted by ECharts. */
const EDGE_LENGTH_BOUNDS = { min: 30, max: 240 };
const REPULSION_BOUNDS = { min: 60, max: 960 };
const GRAVITY_BOUNDS = { min: 0.2, max: 0.5 };

/**
 * Resolve the graph layout.
 * https://echarts.apache.org/en/option.html#series-graph.layout
 */
export function getGraphLayout(data: NodeGraphData, options: PanelOptions): 'force' | 'circular' | 'none' {
  if (options.relationsLayout != null) {
    return options.relationsLayout;
  }
  const allPinned = data.nodes.length > 0 && data.nodes.every((node) => node.fixedX != null && node.fixedY != null);
  return allPinned ? 'none' : RELATIONS_LAYOUT_DEFAULT;
}

/** Check whether fixed-layout graph nodes can be dragged. */
export function resolveGraphDraggable(options: PanelOptions, layout: 'force' | 'circular' | 'none'): boolean {
  return options.relationsDraggable === true && layout === 'none';
}

/** A node's position in the graph's own coordinate space. See {@link resolveFixedPositions}. */
export interface GraphPoint {
  x: number;
  y: number;
}

/**
 * Use a pixel-sized coordinate range for the default seed ring.
 *
 * Graph lines enable the zrender `subPixelOptimize` operation.
 * It moves an axis-aligned line by half a data unit before ECharts scales the graph to the panel.
 * With radius `1`, this operation moved two ring edges 159 pixels away from their nodes.
 * Radius `400` keeps the shift smaller than one rendered pixel, so edges stay attached.
 * https://echarts.apache.org/en/option.html#series-graph.layout
 */
const FIXED_SEED_RADIUS = 400;

/** Distance between pinned and seeded nodes. */
const FIXED_SEED_MARGIN = 1.25;

/** Every node's position under `layout: 'none'`. */
export function resolveFixedPositions(nodes: NodeGraphData['nodes']): Map<string, GraphPoint> {
  const positions = new Map<string, GraphPoint>();
  const pinned: GraphPoint[] = [];
  for (const node of nodes) {
    if (node.fixedX != null && node.fixedY != null) {
      const point = { x: node.fixedX, y: node.fixedY };
      positions.set(node.id, point);
      pinned.push(point);
    }
  }

  const seeded = nodes.filter((node) => !positions.has(node.id));
  if (seeded.length === 0) {
    return positions;
  }

  const ring = seedRing(pinned);
  seeded.forEach((node, index) => {
    const angle = (2 * Math.PI * index) / seeded.length;
    positions.set(node.id, {
      x: ring.x + ring.radius * Math.cos(angle),
      y: ring.y + ring.radius * Math.sin(angle),
    });
  });
  return positions;
}

/** Return the center and radius of the seed ring. */
function seedRing(pinned: readonly GraphPoint[]): GraphPoint & { radius: number } {
  if (pinned.length === 0) {
    return { x: 0, y: 0, radius: FIXED_SEED_RADIUS };
  }
  const xs = pinned.map((point) => point.x);
  const ys = pinned.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  // Use the default radius when pinned nodes have no extent.
  const extent = Math.max(maxX - minX, maxY - minY) / 2 || FIXED_SEED_RADIUS;
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2, radius: extent * FIXED_SEED_MARGIN };
}

/**
 * Force-layout tuning from graph density and available plot space.
 * https://echarts.apache.org/en/option.html#series-graph.force
 */
export function getGraphForce(
  data: NodeGraphData,
  options: PanelOptions,
  plotWidth?: number,
  plotHeight?: number
): NonNullable<GraphSeriesOption['force']> {
  const automatic = getAutomaticForce(data, options, plotWidth, plotHeight);
  const force: NonNullable<GraphSeriesOption['force']> = {
    initLayout: RELATIONS_FORCE_INIT_LAYOUT,
    // https://echarts.apache.org/en/option.html#series-graph.force.repulsion
    repulsion: options.relationsRepulsion ?? automatic.repulsion,
    // https://echarts.apache.org/en/option.html#series-graph.force.edgeLength
    edgeLength: options.relationsEdgeLength ?? automatic.edgeLength,
    // https://echarts.apache.org/en/option.html#series-graph.force.layoutAnimation
    layoutAnimation: options.relationsLayoutAnimation ?? RELATIONS_LAYOUT_ANIMATION_DEFAULT,
  };
  // https://echarts.apache.org/en/option.html#series-graph.force.gravity
  force.gravity = options.relationsGravity ?? automatic.gravity;
  return force;
}

/** Calculate finite automatic values before panel overrides are applied. */
function getAutomaticForce(
  data: NodeGraphData,
  options: PanelOptions,
  plotWidth: number | undefined,
  plotHeight: number | undefined
): Required<Pick<NonNullable<GraphSeriesOption['force']>, 'edgeLength' | 'repulsion' | 'gravity'>> {
  const dimensions = getPlotDimensions(plotWidth, plotHeight);
  const largestDiameter = getLargestNodeDiameter(data, options);
  const reservedSpace = largestDiameter + 2 * FORCE_EDGE_PADDING;
  const usableWidth = Math.max(1, dimensions.width - reservedSpace);
  const usableHeight = Math.max(1, dimensions.height - reservedSpace);
  const nodeCount = Math.max(1, data.nodes.length);
  const gridSpacing = getGridSpacing(nodeCount, usableWidth, usableHeight);
  const averageDegree = (2 * data.links.length) / nodeCount;
  const connectedness = clamp(data.links.length / Math.max(1, nodeCount - 1), 0, 1);

  const degreeScale = 0.75 + 0.1 * Math.min(averageDegree, 5);
  const edgeLength = clamp(gridSpacing * degreeScale, EDGE_LENGTH_BOUNDS.min, EDGE_LENGTH_BOUNDS.max);
  const springPressure = clamp(2 + averageDegree * 0.5, 2, 4);
  const repulsion = clamp(edgeLength * springPressure, REPULSION_BOUNDS.min, REPULSION_BOUNDS.max);
  const crowding = 1 - clamp(gridSpacing / Math.max(1, largestDiameter + 2 * FORCE_EDGE_PADDING), 0, 1);
  const gravity = clamp(
    GRAVITY_BOUNDS.min + (1 - connectedness) * 0.2 + crowding * 0.1,
    GRAVITY_BOUNDS.min,
    GRAVITY_BOUNDS.max
  );

  return { edgeLength, repulsion, gravity };
}

/** Use the whole fallback plot when either supplied dimension is invalid. */
function getPlotDimensions(width: number | undefined, height: number | undefined): typeof DEFAULT_PLOT_SIZE {
  if (
    width == null ||
    height == null ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return DEFAULT_PLOT_SIZE;
  }
  return { width, height };
}

/** Return the largest node diameter used by the graph series. */
function getLargestNodeDiameter(data: NodeGraphData, options: PanelOptions): number {
  const defaultDiameter = finiteNonNegative(options.relationsNodeSize) ?? RELATIONS_NODE_SIZE_DEFAULT;
  return data.nodes.reduce(
    (largest, node) => Math.max(largest, finiteNonNegative(node.radius) ?? defaultDiameter),
    defaultDiameter
  );
}

/** Select the adjacent integer grid with the largest minimum cell size. */
function getGridSpacing(nodeCount: number, width: number, height: number): number {
  const idealColumns = Math.sqrt((nodeCount * width) / height);
  const candidates = [Math.floor(idealColumns), Math.ceil(idealColumns)].map((columns) => clamp(columns, 1, nodeCount));
  return Math.max(...candidates.map((columns) => Math.min(width / columns, height / Math.ceil(nodeCount / columns))));
}

/** Keep invalid model values out of automatic force calculations. */
function finiteNonNegative(value: number | undefined): number | undefined {
  return value != null && Number.isFinite(value) && value >= 0 ? value : undefined;
}

/** Restrict a calculated value to an inclusive range. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
