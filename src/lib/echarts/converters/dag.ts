import { type RelationLink } from 'lib/echarts/converters/nodeGraph';

/**
 * Cycle policy for the sankey render variant.
 *
 * Kept separate from `nodeGraph.ts` because this is graph theory, not frame
 * reading: it takes the already-converted link list and returns a DAG.
 *
 * **Why this has to exist.** ECharts' `sankeyLayout.ts` runs Kahn's algorithm and
 * then `throw new Error('Sankey is a DAG, the original data has cycle!')`. That
 * throw is *not* behind a `__DEV__` guard, so it survives into production builds —
 * a cyclic edge set is a blank, broken panel rather than a degraded render. Service
 * graphs routinely contain cycles (retries, bidirectional RPC, A->B->A call
 * chains), and the TestData `node_graph` scenario generates them deliberately.
 *
 * So cycles are broken here, **before** the links reach ECharts, unconditionally.
 * This is not expressible as a user option: the only alternative to breaking a
 * cycle is crashing. `graph` and `chord` accept any digraph and never call this.
 *
 * See ../../../../data-plane/node-graph.md ("Pitfalls for a converter") and the
 * `sankey` row in ../../../../data-plane/echarts-coverage.md.
 */

/** DFS vertex colors. A `GRAY` target means the edge closes a cycle. */
const WHITE = 0;
const GRAY = 1;
const BLACK = 2;

/** An acyclic link set, plus how many links were removed to get there. */
export interface SankeyLinks {
  links: RelationLink[];
  /**
   * Links removed outright: self-loops plus back-edges. Duplicate `source->target`
   * pairs are **not** counted, because merging sums their weights rather than
   * discarding anything. Surfaced in the panel so silent edge-dropping is not a
   * correctness surprise (see `getSankeyDroppedNote`).
   */
  droppedCount: number;
}

/**
 * Drop self-loops and merge duplicate `source->target` pairs, summing weights.
 *
 * A self-loop has no sankey representation at all (its ribbon would have to leave
 * and re-enter the same node column), and duplicate pairs would otherwise be laid
 * out as separate overlapping ribbons between the same two nodes. Insertion order
 * is preserved so palette colors and snapshots stay stable.
 */
function mergeParallelLinks(links: RelationLink[]): { links: RelationLink[]; selfLoops: number } {
  // Two-level map rather than a joined string key: node ids come from user data and
  // could contain any separator we picked.
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
      // Sum the weights; the first link's id and styling win, since a merged ribbon
      // can only carry one of each.
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

/**
 * Remove every back-edge found by a depth-first traversal, which leaves a DAG:
 * an edge into a vertex still on the DFS stack (`GRAY`) is the edge that closes a
 * cycle, and deleting all such edges from a digraph is guaranteed to make it
 * acyclic.
 *
 * **Traversal order is deterministic** — roots and adjacency lists both follow
 * first appearance in the link list, which follows frame row order. An unstable
 * order would drop a *different* edge on each render, so the panel would change
 * shape between refreshes and canvas snapshots would flake.
 *
 * Iterative rather than recursive so a long chain cannot overflow the stack.
 */
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
      // BLACK is a forward or cross edge — already fully explored, no cycle.
    }
  }

  return { links: links.filter((link) => !dropped.has(link)), backEdges: dropped.size };
}

/**
 * Turn an arbitrary link set into one ECharts' sankey layout will accept: no
 * self-loops, no parallel edges, no cycles.
 *
 * Runs unconditionally on the sankey path. A pure DAG passes through with its links
 * unchanged and `droppedCount: 0`.
 */
export function toSankeyLinks(links: RelationLink[]): SankeyLinks {
  const { links: merged, selfLoops } = mergeParallelLinks(links);
  const { links: acyclic, backEdges } = dropBackEdges(merged);
  return { links: acyclic, droppedCount: selfLoops + backEdges };
}
