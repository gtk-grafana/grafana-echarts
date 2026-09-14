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
 * Where the nodes go: which ECharts layout runs, whether the user may drag a node, the
 * force simulation's tuning, and the seed ring that keeps a render reproducible.
 *
 * Graph-only — a sankey and a chord each compute their own geometry from the model.
 */

/**
 * The force simulation's **seed** layout, pinned so a render is reproducible.
 *
 * With no seed, `forceHelper` places every node at `Math.random()` within the view rect
 * and the simulation walks from there, so the same frames draw a different graph every
 * time — the panel appears to shuffle its nodes on each refresh. `'circular'` seeds them
 * on a ring in data order instead, which is deterministic and, being already spread out,
 * converges to a tidier result.
 *
 * Not exposed as an option: "lay this out differently every time" is not a thing to
 * want. The one residual case is a node whose stat is exactly 0 in a set that sums above
 * it — `circularLayout(…, 'value')` gives it a zero-width slice, so it can land on its
 * neighbour's angle and the coincident-node repulse falls back to `Math.random()`.
 * https://echarts.apache.org/en/option.html#series-graph.force.initLayout
 */
const RELATIONS_FORCE_INIT_LAYOUT = 'circular';

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
 * Whether graph nodes can be dragged: only under `layout: 'none'`, whatever the option says.
 *
 * The option is hidden for the other two layouts (`editor/relations/interaction.ts`), and
 * this is the half that makes a dashboard which saved the pair behave rather than merely stop
 * offering it. Neither excluded layout can *keep* a drag — both re-solve on every render —
 * and both are actively broken while dragging:
 *
 * - **circular** re-solves the ring from the drop point on every pointer move, so the node
 *   under the cursor is not the node that moves;
 * - **force** re-runs the simulation, and `layoutAnimation` is off by default here so ECharts
 *   iterates it to convergence synchronously inside the `drag` handler — every mouse move
 *   rearranges the whole graph. See {@link getGraphForce}.
 *
 * Resolved against the *resolved* layout rather than the option, so data that pins every node
 * (which infers `none`) stays draggable with `Layout` left unset. See {@link getGraphLayout}.
 */
export function resolveGraphDraggable(options: PanelOptions, layout: 'force' | 'circular' | 'none'): boolean {
  return options.relationsDraggable === true && layout === 'none';
}

/** A node's position in the graph's own coordinate space. See {@link resolveFixedPositions}. */
export interface GraphPoint {
  x: number;
  y: number;
}

/**
 * Ring radius used to seed nodes when **nothing** is pinned.
 *
 * `createViewCoordSys` takes the bounding box of the emitted `x`/`y` and scales it onto the
 * panel rect, so the *shape* of the point set is all that survives and any radius draws the
 * same graph. The magnitude still matters, and this used to be `1`:
 *
 * **zrender sub-pixel-optimizes axis-aligned edges, in whatever space the coordinates are
 * in.** A graph edge is an `ECLinePath` with `subPixelOptimize: true`, so
 * `subPixelOptimizeLine` nudges a horizontal or vertical line by half a unit to land a 1px
 * stroke on a pixel centre (`round(y1 * 2) === round(y2 * 2)` picks it out, and
 * `strokeNoScale` means the width it compares against is `1`). Those coordinates are the
 * graph's *data* space, which the view scales onto the panel — so on a unit ring the "half
 * pixel" was half a data unit, and the two edges of a four-node ring that happen to be
 * axis-aligned were drawn 159px away from the nodes they joined. That is the reported
 * "edges are not attached to any nodes", and why dragging a node fixed it: the drop is
 * almost never exactly axis-aligned, so the nudge stops applying.
 *
 * A pixel-ish radius makes the nudge sub-pixel again, which is what it was written to be.
 * It is also the space a drag writes back (`useRelationsPersistence`), so the stored
 * coordinates stay well conditioned across reloads.
 */
const FIXED_SEED_RADIUS = 400;

/**
 * How far outside the pinned nodes' bounding box the seeded ones are placed, as a
 * multiple of its half-extent. Just clear of the pinned cluster rather than lost beside
 * it — the box is what the view scales to fit, so a large multiplier would shrink the
 * pinned layout to make room.
 */
const FIXED_SEED_MARGIN = 1.25;

/**
 * Every node's position under `layout: 'none'` — its own pinned pair when it has one,
 * a deterministic seed when it does not.
 *
 * **The seed is what makes "Fixed" a usable choice rather than a blank panel.** ECharts'
 * `simpleLayout` does `node.setLayout([+model.get('x'), +model.get('y')])`, so a node with
 * no `x` lays out at `[NaN, NaN]` and neither it nor any link touching it is drawn. Since
 * `fixedx`/`fixedy` are per-mark overrides nobody has written yet on a fresh panel,
 * selecting Fixed used to blank the visualization outright and give the user nothing to
 * drag or override *from*.
 *
 * Seeded on a ring in data order, matching the force simulation's own `initLayout`
 * (`RELATIONS_FORCE_INIT_LAYOUT`): deterministic, so the panel does not reshuffle on
 * refresh, and already spread out, so the labels have room. Partially-pinned data is the
 * interesting case — the seeds go on a ring *around* the pinned bounding box, so pinned
 * marks keep their relative layout and the rest are visibly "not placed yet".
 */
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

/** Centre and radius of the seed ring: around the pinned nodes, or the origin if none. */
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
  // A single pinned node, or a row of them, has a zero extent on one axis — fall back to
  // the unit radius rather than stacking every seed on top of it.
  const extent = Math.max(maxX - minX, maxY - minY) / 2 || FIXED_SEED_RADIUS;
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2, radius: extent * FIXED_SEED_MARGIN };
}

/**
 * Force-layout tuning. **Always** emitted, unlike the other option groups here,
 * because three of its four keys disagree with ECharts' own defaults on purpose:
 * the simulation is seeded (`initLayout`) so a render is reproducible, its steps are
 * not drawn (`layoutAnimation`) so a refresh does not jiggle, and it is spread far
 * wider (`repulsion` / `edgeLength`) so the labels have room. `gravity` is the one
 * key left to ECharts when unset.
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
