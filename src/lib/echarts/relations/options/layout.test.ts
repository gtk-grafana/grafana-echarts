import { type NodeGraphData } from 'lib/echarts/relations/converters/model';
import {
  getGraphForce,
  getGraphLayout,
  resolveFixedPositions,
  resolveGraphDraggable,
} from 'lib/echarts/relations/options/layout';
import { getPaletteColorByIndex } from 'lib/echarts/style';
import { nodeGraph, relationsOptions, relationsTheme } from 'test/relations';

const theme = relationsTheme;

const baseOptions = relationsOptions;

/**
 * Nodes reach this layer already coloured — the reader resolves every mark's colour
 * through its own display processor and palettes whatever is left
 * (`converters/readNodes.ts`), so a fixture that omitted `color` would not be one the
 * panel can produce. Colour *resolution* is tested there; this file only checks that
 * the resolved colour is painted.
 */
const data = (extra: Partial<NodeGraphData> = {}): NodeGraphData =>
  nodeGraph({
    nodes: [
      { id: 'a', name: 'A', value: 1, color: getPaletteColorByIndex(0, theme) },
      { id: 'b', name: 'B', value: 2, color: getPaletteColorByIndex(1, theme) },
    ],
    ...extra,
  });

describe('getGraphLayout', () => {
  it('defaults to force', () => {
    expect(getGraphLayout(data(), baseOptions())).toBe('force');
  });

  it('honors an explicit layout option', () => {
    expect(getGraphLayout(data(), baseOptions({ relationsLayout: 'circular' }))).toBe('circular');
  });

  it('uses none when every node pins fixedx/fixedy', () => {
    const pinned = data({
      nodes: [
        { id: 'a', name: 'A', value: 1, fixedX: 0, fixedY: 0 },
        { id: 'b', name: 'B', value: 2, fixedX: 10, fixedY: 10 },
      ],
    });
    expect(getGraphLayout(pinned, baseOptions())).toBe('none');
  });

  it('stays on force when only some nodes pin coordinates', () => {
    // The node-graph spec is all-or-nothing: "If used, all nodes must provide a value".
    const partial = data({
      nodes: [
        { id: 'a', name: 'A', value: 1, fixedX: 0, fixedY: 0 },
        { id: 'b', name: 'B', value: 2 },
      ],
    });
    expect(getGraphLayout(partial, baseOptions())).toBe('force');
  });

  it('an explicit layout still wins over pinned coordinates', () => {
    const pinned = data({ nodes: [{ id: 'a', name: 'A', value: 1, fixedX: 0, fixedY: 0 }] });
    expect(getGraphLayout(pinned, baseOptions({ relationsLayout: 'force' }))).toBe('force');
  });
});

describe('resolveFixedPositions', () => {
  // The whole point: a node with no `x` lays out at `[NaN, NaN]` and is not drawn, so
  // "Fixed" on data that pins nothing used to blank the panel.
  it('gives every node a finite position when nothing is pinned', () => {
    const positions = resolveFixedPositions(data().nodes);

    expect(positions.size).toBe(2);
    for (const { x, y } of positions.values()) {
      expect(Number.isFinite(x)).toBe(true);
      expect(Number.isFinite(y)).toBe(true);
    }
  });

  // Deterministic, so a refresh does not reshuffle the graph — the same reason the force
  // simulation is seeded (`RELATIONS_FORCE_INIT_LAYOUT`).
  it('seeds the same positions for the same nodes', () => {
    expect([...resolveFixedPositions(data().nodes)]).toEqual([...resolveFixedPositions(data().nodes)]);
  });

  it('leaves a pinned node exactly where it is pinned', () => {
    const pinned = data({
      nodes: [
        { id: 'a', name: 'A', value: 1, fixedX: 5, fixedY: 6 },
        { id: 'b', name: 'B', value: 2, fixedX: 7, fixedY: 8 },
      ],
    });

    expect([...resolveFixedPositions(pinned.nodes)]).toEqual([
      ['a', { x: 5, y: 6 }],
      ['b', { x: 7, y: 8 }],
    ]);
  });

  // Partially-pinned data: the pinned marks keep their exact coordinates and the rest go
  // on a ring outside their bounding box, so they read as "not placed yet" rather than
  // landing on top of the pinned cluster.
  it('seeds the unpinned nodes clear of the pinned ones', () => {
    const partial = data({
      nodes: [
        { id: 'a', name: 'A', value: 1, fixedX: 0, fixedY: 0 },
        { id: 'b', name: 'B', value: 2, fixedX: 10, fixedY: 0 },
        { id: 'c', name: 'C', value: 3 },
      ],
    });
    const positions = resolveFixedPositions(partial.nodes);

    expect(positions.get('a')).toEqual({ x: 0, y: 0 });
    expect(positions.get('b')).toEqual({ x: 10, y: 0 });

    /**
     * The property, not the number. "Outside the pinned box" is what the seeding is
     * for; the exact ring radius is an implementation choice that a reader has no way
     * to check and that would fail this test on any harmless tuning. Asserted as
     * "further from the centre of the pinned box than the box's own half-extent", which
     * is the claim the comment used to make and the constant only implied.
     */
    const pinnedCentre = { x: 5, y: 0 };
    const pinnedHalfExtent = 5;
    const seeded = positions.get('c')!;

    expect(Math.hypot(seeded.x - pinnedCentre.x, seeded.y - pinnedCentre.y)).toBeGreaterThan(pinnedHalfExtent);
  });

  /**
   * **The reported "edges are not attached to any nodes".** The seed ring was a *unit* circle
   * on the reasoning that the view rescales the bounding box anyway, so only the shape
   * survives — true for the nodes, and false for the edges between them.
   *
   * A graph edge is drawn by an `ECLinePath` with `subPixelOptimize: true`, and zrender's
   * `subPixelOptimizeLine` shifts an axis-aligned line by half a *unit* to land a 1px stroke
   * on a pixel centre. Those units are the graph's data space, so on a unit ring the shift was
   * half the graph: the two edges of a four-node ring that happen to share an x or a y were
   * drawn ~159px away from their nodes. A pixel-ish space makes it sub-pixel again.
   *
   * Asserted as an order of magnitude rather than an exact radius: the number is arbitrary,
   * the scale is not.
   */
  it('seeds in a pixel-ish space, so an axis-aligned edge is not nudged off its nodes', () => {
    const positions = [...resolveFixedPositions(data().nodes).values()];

    for (const { x, y } of positions) {
      expect(Math.max(Math.abs(x), Math.abs(y))).toBeGreaterThan(50);
    }
  });
});

describe('resolveGraphDraggable', () => {
  // Fixed is the only layout that reads a stored coordinate back, so it is the only one where
  // a drag is an edit rather than a nudge the next render discards.
  it('allows dragging under the fixed layout', () => {
    expect(resolveGraphDraggable(baseOptions({ relationsDraggable: true }), 'none')).toBe(true);
  });

  /**
   * Refused as well as hidden, so a dashboard that saved `relationsDraggable: true` alongside
   * a force layout gets a working panel rather than an interaction that rearranges the graph
   * on every mouse move — `layoutAnimation` is off, so ECharts iterates the simulation to
   * convergence inside the `drag` handler.
   */
  it('refuses it under force and circular, whatever the option says', () => {
    expect(resolveGraphDraggable(baseOptions({ relationsDraggable: true }), 'force')).toBe(false);
    expect(resolveGraphDraggable(baseOptions({ relationsDraggable: true }), 'circular')).toBe(false);
  });

  it('is off unless asked for', () => {
    expect(resolveGraphDraggable(baseOptions(), 'none')).toBe(false);
  });
});

describe('getGraphForce', () => {
  // Always emitted, because three of the four keys disagree with ECharts on purpose:
  // the simulation is seeded so a render is reproducible, its steps are not drawn so a
  // refresh does not jiggle, and it is spread far wider so the labels have room.
  it('always emits the seeded, non-animated, spread-out defaults', () => {
    expect(getGraphForce(baseOptions())).toEqual({
      initLayout: 'circular',
      repulsion: 400,
      edgeLength: 200,
      layoutAnimation: false,
    });
  });

  it('lets each knob be overridden, and adds gravity only when set', () => {
    expect(getGraphForce(baseOptions({ relationsRepulsion: 200 }))).toMatchObject({ repulsion: 200 });
    expect(getGraphForce(baseOptions())).not.toHaveProperty('gravity');
    expect(
      getGraphForce(
        baseOptions({
          relationsRepulsion: 200,
          relationsGravity: 0.2,
          relationsEdgeLength: 40,
          relationsLayoutAnimation: true,
        })
      )
    ).toEqual({ initLayout: 'circular', repulsion: 200, gravity: 0.2, edgeLength: 40, layoutAnimation: true });
  });
});
