import { createTheme, type DataFrame, FieldType, toDataFrame } from '@grafana/data';
import { type TopLevelFormatterParams } from 'echarts/types/dist/shared';
import { GRAPH_EDGES_WIDE, GRAPH_NODES_WIDE } from 'lib/echarts/relations/converters/contract';
import { frameToRelationsGraph } from 'lib/echarts/relations/converters/nodeGraph';
import { getRelationsTooltipMarks } from 'lib/echarts/relations/tooltip/marks';
import { buildRelationsTooltipModel } from 'lib/echarts/relations/tooltip/model';
import { type RelationsLinkItem, type RelationsNodeItem } from 'lib/echarts/relations/tooltip/types';
import { type TooltipModel } from 'lib/echarts/tooltip/types';
import { type PanelOptions } from 'types';

jest.mock('development', () => ({
  debug: jest.fn(),
  LOG_LEVELS: { debug: 0, info: 1, warn: 2, error: 3 },
}));

jest.mock('development', () => ({
  debug: jest.fn(),
  LOG_LEVELS: { debug: 0, info: 1, warn: 2, error: 3 },
}));

const theme = createTheme();

const asParams = (params: unknown) => params as TopLevelFormatterParams;

const wideNodes = (): DataFrame =>
  toDataFrame({
    name: 'nodes',
    meta: { type: GRAPH_NODES_WIDE },
    fields: [
      { name: 'gateway', type: FieldType.number, values: [12], config: { unit: 'ms', decimals: 1, filterable: true } },
      {
        name: 'db',
        type: FieldType.number,
        values: [0.42],
        config: { unit: 'percentunit', decimals: 0, filterable: true },
      },
    ],
  });

const wideEdges = (): DataFrame =>
  toDataFrame({
    name: 'edges',
    meta: { type: GRAPH_EDGES_WIDE },
    fields: [
      {
        name: 'e1',
        type: FieldType.number,
        labels: { source: 'gateway', target: 'db' },
        values: [3.5],
        config: {
          unit: 's',
          decimals: 2,
          filterable: true,
          links: [{ title: 'Trace e1', url: 'http://example.com/e1' }],
        },
      },
      {
        name: 'e2',
        type: FieldType.number,
        labels: { source: 'gateway', target: 'db' },
        values: [25],
        config: { unit: 'percent', decimals: 1, filterable: true },
      },
    ],
  });

const hubEdges = (): DataFrame =>
  toDataFrame({
    name: 'edges',
    meta: { type: GRAPH_EDGES_WIDE },
    fields: [
      {
        name: 'web-gw',
        type: FieldType.number,
        labels: { source: 'web', target: 'gateway' },
        values: [800],
        config: { unit: 'ms', decimals: 0, filterable: true },
      },
      {
        name: 'gw-api',
        type: FieldType.number,
        labels: { source: 'gateway', target: 'api' },
        values: [1.2],
        config: { unit: 's', decimals: 1, filterable: true },
      },
      {
        name: 'gw-gw',
        type: FieldType.number,
        labels: { source: 'gateway', target: 'gateway' },
        values: [4],
        config: { decimals: 0, filterable: true },
      },
    ],
  });

/** One declared node with a `displayName`, so an edge row can be shown to use it. */
const hubNodes = (): DataFrame =>
  toDataFrame({
    name: 'nodes',
    meta: { type: GRAPH_NODES_WIDE },
    fields: [
      {
        name: 'api',
        type: FieldType.number,
        values: [7],
        config: { displayName: 'API', unit: 'ms', filterable: true },
      },
    ],
  });

/** Build the panel configuration used by the tooltip model. */
const options = (extra: Partial<PanelOptions> = {}): PanelOptions =>
  ({
    legend: { showLegend: true, displayMode: 'list', placement: 'bottom', calcs: [] },
    tooltip: { mode: 'single' },
    ...extra,
  }) as PanelOptions;

const modelFor = (
  frames: DataFrame[],
  panelOptions: PanelOptions = options()
): ((params: TopLevelFormatterParams) => TooltipModel) => {
  const data = frameToRelationsGraph(frames, theme, panelOptions.reduceOptions);
  if (!data) {
    throw new Error('fixture produced no graph');
  }
  return buildRelationsTooltipModel(getRelationsTooltipMarks(data, theme, 'utc'), panelOptions);
};

/** A hovered node, as the graph variant emits it. */
const nodeParams = (item: RelationsNodeItem) => asParams({ data: item, color: '#ffffff' });
/** A hovered edge, as all three variants emit it. */
const linkParams = (item: RelationsLinkItem) => asParams({ data: item, color: '#ffffff', dataType: 'edge' });

describe('buildRelationsTooltipModel', () => {
  describe('ad-hoc filters', () => {
    /** An edges frame whose marks carry a real datasource label beside the endpoints. */
    const labelledEdges = (): DataFrame =>
      toDataFrame({
        name: 'edges',
        meta: { type: GRAPH_EDGES_WIDE },
        fields: [
          {
            name: 'e1',
            type: FieldType.number,
            labels: { source: 'gateway', target: 'db', connection_type: 'database' },
            values: [3.5],
            config: { filterable: true },
          },
        ],
      });

    it('offers both endpoints of a hovered edge as one grouped filter', () => {
      const model = modelFor([wideNodes(), wideEdges()]);

      const filters = model(linkParams({ source: 'gateway', target: 'db', markId: 'e1', value: 3.5 })).filters;

      expect(filters).toEqual({
        each: [],
        filterFor: [
          { key: 'source', value: 'gateway' },
          { key: 'target', value: 'db' },
        ],
        filterOut: [
          { key: 'source', value: 'gateway' },
          { key: 'target', value: 'db' },
        ],
      });
    });

    it('keeps an edge’s non-endpoint labels', () => {
      const model = modelFor([labelledEdges()]);

      const filters = model(linkParams({ source: 'gateway', target: 'db', markId: 'e1', value: 3.5 })).filters;

      expect(filters?.each).toEqual([{ key: 'connection_type', value: 'database' }]);
      expect(filters?.filterFor).toEqual([
        { key: 'source', value: 'gateway' },
        { key: 'target', value: 'db' },
        { key: 'connection_type', value: 'database' },
      ]);
    });

    it('uses one source filter for a node in the middle', () => {
      const model = modelFor([hubNodes(), hubEdges()]);

      const filters = model(nodeParams({ id: 'gateway', name: 'gateway' })).filters;

      expect(filters).toEqual({
        each: [],
        filterFor: [{ key: 'source', value: 'gateway' }],
        filterOut: [{ key: 'source', value: 'gateway' }],
      });
    });

    it('asserts the target key for a destination-only node', () => {
      const model = modelFor([hubNodes(), hubEdges()]);

      const filters = model(nodeParams({ id: 'api', name: 'API', value: 7 })).filters;

      expect(filters?.filterFor).toEqual([{ key: 'target', value: 'api' }]);
      expect(filters?.filterOut).toEqual([{ key: 'target', value: 'api' }]);
    });

    it('asserts the source key for an origin-only node', () => {
      const model = modelFor([hubNodes(), hubEdges()]);

      const filters = model(nodeParams({ id: 'web', name: 'web' })).filters;

      expect(filters?.filterFor).toEqual([{ key: 'source', value: 'web' }]);
      expect(filters?.filterOut).toEqual([{ key: 'source', value: 'web' }]);
    });

    it('offers filters for a derived node, on the edges’ opt-in', () => {
      const model = modelFor([wideEdges()]);

      const node = model(nodeParams({ id: 'gateway', name: 'gateway' }));

      expect(node.source).toBeUndefined();
      expect(node.filters?.filterOut).toEqual([{ key: 'source', value: 'gateway' }]);
    });

    /** No opt-in anywhere: the footer's buttons would write filters nothing can answer. */
    it('offers nothing when no field is filterable', () => {
      const plainEdges = toDataFrame({
        name: 'edges',
        meta: { type: GRAPH_EDGES_WIDE },
        fields: [{ name: 'e1', type: FieldType.number, labels: { source: 'gateway', target: 'db' }, values: [3.5] }],
      });
      const model = modelFor([plainEdges]);

      expect(model(linkParams({ source: 'gateway', target: 'db', markId: 'e1', value: 3.5 })).filters).toBeUndefined();
      expect(model(nodeParams({ id: 'gateway', name: 'gateway' })).filters).toBeUndefined();
    });

    it('lets a declared node opt out even where the edges opt in', () => {
      const nodes = toDataFrame({
        name: 'nodes',
        meta: { type: GRAPH_NODES_WIDE },
        fields: [{ name: 'gateway', type: FieldType.number, values: [12], config: { filterable: false } }],
      });
      const model = modelFor([nodes, wideEdges()]);

      expect(model(nodeParams({ id: 'gateway', name: 'gateway', value: 12 })).filters).toBeUndefined();
      // The other end is derived, so it still takes the edges' answer.
      expect(model(nodeParams({ id: 'db', name: 'db' })).filters).toBeDefined();
    });

    /** The mapping, as a `byName` override lands it on one edge's own field. */
    const mappedEdges = (custom: Record<string, string>): DataFrame =>
      toDataFrame({
        name: 'edges',
        meta: { type: GRAPH_EDGES_WIDE },
        fields: [
          {
            name: 'e1',
            type: FieldType.number,
            labels: { source: 'gateway', target: 'db', connection_type: 'database' },
            values: [3.5],
            config: { filterable: true, custom },
          },
          {
            name: 'e2',
            type: FieldType.number,
            labels: { source: 'gateway', target: 'db' },
            values: [7],
            config: { filterable: true },
          },
        ],
      });

    it('writes the endpoints under the mark’s own filter labels', () => {
      const model = modelFor([mappedEdges({ sourceFilterLabel: 'client', targetFilterLabel: 'server' })]);

      expect(
        model(linkParams({ source: 'gateway', target: 'db', markId: 'e1', value: 3.5 })).filters?.filterFor
      ).toEqual([
        { key: 'client', value: 'gateway' },
        { key: 'server', value: 'db' },
        { key: 'connection_type', value: 'database' },
      ]);
    });

    it('lets two edges of one panel answer differently', () => {
      const model = modelFor([mappedEdges({ sourceFilterLabel: 'client', targetFilterLabel: 'server' })]);

      expect(model(linkParams({ source: 'gateway', target: 'db', markId: 'e2', value: 7 })).filters?.filterFor).toEqual(
        [
          { key: 'source', value: 'gateway' },
          { key: 'target', value: 'db' },
        ]
      );
    });

    it('maps a node’s endpoints as well', () => {
      const nodes = toDataFrame({
        name: 'nodes',
        meta: { type: GRAPH_NODES_WIDE },
        fields: [
          {
            name: 'gateway',
            type: FieldType.number,
            values: [12],
            config: { filterable: true, custom: { sourceFilterLabel: 'client', targetFilterLabel: 'server' } },
          },
        ],
      });

      expect(
        modelFor([nodes, wideEdges()])(nodeParams({ id: 'gateway', name: 'gateway', value: 12 })).filters?.filterOut
      ).toEqual([{ key: 'client', value: 'gateway' }]);
    });

    it('falls back to the response’s pair for a node with no field', () => {
      expect(modelFor([wideEdges()])(nodeParams({ id: 'gateway', name: 'gateway' })).filters?.filterOut).toEqual([
        { key: 'source', value: 'gateway' },
      ]);
    });

    it('reads the datasource’s own endpoint labels with nothing configured', () => {
      const clientServer = toDataFrame({
        name: 'edges',
        meta: { type: GRAPH_EDGES_WIDE },
        fields: [
          {
            name: 'e1',
            type: FieldType.number,
            labels: { client: 'gateway', server: 'db' },
            values: [3.5],
            config: { filterable: true },
          },
        ],
      });
      const model = modelFor([clientServer]);

      expect(
        model(linkParams({ source: 'gateway', target: 'db', markId: 'e1', value: 3.5 })).filters?.filterFor
      ).toEqual([
        { key: 'client', value: 'gateway' },
        { key: 'server', value: 'db' },
      ]);
    });

    it('honours half an override on the half it names', () => {
      const model = modelFor([mappedEdges({ sourceFilterLabel: 'client' })]);

      expect(
        model(linkParams({ source: 'gateway', target: 'db', markId: 'e1', value: 3.5 })).filters?.filterFor
      ).toEqual([
        { key: 'client', value: 'gateway' },
        { key: 'target', value: 'db' },
        { key: 'connection_type', value: 'database' },
      ]);
    });

    describe('a multi-level flow', () => {
      const twoLevels = (): DataFrame =>
        toDataFrame({
          name: 'edges',
          meta: { type: GRAPH_EDGES_WIDE },
          fields: [
            {
              name: 'prod-->ns-a',
              type: FieldType.number,
              labels: { source: 'prod', target: 'ns-a', cluster: 'prod', namespace: 'ns-a' },
              values: [4],
              config: { filterable: true },
            },
            {
              name: 'ns-a-->checkout',
              type: FieldType.number,
              labels: { source: 'ns-a', target: 'checkout', namespace: 'ns-a', workload: 'checkout' },
              values: [1],
              config: { filterable: true },
            },
          ],
        });

      const node = (id: string) => modelFor([twoLevels()])(nodeParams({ id, name: id })).filters;

      it('filters each level under its own keys', () => {
        const model = modelFor([twoLevels()]);

        expect(
          model(linkParams({ source: 'prod', target: 'ns-a', markId: 'prod-->ns-a', value: 4 })).filters?.filterFor
        ).toEqual([
          { key: 'cluster', value: 'prod' },
          { key: 'namespace', value: 'ns-a' },
        ]);
        expect(
          model(linkParams({ source: 'ns-a', target: 'checkout', markId: 'ns-a-->checkout', value: 1 })).filters
            ?.filterFor
        ).toEqual([
          { key: 'namespace', value: 'ns-a' },
          { key: 'workload', value: 'checkout' },
        ]);
      });

      it('offers no separate button for a recovered key', () => {
        const model = modelFor([twoLevels()]);

        expect(
          model(linkParams({ source: 'prod', target: 'ns-a', markId: 'prod-->ns-a', value: 4 })).filters?.each
        ).toEqual([]);
      });

      it('resolves the middle node to one deduped key', () => {
        expect(node('ns-a')).toEqual({
          each: [],
          filterFor: [{ key: 'namespace', value: 'ns-a' }],
          filterOut: [{ key: 'namespace', value: 'ns-a' }],
        });
      });

      it('asserts the root node’s own key', () => {
        expect(node('prod')?.filterFor).toEqual([{ key: 'cluster', value: 'prod' }]);
      });

      it('asserts a sink node’s own key rather than the source key', () => {
        expect(node('checkout')).toEqual({
          each: [],
          filterFor: [{ key: 'workload', value: 'checkout' }],
          filterOut: [{ key: 'workload', value: 'checkout' }],
        });
      });
    });

    it('resolves a node’s keys from the edges touching it', () => {
      const clientServer = toDataFrame({
        name: 'edges',
        meta: { type: GRAPH_EDGES_WIDE },
        fields: [
          {
            name: 'e1',
            type: FieldType.number,
            labels: { client: 'gateway', server: 'db' },
            values: [3.5],
            config: { filterable: true },
          },
          {
            name: 'e2',
            type: FieldType.number,
            labels: { client: 'db', server: 'cache' },
            values: [1],
            config: { filterable: true },
          },
        ],
      });
      const model = modelFor([clientServer]);

      expect(model(nodeParams({ id: 'db', name: 'db' })).filters).toEqual({
        each: [],
        filterFor: [{ key: 'client', value: 'db' }],
        filterOut: [{ key: 'client', value: 'db' }],
      });
    });

    it('falls back to the response’s pair for a node with no incident edge', () => {
      const model = modelFor([wideNodes(), wideEdges()]);

      expect(model(nodeParams({ id: 'orphan', name: 'orphan' })).filters?.filterOut).toEqual([
        { key: 'source', value: 'orphan' },
      ]);
    });

    it('claims both directions for a node with only a self-loop', () => {
      const selfOnly = toDataFrame({
        name: 'edges',
        meta: { type: GRAPH_EDGES_WIDE },
        fields: [
          {
            name: 'e1',
            type: FieldType.number,
            labels: { source: 'gateway', target: 'gateway' },
            values: [1],
            config: { filterable: true },
          },
        ],
      });

      expect(modelFor([selfOnly])(nodeParams({ id: 'gateway', name: 'gateway' })).filters?.filterOut).toEqual([
        { key: 'source', value: 'gateway' },
      ]);
    });

    it('dedupes two endpoints that resolve to the same filter', () => {
      const selfLoop = toDataFrame({
        name: 'edges',
        meta: { type: GRAPH_EDGES_WIDE },
        fields: [
          {
            name: 'e1',
            type: FieldType.number,
            labels: { source: 'gateway', target: 'gateway' },
            values: [1],
            config: { filterable: true, custom: { sourceFilterLabel: 'svc', targetFilterLabel: 'svc' } },
          },
        ],
      });
      const model = modelFor([selfLoop]);

      expect(
        model(linkParams({ source: 'gateway', target: 'gateway', markId: 'e1', value: 1 })).filters?.filterFor
      ).toEqual([{ key: 'svc', value: 'gateway' }]);
    });
  });
});

describe('getRelationsTooltipMarks', () => {});
