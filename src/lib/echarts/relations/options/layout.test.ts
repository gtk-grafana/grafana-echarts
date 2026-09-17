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
  const graph = (nodeCount: number, edgeCount: number, radius?: number): NodeGraphData => ({
    nodes: Array.from({ length: nodeCount }, (_, index) => ({
      id: `n${index}`,
      name: `Node ${index}`,
      value: index,
      ...(radius == null ? {} : { radius }),
    })),
    links: Array.from({ length: edgeCount }, (_, index) => ({
      id: `e${index}`,
      source: `n${index % nodeCount}`,
      target: `n${(index + 1) % nodeCount}`,
      value: index,
    })),
  });

  it('emits finite bounded automatic values with the stable seed and animation setting', () => {
    const force = getGraphForce(data(), baseOptions(), 400, 300);

    expect(force.initLayout).toBe('none');
    expect(force.friction).toBe(0.2);
    expect(force.layoutAnimation).toBe(false);
    expect(force.edgeLength).toBeGreaterThanOrEqual(30);
    expect(force.edgeLength).toBeLessThanOrEqual(240);
    expect(force.repulsion).toBeGreaterThanOrEqual(60);
    expect(force.repulsion).toBeLessThanOrEqual(960);
    expect(force.gravity).toBeGreaterThanOrEqual(0.2);
    expect(force.gravity).toBeLessThanOrEqual(0.5);
    expect([force.edgeLength, force.repulsion, force.gravity].every((value) => Number.isFinite(value))).toBe(true);
  });

  it('gives a larger panel more room and more nodes less room', () => {
    const smallPanel = getGraphForce(graph(12, 11), baseOptions(), 300, 200);
    const largePanel = getGraphForce(graph(12, 11), baseOptions(), 900, 600);
    const manyNodes = getGraphForce(graph(48, 47), baseOptions(), 900, 600);

    expect(largePanel.edgeLength).toBeGreaterThan(smallPanel.edgeLength as number);
    expect(largePanel.repulsion).toBeGreaterThan(smallPanel.repulsion as number);
    expect(manyNodes.edgeLength).toBeLessThan(largePanel.edgeLength as number);
  });

  it('reserves more plot space for larger nodes', () => {
    const smallNodes = getGraphForce(graph(12, 11, 10), baseOptions(), 600, 400);
    const largeNodes = getGraphForce(graph(12, 11, 100), baseOptions(), 600, 400);

    expect(largeNodes.edgeLength).toBeLessThan(smallNodes.edgeLength as number);
  });

  it('uses stronger gravity for a disconnected graph', () => {
    const connected = getGraphForce(graph(10, 9), baseOptions(), 600, 400);
    const disconnected = getGraphForce(graph(10, 0), baseOptions(), 600, 400);

    expect(disconnected.gravity).toBeGreaterThan(connected.gravity as number);
  });

  it('uses stronger gravity when nodes crowd the plot', () => {
    const roomy = getGraphForce(graph(10, 9), baseOptions(), 300, 200);
    const crowded = getGraphForce(graph(50, 49), baseOptions(), 300, 200);

    expect(crowded.gravity).toBeGreaterThan(roomy.gravity as number);
  });

  it('uses the 400 by 300 fallback when either dimension is invalid', () => {
    const fallback = getGraphForce(graph(10, 9), baseOptions(), 400, 300);

    expect(getGraphForce(graph(10, 9), baseOptions())).toEqual(fallback);
    expect(getGraphForce(graph(10, 9), baseOptions(), Number.NaN, 300)).toEqual(fallback);
    expect(getGraphForce(graph(10, 9), baseOptions(), 400, 0)).toEqual(fallback);
    expect(getGraphForce(graph(10, 9), baseOptions(), Number.POSITIVE_INFINITY, 300)).toEqual(fallback);
  });

  it('keeps mixed explicit values, including zero', () => {
    const force = getGraphForce(
      data(),
      baseOptions({
        relationsRepulsion: 0,
        relationsGravity: 0,
        relationsLayoutAnimation: true,
      }),
      400,
      300
    );

    expect(force).toMatchObject({
      initLayout: 'none',
      friction: 0.2,
      repulsion: 0,
      gravity: 0,
      layoutAnimation: true,
    });
    expect(force.edgeLength).toBeGreaterThan(0);
    expect(getGraphForce(data(), baseOptions({ relationsEdgeLength: 0 }), 400, 300).edgeLength).toBe(0);
  });
});
