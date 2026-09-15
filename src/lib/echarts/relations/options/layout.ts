import { type GraphSeriesOption } from 'echarts';
import {
  RELATIONS_EDGE_LENGTH_DEFAULT,
  RELATIONS_LAYOUT_ANIMATION_DEFAULT,
  RELATIONS_LAYOUT_DEFAULT,
  RELATIONS_REPULSION_DEFAULT,
} from 'editor/relations/constants';
import { type NodeGraphData } from 'lib/echarts/relations/converters/model';
import { type PanelOptions } from 'types';

/**
 * The force simulation's seed layout, pinned so a render is reproducible.
 * https://echarts.apache.org/en/option.html#series-graph.force.initLayout
 */
const RELATIONS_FORCE_INIT_LAYOUT = 'circular';

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
 * Force-layout tuning.
 * https://echarts.apache.org/en/option.html#series-graph.force
 */
export function getGraphForce(options: PanelOptions): NonNullable<GraphSeriesOption['force']> {
  const force: NonNullable<GraphSeriesOption['force']> = {
    initLayout: RELATIONS_FORCE_INIT_LAYOUT,
    repulsion: options.relationsRepulsion ?? RELATIONS_REPULSION_DEFAULT,
    edgeLength: options.relationsEdgeLength ?? RELATIONS_EDGE_LENGTH_DEFAULT,
    layoutAnimation: options.relationsLayoutAnimation ?? RELATIONS_LAYOUT_ANIMATION_DEFAULT,
  };
  if (options.relationsGravity != null) {
    force.gravity = options.relationsGravity;
  }
  return force;
}
