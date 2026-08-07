import { createTheme, type DataFrame, FieldType, toDataFrame } from '@grafana/data';
import { type TopLevelFormatterParams } from 'echarts/types/dist/shared';
import { GRAPH_EDGES_WIDE, GRAPH_NODES_WIDE } from 'lib/echarts/converters/graphWide';
import { frameToRelationsGraph } from 'lib/echarts/converters/relationsGraph';
import { buildRelationsTooltipModel, getRelationsTooltipMarks } from 'lib/echarts/tooltip/relations';
import { type RelationsLinkItem, type RelationsNodeItem, type TooltipModel } from 'lib/echarts/tooltip/types';
import { type PanelOptions } from 'types';

// The reader warns when collected marks share a `field.name`, which the fixtures below do
// deliberately. Mocked so the decision is testable in `graphWide.test.ts` and silent here.
jest.mock('development', () => ({
  debug: jest.fn(),
  LOG_LEVELS: { debug: 0, info: 1, warn: 2, error: 3 },
}));

const theme = createTheme();

// ECharts formatter params carry more fields at runtime than the base type; only the
// ones the relations formatter reads are set here (`data`, `color`, `name`).
const asParams = (params: unknown) => params as TopLevelFormatterParams;

/**
 * Two nodes with **different units**, which is the case the row form cannot express
 * at all: `mainstat` is one column, so one unit covers every node.
 */
const wideNodes = (): DataFrame =>
  toDataFrame({
    name: 'nodes',
    meta: { type: GRAPH_NODES_WIDE },
    fields: [
      { name: 'gateway', type: FieldType.number, values: [12], config: { unit: 'ms', decimals: 1 } },
      { name: 'db', type: FieldType.number, values: [0.42], config: { unit: 'percentunit', decimals: 0 } },
    ],
  });

/**
 * Two **parallel** edges over the same pair, each with its own unit and its own link.
 * They are why an edge is looked up by `markId` rather than by its endpoints.
 */
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
        config: { unit: 's', decimals: 2, links: [{ title: 'Trace e1', url: 'http://example.com/e1' }] },
      },
      {
        name: 'e2',
        type: FieldType.number,
        labels: { source: 'gateway', target: 'db' },
        values: [25],
        config: { unit: 'percent', decimals: 1 },
      },
    ],
  });

/** Only the keys the tooltip model reads; the rest of `PanelOptions` is irrelevant here. */
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
  /**
   * Item 13 of `todo/graph-wide-migration.md`: "tooltip unit decided by frame order"
   * was the frame's *first* numeric field formatting every mark. A mark is a field
   * now, so each one formats with its own unit and decimals.
   */
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

    // Two edges joining the same pair are indistinguishable by endpoint, which is
    // exactly why the item carries the edge's field name.
    it('tells parallel edges apart by their mark id', () => {
      const model = modelFor([wideNodes(), wideEdges()]);

      expect(model(linkParams({ source: 'gateway', target: 'db', markId: 'e2', value: 25 })).rows[0].value).toBe(
        '25.0%'
      );
    });

    // Sankey and chord leave `value` to ECharts' flow computation and carry the stat
    // as `stat`; it must format through the same mark.
    it('formats the sankey/chord `stat` through the hovered node’s field', () => {
      const model = modelFor([wideNodes(), wideEdges()]);

      expect(model(nodeParams({ id: 'gateway', name: 'gateway', stat: 12 })).rows[0].value).toBe('12.0 ms');
    });
  });

  /**
   * Item 14, and gaps 1-3 of `todo/relations-data-links.md`: the footer used to
   * resolve one field for the whole series, so a link configured anywhere painted
   * everywhere. The source is now the hovered mark's own field.
   */
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
      // The row carries the same source, so a pinned tooltip resolves links from
      // either the model or the clicked row.
      expect(link.rows[0].source).toBe(link.source);
    });

    /**
     * Gap 4, which the contract does **not** close on a host that cannot run the
     * `deriveNodes` pre-pass: a node derived from an edge's endpoints has no field, so
     * there is nothing for an override to land on and no footer to render.
     */
    it('gives a derived node no source', () => {
      const model = modelFor([wideEdges()]);

      const node = model(nodeParams({ id: 'gateway', name: 'gateway' }));

      expect(node.source).toBeUndefined();
      expect(node.header.label).toBe('gateway');
    });

    /**
     * A derived node carries no stat at all now (`deriveNodesFromLinks`), and a value row
     * with nothing in it reads as a measurement that failed rather than one that was never
     * taken. The value it used to carry was its degree, which the panel formatter — the
     * first numeric field of the first frame — printed here as `2 s`, borrowing the first
     * edge's unit for a link count.
     */
    it('omits the value row for a node with no stat', () => {
      const model = modelFor([wideEdges()]);

      expect(model(nodeParams({ id: 'gateway', name: 'gateway' })).rows).toEqual([]);
    });

    it('still formats a stat a fieldless node does carry, plainly and with no unit', () => {
      const model = modelFor([wideEdges()]);

      expect(model(nodeParams({ id: 'gateway', name: 'gateway', value: 2 })).rows[0].value).toBe('2');
    });
  });

  /**
   * The only thing duplicate ids actually break, and the class of bug the per-mark lookup
   * exists to kill. A raw labelled response is N frames whose value field is called
   * `Value`, so keying the link map by `id` alone would be last-write-wins: every edge
   * would format with the last one's unit and surface its `config.links`.
   *
   * The ids stay `Value` — that is the contract's invariant, and a minted id would be one
   * no override can match. What tells the marks apart is `markKey`, which is the item key
   * and nothing else.
   */
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

      // Same id, different keys — the premise this regression test rests on.
      expect([first.id, second.id]).toEqual(['Value', 'Value']);
      expect([first.markKey, second.markKey]).toEqual(['gateway-->db', 'db-->cache']);

      // One value, two formatters. Keyed by id alone both would read `3.5%`, the last
      // field's unit and decimals.
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
        nodeParams({ id: 'gateway', name: 'Gateway', value: 12, subtitle: 'eu-west', secondary: '3 errors' })
      );

      expect(node.header).toEqual({ label: 'Gateway', value: '' });
      // `Last *` is `RELATIONS_CALC_DEFAULT`'s display name — the row says which reducer
      // produced it, and with no second calculation picked the secondary row is the
      // `secondarystat` label rather than a reduction, so it keeps the generic name.
      expect(node.rows.map((row) => [row.label, row.value])).toEqual([
        ['Last *', '12.0 ms'],
        ['Subtitle', 'eu-west'],
        ['Secondary', '3 errors'],
      ]);
    });

    it('keeps the hovered colour as the value row’s swatch', () => {
      const model = modelFor([wideNodes(), wideEdges()]);

      expect(model(nodeParams({ id: 'db', name: 'db', value: 0.42 })).rows[0].color).toBe('#ffffff');
    });

    /**
     * An **edge** reports its secondary stat too, which it did not: `calcs[1]` was read
     * for nodes only, so on an edges-only response — the common shape — choosing a
     * second calculation produced no second value anywhere. See `readLinks`.
     */
    it('adds a secondary row to an edge that carries one', () => {
      const model = modelFor([wideNodes(), wideEdges()]);

      const link = model(linkParams({ source: 'gateway', target: 'db', markId: 'e1', value: 3.5, secondary: '1.0 s' }));

      expect(link.rows.map((row) => [row.label, row.value])).toEqual([
        ['Last *', '3.50 s'],
        ['Secondary', '1.0 s'],
      ]);
    });

    it('leaves an edge with no secondary at one row', () => {
      const model = modelFor([wideNodes(), wideEdges()]);

      expect(model(linkParams({ source: 'gateway', target: 'db', markId: 'e1', value: 3.5 })).rows).toHaveLength(1);
    });
  });

  /**
   * **The reported bug.** Both stat slots are a reducer the user picked, so a tooltip
   * reading `Value` / `Secondary` threw away the only thing the row does not otherwise
   * say — a panel reduced by mean and min should read `Mean` and `Min`.
   */
  describe('stat row labels', () => {
    const meanAndMin = options({ reduceOptions: { calcs: ['mean', 'min'] } });

    it('names each node row after the reducer that produced it', () => {
      const model = modelFor([wideNodes(), wideEdges()], meanAndMin);

      const node = model(nodeParams({ id: 'gateway', name: 'Gateway', value: 12, secondary: '5.0 ms' }));

      expect(node.rows.map((row) => row.label)).toEqual(['Mean', 'Min']);
    });

    it('names each edge row after the reducer that produced it', () => {
      const model = modelFor([wideNodes(), wideEdges()], meanAndMin);

      const link = model(linkParams({ source: 'gateway', target: 'db', markId: 'e1', value: 3.5, secondary: '1.0 s' }));

      expect(link.rows.map((row) => row.label)).toEqual(['Mean', 'Min']);
    });

    // The default reducer is still a reducer, and naming it is what makes a panel nobody
    // configured say what its number means.
    it('names the default calculation when none is picked', () => {
      const model = modelFor([wideNodes(), wideEdges()]);

      expect(model(nodeParams({ id: 'gateway', name: 'Gateway', value: 12 })).rows[0].label).toBe('Last *');
    });

    // No second calculation means the secondary row did not come from a reducer at all:
    // it is the `secondarystat` label the row-form conversion carries, and there is no
    // calculation to name. See `secondaryOf`.
    it('keeps the generic label for a secondarystat with no reducer behind it', () => {
      const model = modelFor([wideNodes(), wideEdges()], options({ reduceOptions: { calcs: ['mean'] } }));

      const node = model(nodeParams({ id: 'gateway', name: 'Gateway', value: 12, secondary: '3 errors' }));

      expect(node.rows.map((row) => row.label)).toEqual(['Mean', 'Secondary']);
    });

    // A reducer the registry does not know still names its row, rather than falling back
    // to a word that says less than the raw id does.
    it('falls back to the raw reducer id', () => {
      const model = modelFor([wideNodes(), wideEdges()], options({ reduceOptions: { calcs: ['notAReducer'] } }));

      expect(model(nodeParams({ id: 'gateway', name: 'Gateway', value: 12 })).rows[0].label).toBe('notAReducer');
    });
  });

  /**
   * **The reported bug**, in two halves: a hovered *node* offered no ad-hoc filter at
   * all, and an edge's endpoint filters were written under the contract's own
   * `source`/`target` keys, which a datasource that never emitted them cannot match.
   */
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
          },
        ],
      });

    it('offers both endpoints of a hovered edge', () => {
      const model = modelFor([wideNodes(), wideEdges()]);

      expect(model(linkParams({ source: 'gateway', target: 'db', markId: 'e1', value: 3.5 })).filters).toEqual([
        { key: 'source', value: 'gateway' },
        { key: 'target', value: 'db' },
      ]);
    });

    // The half that always worked: a label that is not an endpoint is a real datasource
    // dimension and passes through under its own name.
    it('keeps an edge’s non-endpoint labels', () => {
      const model = modelFor([labelledEdges()]);

      expect(model(linkParams({ source: 'gateway', target: 'db', markId: 'e1', value: 3.5 })).filters).toEqual([
        { key: 'source', value: 'gateway' },
        { key: 'target', value: 'db' },
        { key: 'connection_type', value: 'database' },
      ]);
    });

    // A node's identity is its `field.name`, not a label, so walking `field.labels` —
    // the generic derivation every other family uses — found nothing to offer.
    it('offers a hovered node as either end of an edge', () => {
      const model = modelFor([wideNodes(), wideEdges()]);

      expect(model(nodeParams({ id: 'gateway', name: 'Gateway', value: 12 })).filters).toEqual([
        { key: 'source', value: 'gateway' },
        { key: 'target', value: 'gateway' },
      ]);
    });

    // The case with no field at all — on a host that cannot run the pre-pass, every
    // node is this. The filters come off the item, so they survive it.
    it('offers filters for a derived node that has no field', () => {
      const model = modelFor([wideEdges()]);

      const node = model(nodeParams({ id: 'gateway', name: 'gateway' }));

      expect(node.source).toBeUndefined();
      expect(node.filters).toEqual([
        { key: 'source', value: 'gateway' },
        { key: 'target', value: 'gateway' },
      ]);
    });

    /**
     * The mapping. `sum by (source, target) (label_replace(…, "source", "$1", "client",
     * "(.*)"))` leaves the frame labelled `source` while the metric is still labelled
     * `client`, so the frame's own key filters on nothing.
     */
    it('writes the endpoints under the configured datasource labels', () => {
      const mapped = options({ relationsSourceFilterLabel: 'client', relationsTargetFilterLabel: 'server' });
      const model = modelFor([labelledEdges()], mapped);

      expect(model(linkParams({ source: 'gateway', target: 'db', markId: 'e1', value: 3.5 })).filters).toEqual([
        { key: 'client', value: 'gateway' },
        { key: 'server', value: 'db' },
        // Renamed on the field's labels too, so the endpoint is not offered twice
        // under two different keys.
        { key: 'connection_type', value: 'database' },
      ]);
    });

    it('maps a node’s endpoints as well', () => {
      const mapped = options({ relationsSourceFilterLabel: 'client', relationsTargetFilterLabel: 'server' });

      expect(modelFor([wideEdges()], mapped)(nodeParams({ id: 'gateway', name: 'gateway' })).filters).toEqual([
        { key: 'client', value: 'gateway' },
        { key: 'server', value: 'gateway' },
      ]);
    });

    // With one key mapped onto the other, a self-loop's two endpoints collapse to one
    // pair — one button rather than two identical ones.
    it('dedupes two endpoints that resolve to the same filter', () => {
      const selfLoop = toDataFrame({
        name: 'edges',
        meta: { type: GRAPH_EDGES_WIDE },
        fields: [{ name: 'e1', type: FieldType.number, labels: { source: 'gateway', target: 'gateway' }, values: [1] }],
      });
      const mapped = options({ relationsSourceFilterLabel: 'svc', relationsTargetFilterLabel: 'svc' });
      const model = modelFor([selfLoop], mapped);

      expect(model(linkParams({ source: 'gateway', target: 'gateway', markId: 'e1', value: 1 })).filters).toEqual([
        { key: 'svc', value: 'gateway' },
      ]);
    });
  });
});

describe('getRelationsTooltipMarks', () => {
  it('keys nodes and edges separately, so a shared name cannot collide', () => {
    // A node and an edge both called `e1`: legal, since they live in different frames.
    const nodes = toDataFrame({
      meta: { type: GRAPH_NODES_WIDE },
      fields: [
        { name: 'e1', type: FieldType.number, values: [1], config: { unit: 'ms', decimals: 0 } },
        { name: 'b', type: FieldType.number, values: [2] },
      ],
    });
    const edges = toDataFrame({
      meta: { type: GRAPH_EDGES_WIDE },
      fields: [
        {
          name: 'e1',
          type: FieldType.number,
          labels: { source: 'e1', target: 'b' },
          values: [5],
          config: { unit: 'percent', decimals: 0 },
        },
      ],
    });

    const data = frameToRelationsGraph([nodes, edges], theme);
    const marks = getRelationsTooltipMarks(data!, theme, 'utc');

    expect(marks.nodes.get('e1')?.source.field.config.unit).toBe('ms');
    expect(marks.links.get('e1')?.source.field.config.unit).toBe('percent');
  });

  it('holds no entry for a mark with no field, so the lookup misses cleanly', () => {
    const data = frameToRelationsGraph([wideEdges()], theme);

    expect(getRelationsTooltipMarks(data!, theme, 'utc').nodes.size).toBe(0);
  });
});
