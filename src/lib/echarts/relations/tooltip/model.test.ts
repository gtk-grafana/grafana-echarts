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

/** One undeclared node with `count` edges leaving it, for the row cap. */
const fanOutEdges = (count: number): DataFrame =>
  toDataFrame({
    name: 'edges',
    meta: { type: GRAPH_EDGES_WIDE },
    fields: Array.from({ length: count }, (_unused, index) => ({
      name: `e${index}`,
      type: FieldType.number,
      labels: { source: 'hub', target: `leaf-${index}` },
      values: [index],
      config: { decimals: 0 },
    })),
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
  describe('per-mark formatting', () => {
    it('formats each node with its own unit and decimals', () => {
      const model = modelFor([wideNodes(), wideEdges()]);

      expect(model(nodeParams({ id: 'gateway', name: 'gateway', value: 12 })).rows[0].value).toBe('12.0 ms');
      expect(model(nodeParams({ id: 'db', name: 'db', value: 0.42 })).rows[0].value).toBe('42%');
    });

    it('formats an edge with the edge field’s unit, not the nodes frame’s', () => {
      const model = modelFor([wideNodes(), wideEdges()]);

      const link = model(linkParams({ source: 'gateway', target: 'db', markId: 'e1', value: 3.5 }));

      expect(link.header).toEqual({ label: 'gateway → db', value: '' });
      expect(link.rows[0].value).toBe('3.50 s');
    });

    it('tells parallel edges apart by their mark id', () => {
      const model = modelFor([wideNodes(), wideEdges()]);

      expect(model(linkParams({ source: 'gateway', target: 'db', markId: 'e2', value: 25 })).rows[0].value).toBe(
        '25.0%'
      );
    });

    it('formats the sankey/chord `stat` through the hovered node’s field', () => {
      const model = modelFor([wideNodes(), wideEdges()]);

      expect(model(nodeParams({ id: 'gateway', name: 'gateway', stat: 12 })).rows[0].value).toBe('12.0 ms');
    });
  });

  describe('per-mark data links', () => {
    it('resolves a node back to its own field and row', () => {
      const model = modelFor([wideNodes(), wideEdges()]);

      expect(model(nodeParams({ id: 'db', name: 'db', value: 0.42 })).source).toEqual({
        field: expect.objectContaining({ name: 'db' }),
        rowIndex: 0,
      });
    });

    it('resolves an edge back to its own field, not a node’s', () => {
      const model = modelFor([wideNodes(), wideEdges()]);

      const link = model(linkParams({ source: 'gateway', target: 'db', markId: 'e1', value: 3.5 }));

      expect(link.source?.field.name).toBe('e1');
      expect(link.source?.field.config.links).toEqual([{ title: 'Trace e1', url: 'http://example.com/e1' }]);
      expect(link.rows[0].source).toBe(link.source);
    });

    it('gives a derived node no source', () => {
      const model = modelFor([wideEdges()]);

      const node = model(nodeParams({ id: 'gateway', name: 'gateway' }));

      expect(node.source).toBeUndefined();
      expect(node.header.label).toBe('gateway');
    });

    it('omits the value row for a node with no stat', () => {
      const model = modelFor([wideEdges()]);

      expect(model(nodeParams({ id: 'gateway', name: 'gateway' })).rows.map((row) => row.label)).not.toContain(
        'Median'
      );
    });

    it('still formats a stat a fieldless node does carry, plainly and with no unit', () => {
      const model = modelFor([wideEdges()]);

      expect(model(nodeParams({ id: 'gateway', name: 'gateway', value: 2 })).rows[0].value).toBe('2');
    });
  });

  describe('marks that share an id', () => {
    /** One frame per series, endpoints in labels: the shape with no pivot in front of it. */
    const rawSeries = (source: string, target: string, config: Record<string, unknown>): DataFrame =>
      toDataFrame({
        fields: [
          { name: 'Time', type: FieldType.time, values: [1700000000000] },
          { name: 'Value', type: FieldType.number, labels: { source, target }, values: [1], config },
        ],
      });

    const rawEdges = (): DataFrame[] => [
      rawSeries('gateway', 'db', { unit: 's', decimals: 2, links: [{ title: 'Trace', url: 'http://example.com' }] }),
      rawSeries('db', 'cache', { unit: 'percent', decimals: 1 }),
    ];

    it('formats each mark with its own field, not the last one to be read', () => {
      const data = frameToRelationsGraph(rawEdges(), theme)!;
      const model = buildRelationsTooltipModel(getRelationsTooltipMarks(data, theme, 'utc'));
      const [first, second] = data.links;

      // The edges share an id but use different keys.
      expect([first.id, second.id]).toEqual(['Value', 'Value']);
      expect([first.markKey, second.markKey]).toEqual(['gateway-->db', 'db-->cache']);

      const links = [first, second].map((link) =>
        model(linkParams({ source: link.source, target: link.target, markId: link.markKey, value: 3.5 }))
      );

      expect(links.map((link) => link.rows[0].value)).toEqual(['3.50 s', '3.5%']);
      expect(links.map((link) => link.header.label)).toEqual(['gateway → db', 'db → cache']);
    });

    it('surfaces only the mark that carries data links', () => {
      const data = frameToRelationsGraph(rawEdges(), theme)!;
      const model = buildRelationsTooltipModel(getRelationsTooltipMarks(data, theme, 'utc'));

      const sources = data.links.map(
        (link) => model(linkParams({ source: link.source, target: link.target, markId: link.markKey })).source
      );

      expect(sources[0]?.field.config.links).toEqual([{ title: 'Trace', url: 'http://example.com' }]);
      expect(sources[1]?.field.config.links).toBeUndefined();
    });
  });

  describe('rows', () => {
    it('adds subtitle and secondary rows when the mark carries them', () => {
      const model = modelFor([wideNodes(), wideEdges()]);

      const node = model(
        nodeParams({
          id: 'gateway',
          name: 'Gateway',
          value: 12,
          subtitle: 'eu-west',
          secondaries: [{ value: '3 errors' }],
        })
      );

      expect(node.header).toEqual({ label: 'Gateway', value: '' });
      expect(node.rows.slice(0, 3).map((row) => [row.label, row.value])).toEqual([
        ['Median', '12.0 ms'],
        ['Subtitle', 'eu-west'],
        ['Secondary', '3 errors'],
      ]);
    });

    it('adds a row for every stat the mark carries, however many', () => {
      const model = modelFor([wideNodes(), wideEdges()], options({ reduceOptions: { calcs: ['max', 'min', 'mean'] } }));

      const node = model(
        nodeParams({
          id: 'gateway',
          name: 'Gateway',
          value: 12,
          secondaries: [
            { calc: 'min', value: '1.0 ms' },
            { calc: 'mean', value: '5.0 ms' },
          ],
        })
      );

      expect(node.rows.slice(0, 3).map((row) => [row.label, row.value])).toEqual([
        ['Max', '12.0 ms'],
        ['Min', '1.0 ms'],
        ['Mean', '5.0 ms'],
      ]);
    });

    it('keeps the hovered colour as the value row’s swatch', () => {
      const model = modelFor([wideNodes(), wideEdges()]);

      expect(model(nodeParams({ id: 'db', name: 'db', value: 0.42 })).rows[0].color).toBe('#ffffff');
    });

    it('adds a secondary row to an edge that carries one', () => {
      const model = modelFor([wideNodes(), wideEdges()]);

      const link = model(
        linkParams({
          source: 'gateway',
          target: 'db',
          markId: 'e1',
          value: 3.5,
          secondaries: [{ value: '1.0 s' }],
        })
      );

      expect(link.rows.map((row) => [row.label, row.value])).toEqual([
        ['Median', '3.50 s'],
        ['Secondary', '1.0 s'],
      ]);
    });

    it('leaves an edge with no secondary at one row', () => {
      const model = modelFor([wideNodes(), wideEdges()]);

      expect(model(linkParams({ source: 'gateway', target: 'db', markId: 'e1', value: 3.5 })).rows).toHaveLength(1);
    });
  });

  describe('a node’s edges', () => {
    it('lists the edges touching the node, in place of no rows at all', () => {
      const model = modelFor([hubNodes(), hubEdges()]);

      const node = model(nodeParams({ id: 'gateway', name: 'gateway' }));

      expect(node.header).toEqual({ label: 'gateway', value: '' });
      expect(node.rows.map((row) => [row.label, row.value])).toEqual([
        ['web →', '800 ms'],
        ['→ API', '1.2 s'],
        ['→ gateway', '4'],
      ]);
    });

    it('lists a self-loop once', () => {
      const model = modelFor([hubNodes(), hubEdges()]);

      const rows = model(nodeParams({ id: 'gateway', name: 'gateway' })).rows;

      expect(rows.filter((row) => row.label.includes('gateway'))).toEqual([{ label: '→ gateway', value: '4' }]);
    });

    it('reads an edge from the other end when the other end is hovered', () => {
      const model = modelFor([hubNodes(), hubEdges()]);

      expect(model(nodeParams({ id: 'web', name: 'web' })).rows.map((row) => [row.label, row.value])).toEqual([
        ['→ gateway', '800 ms'],
      ]);
    });

    it('leads with the stat and still lists the edges, for a node that has one', () => {
      const model = modelFor([hubNodes(), hubEdges()]);

      const rows = model(nodeParams({ id: 'api', name: 'API', value: 7 })).rows;

      expect(rows[0]).toEqual(expect.objectContaining({ label: 'Median', value: '7 ms' }));
      expect(rows.slice(1).map((row) => [row.label, row.value])).toEqual([['gateway →', '1.2 s']]);
    });

    it('caps the list and counts what it left out', () => {
      const model = modelFor([fanOutEdges(13)]);

      const rows = model(nodeParams({ id: 'hub', name: 'hub' })).rows;

      expect(rows).toHaveLength(11);
      expect(rows[9]).toEqual({ label: '→ leaf-9', value: '9' });
      expect(rows[10]).toEqual({ label: '+3 more', value: '' });
    });

    it('leaves the list at the end, behind a subtitle and a secondary stat', () => {
      const model = modelFor([hubNodes(), hubEdges()]);

      const node = model(
        nodeParams({ id: 'web', name: 'web', subtitle: 'eu-west', secondaries: [{ value: '3 errors' }] })
      );

      expect(node.rows.map((row) => row.label)).toEqual(['Subtitle', 'Secondary', '→ gateway']);
    });

    it('adds no rows for a node the model does not know', () => {
      const model = modelFor([hubNodes(), hubEdges()]);

      expect(model(nodeParams({ id: 'nope', name: 'nope' })).rows).toEqual([]);
    });
  });

  describe('stat row labels', () => {
    const meanAndMin = options({ reduceOptions: { calcs: ['mean', 'min'] } });

    it('names each node row after the reducer that produced it', () => {
      const model = modelFor([wideNodes(), wideEdges()], meanAndMin);

      const node = model(
        nodeParams({ id: 'gateway', name: 'Gateway', value: 12, secondaries: [{ calc: 'min', value: '5.0 ms' }] })
      );

      expect(node.rows.slice(0, 2).map((row) => row.label)).toEqual(['Mean', 'Min']);
    });

    it('names each edge row after the reducer that produced it', () => {
      const model = modelFor([wideNodes(), wideEdges()], meanAndMin);

      const link = model(
        linkParams({
          source: 'gateway',
          target: 'db',
          markId: 'e1',
          value: 3.5,
          secondaries: [{ calc: 'min', value: '1.0 s' }],
        })
      );

      expect(link.rows.map((row) => row.label)).toEqual(['Mean', 'Min']);
    });

    it('names the default calculation when none is picked', () => {
      const model = modelFor([wideNodes(), wideEdges()]);

      expect(model(nodeParams({ id: 'gateway', name: 'Gateway', value: 12 })).rows[0].label).toBe('Median');
    });

    it('labels the main row Value under the time slider, on nodes and edges alike', () => {
      const model = modelFor([wideNodes(), wideEdges()], options({ relationsTimeSlider: true }));

      expect(model(nodeParams({ id: 'gateway', name: 'Gateway', value: 12 })).rows[0].label).toBe('Value');
      expect(model(linkParams({ source: 'gateway', target: 'db', markId: 'e1', value: 3.5 })).rows[0].label).toBe(
        'Value'
      );
    });

    it('keeps the Value label with the slider on but a stored calculation', () => {
      const model = modelFor(
        [wideNodes(), wideEdges()],
        options({ relationsTimeSlider: true, reduceOptions: { calcs: ['mean', 'min'] } })
      );

      expect(model(nodeParams({ id: 'gateway', name: 'Gateway', value: 12 })).rows[0].label).toBe('Value');
    });

    // The switch off is the reducing reading, and there the reducer is named as before.
    it('names the reducer again once the slider is off', () => {
      const model = modelFor([wideNodes(), wideEdges()], options({ relationsTimeSlider: false }));

      expect(model(nodeParams({ id: 'gateway', name: 'Gateway', value: 12 })).rows[0].label).toBe('Median');
    });

    it('keeps the generic label for a secondarystat with no reducer behind it', () => {
      const model = modelFor([wideNodes(), wideEdges()], options({ reduceOptions: { calcs: ['mean'] } }));

      const node = model(
        nodeParams({ id: 'gateway', name: 'Gateway', value: 12, secondaries: [{ value: '3 errors' }] })
      );

      expect(node.rows.slice(0, 2).map((row) => row.label)).toEqual(['Mean', 'Secondary']);
    });

    it('falls back to the raw reducer id', () => {
      const model = modelFor([wideNodes(), wideEdges()], options({ reduceOptions: { calcs: ['notAReducer'] } }));

      expect(model(nodeParams({ id: 'gateway', name: 'Gateway', value: 12 })).rows[0].label).toBe('notAReducer');
    });
  });
});
