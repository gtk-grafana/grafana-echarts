import { type RelationLink } from 'lib/echarts/relations/converters/model';

/** DFS vertex colors. A `GRAY` target means the edge closes a cycle. */
const WHITE = 0;
const GRAY = 1;
const BLACK = 2;

/** An acyclic link set, plus how many links were removed to get there. */
export interface SankeyLinks {
  links: RelationLink[];
  /** Links removed outright: self-loops plus back-edges. */
  droppedCount: number;
}

/** Drop self-loops and merge duplicate `source->target` pairs, summing weights. */
function mergeParallelLinks(links: RelationLink[]): { links: RelationLink[]; selfLoops: number } {
  // Node ids can contain any string separator.
  const seen = new Map<string, Map<string, RelationLink>>();
  const merged: RelationLink[] = [];
  let selfLoops = 0;

  for (const link of links) {
    if (link.source === link.target) {
      selfLoops++;
      continue;
    }
    const targets = seen.get(link.source) ?? new Map<string, RelationLink>();
    const existing = targets.get(link.target);
    if (existing) {
      // Sum weights and keep the first link's identity and style.
      existing.value = (existing.value ?? 0) + (link.value ?? 0);
      continue;
    }
    // Copied so the caller's links (shared with the `graph` variant) are untouched.
    const copy: RelationLink = { ...link };
    targets.set(link.target, copy);
    seen.set(link.source, targets);
    merged.push(copy);
  }

  return { links: merged, selfLoops };
}

/** Remove every back-edge found by a depth-first traversal. */
function dropBackEdges(links: RelationLink[]): { links: RelationLink[]; backEdges: number } {
  const adjacency = new Map<string, RelationLink[]>();
  // First-appearance vertex order, used as the DFS root order.
  const vertices: string[] = [];
  const addVertex = (id: string) => {
    if (!adjacency.has(id)) {
      adjacency.set(id, []);
      vertices.push(id);
    }
  };
  for (const link of links) {
    addVertex(link.source);
    addVertex(link.target);
    adjacency.get(link.source)?.push(link);
  }

  const color = new Map<string, number>();
  const dropped = new Set<RelationLink>();

  for (const root of vertices) {
    if ((color.get(root) ?? WHITE) !== WHITE) {
      continue;
    }
    color.set(root, GRAY);
    // Each frame holds a vertex plus how far through its adjacency list we are.
    const stack: Array<{ vertex: string; next: number }> = [{ vertex: root, next: 0 }];
    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      const edges = adjacency.get(frame.vertex) ?? [];
      if (frame.next >= edges.length) {
        color.set(frame.vertex, BLACK);
        stack.pop();
        continue;
      }
      const edge = edges[frame.next++];
      const target = edge.target;
      const targetColor = color.get(target) ?? WHITE;
      if (targetColor === GRAY) {
        // Target is an ancestor on the current path: this edge closes a cycle.
        dropped.add(edge);
        continue;
      }
      if (targetColor === WHITE) {
        color.set(target, GRAY);
        stack.push({ vertex: target, next: 0 });
      }
      // A black target is complete and does not close a cycle.
    }
  }

  return { links: links.filter((link) => !dropped.has(link)), backEdges: dropped.size };
}

/** Remove links that ECharts sankey cannot lay out. */
export function toSankeyLinks(links: RelationLink[]): SankeyLinks {
  const { links: merged, selfLoops } = mergeParallelLinks(links);
  const { links: acyclic, backEdges } = dropBackEdges(merged);
  return { links: acyclic, droppedCount: selfLoops + backEdges };
}
