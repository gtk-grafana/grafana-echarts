import { type NodeGraphData, type RelationLink } from 'lib/echarts/relations/converters/model';
import {
  getRelationsMarkLimitIssue,
  resolveRelationsBudgetVariant,
  resolveRelationsMaxMarks,
} from 'lib/echarts/relations/markLimits';
import { type RelationsBudgetVariant } from 'lib/echarts/relations/types';
import { type PanelOptions } from 'types';

const graph = (nodeCount: number, linkCount: number): NodeGraphData => {
  const nodes = Array.from({ length: nodeCount }, (_, index) => ({
    id: `n${index}`,
    name: `Node ${index}`,
    value: 1,
  }));
  const links: RelationLink[] = [];
  for (let distance = 1; links.length < linkCount; distance++) {
    for (let source = 0; source + distance < nodeCount && links.length < linkCount; source++) {
      const target = source + distance;
      links.push({ id: `e${source}-${target}`, source: `n${source}`, target: `n${target}`, value: 1 });
    }
  }
  return { nodes, links };
};

const options = (extra: Partial<PanelOptions> = {}): PanelOptions =>
  ({ editorMode: 'advanced', ...extra }) as PanelOptions;

const context = (variant: RelationsBudgetVariant, extra: Partial<PanelOptions> = {}) => ({
  seriesType: variant === 'sankey' || variant === 'chord' ? variant : ('graph' as const),
  options: options({
    relationsLayout: variant === 'fixed' ? 'none' : variant === 'force' || variant === 'circular' ? variant : undefined,
    ...extra,
  }),
});

describe('Relations mark limits', () => {
  it.each([
    ['force', 200, 300],
    ['circular', 500, 500],
    ['fixed', 500, 500],
    ['sankey', 100, 300],
    ['chord', 40, 160],
  ] as const)('accepts the %s boundary', (variant, nodes, links) => {
    expect(getRelationsMarkLimitIssue(graph(nodes, links), context(variant))).toBeUndefined();
  });

  it.each([
    ['force', 201, 0, 'nodeCount'],
    ['force', 200, 301, 'markCount'],
    ['circular', 500, 501, 'markCount'],
    ['fixed', 501, 0, 'nodeCount'],
    ['sankey', 101, 0, 'nodeCount'],
    ['sankey', 100, 301, 'markCount'],
    ['chord', 41, 1, 'nodeCount'],
    ['chord', 40, 161, 'markCount'],
  ] as const)('rejects %s data over its %s', (variant, nodes, links, count) => {
    expect(getRelationsMarkLimitIssue(graph(nodes, links), context(variant))).toMatchObject({
      reason: 'mark-limit',
      variant,
      [count]: count === 'nodeCount' ? nodes : nodes + links,
    });
  });

  it('counts only Sankey links that remain after conversion', () => {
    const data = graph(3, 2);
    data.links.push(
      { ...data.links[0], id: 'parallel', value: 2 },
      { id: 'loop', source: 'n0', target: 'n0', value: 1 },
      { id: 'cycle', source: 'n2', target: 'n0', value: 1 }
    );

    expect(getRelationsMarkLimitIssue(data, context('sankey', { relationsMaxMarks: 5 }))).toBeUndefined();
    expect(getRelationsMarkLimitIssue(data, context('sankey', { relationsMaxMarks: 4 }))).toMatchObject({
      linkCount: 2,
      markCount: 5,
    });
  });

  it('does not mutate graph data while it counts Sankey links', () => {
    const data = graph(4, 4);
    data.links.push({ ...data.links[0], id: 'parallel', value: 3 });
    const before = JSON.stringify(data);

    const first = getRelationsMarkLimitIssue(data, context('sankey', { relationsMaxMarks: 1 }));
    const second = getRelationsMarkLimitIssue(data, context('sankey', { relationsMaxMarks: 1 }));

    expect(first).toEqual(second);
    expect(JSON.stringify(data)).toBe(before);
  });

  it('uses valid Advanced values above or below the automatic mark limit', () => {
    expect(resolveRelationsMaxMarks(500, options({ relationsMaxMarks: 250 }))).toBe(250);
    expect(resolveRelationsMaxMarks(500, options({ relationsMaxMarks: 900 }))).toBe(900);
  });

  it('accepts marks above the automatic mark limit when Advanced mode raises it', () => {
    expect(getRelationsMarkLimitIssue(graph(200, 301), context('force', { relationsMaxMarks: 501 }))).toBeUndefined();
  });

  it('accepts nodes above the automatic node limit when Advanced mode raises it', () => {
    expect(
      getRelationsMarkLimitIssue(graph(501, 499), context('circular', { relationsMaxMarks: 1000 }))
    ).toBeUndefined();
  });

  it('uses a configured mark limit as the active node limit', () => {
    expect(getRelationsMarkLimitIssue(graph(1001, 0), context('circular', { relationsMaxMarks: 1000 }))).toMatchObject({
      nodeCount: 1001,
      maxNodes: 1000,
      maxMarks: 1000,
    });
  });

  it('keeps automatic limits when Max marks is undefined or inactive', () => {
    expect(getRelationsMarkLimitIssue(graph(501, 0), context('circular'))).toMatchObject({
      maxNodes: 500,
      maxMarks: 1000,
    });
    expect(
      getRelationsMarkLimitIssue(graph(501, 0), context('circular', { editorMode: 'default', relationsMaxMarks: 2000 }))
    ).toMatchObject({ maxNodes: 500, maxMarks: 1000 });
  });

  it('ignores invalid and Default-mode stored values', () => {
    expect(resolveRelationsMaxMarks(500, options({ relationsMaxMarks: 0 }))).toBe(500);
    expect(resolveRelationsMaxMarks(500, options({ relationsMaxMarks: 2.5 }))).toBe(500);
    expect(resolveRelationsMaxMarks(500, options({ editorMode: 'default', relationsMaxMarks: 250 }))).toBe(500);
    expect(resolveRelationsMaxMarks(500, options({ editorMode: 'api', relationsMaxMarks: 900 }))).toBe(900);
  });

  it('uses the fixed budget when every graph node has a position', () => {
    const data = graph(2, 1);
    data.nodes = data.nodes.map((node, index) => ({ ...node, fixedX: index, fixedY: index }));

    expect(resolveRelationsBudgetVariant(data, { seriesType: 'graph', options: options() })).toBe('fixed');
  });
});
