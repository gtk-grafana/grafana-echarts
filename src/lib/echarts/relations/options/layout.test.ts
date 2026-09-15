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
  it('gives every node a finite position when nothing is pinned', () => {
    const positions = resolveFixedPositions(data().nodes);

    expect(positions.size).toBe(2);
    for (const { x, y } of positions.values()) {
      expect(Number.isFinite(x)).toBe(true);
      expect(Number.isFinite(y)).toBe(true);
    }
  });

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

    const pinnedCentre = { x: 5, y: 0 };
    const pinnedHalfExtent = 5;
    const seeded = positions.get('c')!;

    expect(Math.hypot(seeded.x - pinnedCentre.x, seeded.y - pinnedCentre.y)).toBeGreaterThan(pinnedHalfExtent);
  });

  it('seeds in a pixel-ish space, so an axis-aligned edge is not nudged off its nodes', () => {
    const positions = [...resolveFixedPositions(data().nodes).values()];

    for (const { x, y } of positions) {
      expect(Math.max(Math.abs(x), Math.abs(y))).toBeGreaterThan(50);
    }
  });
});

describe('resolveGraphDraggable', () => {
  it('allows dragging under the fixed layout', () => {
    expect(resolveGraphDraggable(baseOptions({ relationsDraggable: true }), 'none')).toBe(true);
  });

  it('refuses it under force and circular, whatever the option says', () => {
    expect(resolveGraphDraggable(baseOptions({ relationsDraggable: true }), 'force')).toBe(false);
    expect(resolveGraphDraggable(baseOptions({ relationsDraggable: true }), 'circular')).toBe(false);
  });

  it('is off unless asked for', () => {
    expect(resolveGraphDraggable(baseOptions(), 'none')).toBe(false);
  });
});

describe('getGraphForce', () => {
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
