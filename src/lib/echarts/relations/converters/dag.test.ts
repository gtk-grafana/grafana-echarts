import { toSankeyLinks } from 'lib/echarts/relations/converters/dag';
import { type RelationLink } from 'lib/echarts/relations/converters/model';

/** Build a link with a default weight, so cases read as just the topology. */
const link = (source: string, target: string, value = 1): RelationLink => ({
  id: `${source}--${target}`,
  source,
  target,
  value,
});

/** `source->target` pairs of the result, for comparing topology in order. */
const pairs = (links: RelationLink[]): string[] => links.map((l) => `${l.source}->${l.target}`);

describe('toSankeyLinks', () => {
  describe('acyclic input', () => {
    it('passes a pure DAG through unmodified', () => {
      const links = [link('a', 'b'), link('b', 'c'), link('a', 'c')];

      const result = toSankeyLinks(links);

      expect(pairs(result.links)).toEqual(['a->b', 'b->c', 'a->c']);
      expect(result.droppedCount).toBe(0);
    });

    it('keeps both arms of a diamond', () => {
      const links = [link('a', 'b'), link('a', 'c'), link('b', 'd'), link('c', 'd')];

      const result = toSankeyLinks(links);

      expect(result.links).toHaveLength(4);
      expect(result.droppedCount).toBe(0);
    });

    it('returns an empty result for no links', () => {
      expect(toSankeyLinks([])).toEqual({ links: [], droppedCount: 0 });
    });

    it('does not mutate the input links', () => {
      const links = [link('a', 'b', 5), link('a', 'b', 7)];

      toSankeyLinks(links);

      expect(links.map((l) => l.value)).toEqual([5, 7]);
    });
  });

  describe('cycles', () => {
    it('drops the back-edge of a direct cycle', () => {
      const result = toSankeyLinks([link('a', 'b'), link('b', 'a')]);

      expect(pairs(result.links)).toEqual(['a->b']);
      expect(result.droppedCount).toBe(1);
    });

    it('drops the back-edge of a longer cycle', () => {
      const result = toSankeyLinks([link('a', 'b'), link('b', 'c'), link('c', 'a')]);

      expect(pairs(result.links)).toEqual(['a->b', 'b->c']);
      expect(result.droppedCount).toBe(1);
    });

    // Two independent cycles sharing no edges each lose exactly one link.
    it('breaks each cycle separately', () => {
      const result = toSankeyLinks([link('a', 'b'), link('b', 'a'), link('c', 'd'), link('d', 'c')]);

      expect(pairs(result.links)).toEqual(['a->b', 'c->d']);
      expect(result.droppedCount).toBe(2);
    });

    it('drops the same edge on repeated runs', () => {
      const build = () => [link('a', 'b'), link('b', 'c'), link('c', 'a'), link('c', 'd')];

      const first = toSankeyLinks(build());
      const second = toSankeyLinks(build());

      expect(pairs(first.links)).toEqual(pairs(second.links));
      expect(first.droppedCount).toBe(second.droppedCount);
    });

    it('leaves no cycle behind in a densely cyclic graph', () => {
      const result = toSankeyLinks([
        link('a', 'b'),
        link('b', 'c'),
        link('c', 'a'),
        link('c', 'd'),
        link('d', 'b'),
        link('d', 'a'),
      ]);

      expect(hasCycle(result.links)).toBe(false);
      expect(result.droppedCount).toBeGreaterThan(0);
    });
  });

  describe('self-loops', () => {
    it('drops a self-loop and counts it', () => {
      const result = toSankeyLinks([link('a', 'a'), link('a', 'b')]);

      expect(pairs(result.links)).toEqual(['a->b']);
      expect(result.droppedCount).toBe(1);
    });

    it('drops a self-loop that is the only link', () => {
      const result = toSankeyLinks([link('a', 'a')]);

      expect(result.links).toEqual([]);
      expect(result.droppedCount).toBe(1);
    });
  });

  describe('parallel edges', () => {
    it('merges duplicate pairs and sums their weights', () => {
      const result = toSankeyLinks([link('a', 'b', 3), link('a', 'b', 4), link('b', 'c', 1)]);

      expect(pairs(result.links)).toEqual(['a->b', 'b->c']);
      expect(result.links[0].value).toBe(7);
    });

    it('does not count a merge as a drop', () => {
      const result = toSankeyLinks([link('a', 'b', 1), link('a', 'b', 1)]);

      expect(result.droppedCount).toBe(0);
    });

    it('keeps the first link id and styling', () => {
      const first: RelationLink = { id: 'first', source: 'a', target: 'b', value: 1, color: 'red' };
      const second: RelationLink = { id: 'second', source: 'a', target: 'b', value: 1, color: 'blue' };

      const result = toSankeyLinks([first, second]);

      expect(result.links[0].id).toBe('first');
      expect(result.links[0].color).toBe('red');
    });

    it('treats the reverse direction as a cycle, not a duplicate', () => {
      const result = toSankeyLinks([link('a', 'b', 2), link('b', 'a', 3)]);

      expect(pairs(result.links)).toEqual(['a->b']);
      expect(result.links[0].value).toBe(2);
      expect(result.droppedCount).toBe(1);
    });

    // A null weight is valid. Merging must not produce NaN.
    it('merges null weights without producing NaN', () => {
      const result = toSankeyLinks([
        { id: 'e1', source: 'a', target: 'b', value: null },
        { id: 'e2', source: 'a', target: 'b', value: 5 },
      ]);

      expect(result.links[0].value).toBe(5);
    });
  });
});

/** Independent cycle check (Kahn's algorithm), mirroring what ECharts' layout does. */
function hasCycle(links: RelationLink[]): boolean {
  const outgoing = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  for (const l of links) {
    outgoing.set(l.source, [...(outgoing.get(l.source) ?? []), l.target]);
    inDegree.set(l.target, (inDegree.get(l.target) ?? 0) + 1);
    inDegree.set(l.source, inDegree.get(l.source) ?? 0);
  }
  const queue = [...inDegree].filter(([, degree]) => degree === 0).map(([id]) => id);
  let visited = 0;
  while (queue.length > 0) {
    const node = queue.shift();
    if (node == null) {
      break;
    }
    visited++;
    for (const target of outgoing.get(node) ?? []) {
      const next = (inDegree.get(target) ?? 0) - 1;
      inDegree.set(target, next);
      if (next === 0) {
        queue.push(target);
      }
    }
  }
  return visited !== inDegree.size;
}
