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

/**
 * A hub the response never declared, and its own edges have different units.
 *
 * `gateway` is only ever an endpoint, so it has no field and therefore no stat — the shape
 * `docs/relations-derived-nodes.md` describes, and the one whose tooltip was a header and
 * nothing else. `web` is derived too; `api` is declared by {@link hubNodes}. The third edge
 * is a self-loop.
 */
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
        config: { unit: 'ms', decimals: 0 },
      },
      {
        name: 'gw-api',
        type: FieldType.number,
        labels: { source: 'gateway', target: 'api' },
        values: [1.2],
        config: { unit: 's', decimals: 1 },
      },
      {
        name: 'gw-gw',
        type: FieldType.number,
        labels: { source: 'gateway', target: 'gateway' },
        values: [4],
        config: { decimals: 0 },
      },
    ],
  });

/** One declared node with a `displayName`, so an edge row can be shown to use it. */
const hubNodes = (): DataFrame =>
  toDataFrame({
    name: 'nodes',
    meta: { type: GRAPH_NODES_WIDE },
    fields: [{ name: 'api', type: FieldType.number, values: [7], config: { displayName: 'API', unit: 'ms' } }],
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
   * "Tooltip unit decided by frame order" was the frame's *first* numeric field
   * formatting every mark. A mark is a field now, so each one formats with its own
   * unit and decimals.
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
   * The footer used to resolve one field for the whole series, so a link configured
   * anywhere painted everywhere (gaps 1-3 of `todo/relations-data-links.md`). The
   * source is now the hovered mark's own field.
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
     *
     * What the rows are instead is the subject of `a statless node's edges` below.
     */
    it('omits the value row for a node with no stat', () => {
      const model = modelFor([wideEdges()]);

      expect(model(nodeParams({ id: 'gateway', name: 'gateway' })).rows.map((row) => row.label)).not.toContain(
        'Last *'
      );
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
        nodeParams({
          id: 'gateway',
          name: 'Gateway',
          value: 12,
          subtitle: 'eu-west',
          secondaries: [{ value: '3 errors' }],
        })
      );

      expect(node.header).toEqual({ label: 'Gateway', value: '' });
      // `Last *` is `RELATIONS_CALC_DEFAULT`'s display name — the row says which reducer
      // produced it, and a stat with no reducer behind it is the `secondarystat` label the
      // row-form conversion carried, which keeps the generic name.
      expect(node.rows.map((row) => [row.label, row.value])).toEqual([
        ['Last *', '12.0 ms'],
        ['Subtitle', 'eu-west'],
        ['Secondary', '3 errors'],
      ]);
    });

    /**
     * **One row per reducer, with no cap.** Only `calcs[0]` is structurally singular — it
     * sizes the node and weighs the edge — so a third and fourth calculation are rows like the
     * second. They used to be dropped by `normalizeRelationsCalcs` and clamped away by the
     * picker, so choosing one did nothing at all.
     */
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

      expect(node.rows.map((row) => [row.label, row.value])).toEqual([
        ['Max', '12.0 ms'],
        ['Min', '1.0 ms'],
        ['Mean', '5.0 ms'],
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
   * A node with no stat of its own used to produce a tooltip with a header and no rows at
   * all — the normal case, not a corner one: an edges-only response derives every one of its
   * nodes (`docs/relations-derived-nodes.md`). It has no measurement to report, but it does
   * know its edges, and those are numbers the response really returned.
   */
  describe('a statless node’s edges', () => {
    /**
     * Direction is an arrow rather than a repeat of the hovered node's name, the other
     * endpoint reads with its **display name** (`API`, not `api`), and each row formats
     * through that **edge's** own field — `ms` on one, `s` on the next.
     */
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

    // A self-loop is one edge, and the node is both of its endpoints: listing it under
    // each direction would print the same edge twice.
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

    // The list is the fallback for a node with nothing to say, not an addition to a node
    // that has a measurement of its own.
    it('reports the stat, not the edges, for a node that has one', () => {
      const model = modelFor([hubNodes(), hubEdges()]);

      expect(model(nodeParams({ id: 'api', name: 'API', value: 7 })).rows.map((row) => [row.label, row.value])).toEqual(
        [['Last *', '7 ms']]
      );
    });

    /**
     * The relations tooltip is a Single-mode tooltip and `isTooltipScrollable` only scrolls
     * in Multi mode, so an uncapped list would run a hub node's tooltip off the screen. The
     * count says so rather than the list simply stopping.
     */
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

    // Nothing is invented for a hover the model cannot place — the formatter also fields
    // items that are not marks at all.
    it('adds no rows for a node the model does not know', () => {
      const model = modelFor([hubNodes(), hubEdges()]);

      expect(model(nodeParams({ id: 'nope', name: 'nope' })).rows).toEqual([]);
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

      const node = model(
        nodeParams({ id: 'gateway', name: 'Gateway', value: 12, secondaries: [{ calc: 'min', value: '5.0 ms' }] })
      );

      expect(node.rows.map((row) => row.label)).toEqual(['Mean', 'Min']);
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

    // The default reducer is still a reducer, and naming it is what makes a panel nobody
    // configured say what its number means.
    it('names the default calculation when none is picked', () => {
      const model = modelFor([wideNodes(), wideEdges()]);

      expect(model(nodeParams({ id: 'gateway', name: 'Gateway', value: 12 })).rows[0].label).toBe('Last *');
    });

    // A stat with no reducer behind it did not come from a reduction at all: it is the
    // `secondarystat` label the row-form conversion carries, where an instant response has no
    // second value to reduce. See `secondaryStatsOf`.
    it('keeps the generic label for a secondarystat with no reducer behind it', () => {
      const model = modelFor([wideNodes(), wideEdges()], options({ reduceOptions: { calcs: ['mean'] } }));

      const node = model(
        nodeParams({ id: 'gateway', name: 'Gateway', value: 12, secondaries: [{ value: '3 errors' }] })
      );

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

    /**
     * An edge **is** the conjunction of its endpoints, so they go in the grouped set — one
     * "Filter on this value" button that narrows to exactly this edge, rather than one
     * button per endpoint plus the pair, which is the reported four-button footer.
     */
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

    // The half that always worked: a label that is not an endpoint is a real datasource
    // dimension, gets a button of its own (its value is distinguishable), and is part of
    // "this exact edge" too.
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

    /**
     * A node's identity is its `field.name`, not a label, so walking `field.labels` — the
     * generic derivation every other family uses — found nothing to offer.
     *
     * The two halves differ on purpose: negating both directions is "everything that does
     * not touch this node", while asserting both would be `source=x AND target=x`, i.e.
     * self-loops. See `nodeFilters`.
     */
    it('negates both of a node’s endpoint directions but asserts only the source', () => {
      const model = modelFor([wideNodes(), wideEdges()]);

      const filters = model(nodeParams({ id: 'gateway', name: 'Gateway', value: 12 })).filters;

      expect(filters).toEqual({
        each: [],
        filterFor: [{ key: 'source', value: 'gateway' }],
        filterOut: [
          { key: 'source', value: 'gateway' },
          { key: 'target', value: 'gateway' },
        ],
      });
    });

    // The case with no field at all — on a host that cannot run the pre-pass, every
    // node is this. The filters come off the item, so they survive it.
    it('offers filters for a derived node that has no field', () => {
      const model = modelFor([wideEdges()]);

      const node = model(nodeParams({ id: 'gateway', name: 'gateway' }));

      expect(node.source).toBeUndefined();
      expect(node.filters?.filterOut).toEqual([
        { key: 'source', value: 'gateway' },
        { key: 'target', value: 'gateway' },
      ]);
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
            config: { custom },
          },
          {
            name: 'e2',
            type: FieldType.number,
            labels: { source: 'gateway', target: 'db' },
            values: [7],
          },
        ],
      });

    /**
     * The mapping. `sum by (source, target) (label_replace(…, "source", "$1", "client",
     * "(.*)"))` leaves the frame labelled `source` while the metric is still labelled
     * `client`, so the frame's own key filters on nothing — and the aggregation dropped the
     * original, so only the mark's own config can recover it.
     */
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

    /**
     * **Why it is field config and not a panel option.** One panel can join two queries,
     * so the key that filters one edge need not be the key that filters the next; the
     * second edge here configures nothing and falls back to the contract's own pair.
     */
    it('lets two edges of one panel answer differently', () => {
      const model = modelFor([mappedEdges({ sourceFilterLabel: 'client', targetFilterLabel: 'server' })]);

      expect(model(linkParams({ source: 'gateway', target: 'db', markId: 'e2', value: 7 })).filters?.filterFor).toEqual(
        [
          { key: 'source', value: 'gateway' },
          { key: 'target', value: 'db' },
        ]
      );
    });

    /**
     * A node maps too, off its **own** field — the node is an endpoint in both directions,
     * so both keys come from the node the user hovered rather than from any edge.
     */
    it('maps a node’s endpoints as well', () => {
      const nodes = toDataFrame({
        name: 'nodes',
        meta: { type: GRAPH_NODES_WIDE },
        fields: [
          {
            name: 'gateway',
            type: FieldType.number,
            values: [12],
            config: { custom: { sourceFilterLabel: 'client', targetFilterLabel: 'server' } },
          },
        ],
      });

      expect(
        modelFor([nodes, wideEdges()])(nodeParams({ id: 'gateway', name: 'gateway', value: 12 })).filters?.filterOut
      ).toEqual([
        { key: 'client', value: 'gateway' },
        { key: 'server', value: 'gateway' },
      ]);
    });

    /**
     * A node the response only implied has no field, so it has no mapping of its own and
     * falls back to the pair the response carried — one more thing the derived-node
     * pre-pass buys, since a declared node *can* be overridden.
     */
    it('falls back to the response’s pair for a node with no field', () => {
      expect(modelFor([wideEdges()])(nodeParams({ id: 'gateway', name: 'gateway' })).filters?.filterOut).toEqual([
        { key: 'source', value: 'gateway' },
        { key: 'target', value: 'gateway' },
      ]);
    });

    /**
     * **The point of the whole exercise**: a response that never renamed its labels needs no
     * option at all. `client`/`server` is an endpoint pair the reader recognises, so the keys
     * reach the model and the filters are written under them.
     */
    it('reads the datasource’s own endpoint labels with nothing configured', () => {
      const clientServer = toDataFrame({
        name: 'edges',
        meta: { type: GRAPH_EDGES_WIDE },
        fields: [{ name: 'e1', type: FieldType.number, labels: { client: 'gateway', server: 'db' }, values: [3.5] }],
      });
      const model = modelFor([clientServer]);

      expect(
        model(linkParams({ source: 'gateway', target: 'db', markId: 'e1', value: 3.5 })).filters?.filterFor
      ).toEqual([
        { key: 'client', value: 'gateway' },
        { key: 'server', value: 'db' },
      ]);
    });

    /**
     * Half a pair is intent about one half only: the configured key is honoured and the
     * other still comes off the response, rather than the whole override being dropped.
     */
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

    /**
     * **The multi-level case, which no single pair can express.** One frame, two levels,
     * each relabelled to the canonical pair from a *different* original — exactly what the
     * `or`-joined sankey query pivots to once its outer aggregations keep their originals.
     */
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
            },
            {
              name: 'ns-a-->checkout',
              type: FieldType.number,
              labels: { source: 'ns-a', target: 'checkout', namespace: 'ns-a', workload: 'checkout' },
              values: [1],
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

      /**
       * The query carries its topology twice, so `cluster` is not a dimension beside the
       * endpoints — it *is* the source endpoint. Without excluding it the footer would
       * offer `prod` once inside the grouped conjunction and again as its own button.
       */
      it('offers no separate button for a recovered key', () => {
        const model = modelFor([twoLevels()]);

        expect(
          model(linkParams({ source: 'prod', target: 'ns-a', markId: 'prod-->ns-a', value: 4 })).filters?.each
        ).toEqual([]);
      });

      /**
       * **The node half, with no per-node configuration anywhere.** A namespace node is
       * level 1's target and level 2's source, and both levels say `namespace` — so its two
       * incident keys dedupe to one.
       */
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

      /**
       * The **sink**, which is the plain bug fix: it used to assert `source="checkout"`,
       * a label the datasource has never heard of, so "Filter on this value" emptied the
       * dashboard. Its negation also covers `namespace`, the far key of the level it sits
       * on — see `NodeFilterLabels.negate`.
       */
      it('asserts a sink node’s own key rather than the source key', () => {
        expect(node('checkout')).toEqual({
          each: [],
          filterFor: [{ key: 'workload', value: 'checkout' }],
          filterOut: [
            { key: 'namespace', value: 'checkout' },
            { key: 'workload', value: 'checkout' },
          ],
        });
      });
    });

    /**
     * The node half of "read the datasource's own keys with nothing configured": a
     * `client`/`server` response resolves a node through its incident edges, so the node
     * and the edges around it can never disagree about the key.
     */
    it('resolves a node’s keys from the edges touching it', () => {
      const clientServer = toDataFrame({
        name: 'edges',
        meta: { type: GRAPH_EDGES_WIDE },
        fields: [
          { name: 'e1', type: FieldType.number, labels: { client: 'gateway', server: 'db' }, values: [3.5] },
          { name: 'e2', type: FieldType.number, labels: { client: 'db', server: 'cache' }, values: [1] },
        ],
      });
      const model = modelFor([clientServer]);

      expect(model(nodeParams({ id: 'db', name: 'db' })).filters).toEqual({
        each: [],
        // Source first: `db` is `e2`'s client and `e1`'s server, and the assertion takes
        // the source role when the node plays one.
        filterFor: [{ key: 'client', value: 'db' }],
        filterOut: [
          { key: 'client', value: 'db' },
          { key: 'server', value: 'db' },
        ],
      });
    });

    /**
     * A node with **no edges at all** — every link to it hidden by the legend, say — has no
     * incidence to read, so it keeps the response-wide answer it has always had.
     */
    it('falls back to the response’s pair for a node with no incident edge', () => {
      const model = modelFor([wideNodes(), wideEdges()]);

      expect(model(nodeParams({ id: 'orphan', name: 'orphan' })).filters?.filterOut).toEqual([
        { key: 'source', value: 'orphan' },
        { key: 'target', value: 'orphan' },
      ]);
    });

    // With one key mapped onto the other, a self-loop's two endpoints collapse to one
    // pair — one filter rather than two identical ones.
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
            config: { custom: { sourceFilterLabel: 'svc', targetFilterLabel: 'svc' } },
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

  it('collects an adjacency list for the statless nodes only', () => {
    const withStats = frameToRelationsGraph([wideNodes(), wideEdges()], theme)!;
    const derived = frameToRelationsGraph([wideEdges()], theme)!;

    // Both nodes carry a stat, so neither needs its edges listed and no edge is formatted.
    expect([...getRelationsTooltipMarks(withStats, theme, 'utc').adjacency!.keys()]).toEqual([]);
    // Neither does, so both get one — the two parallel edges, from each end.
    expect([...getRelationsTooltipMarks(derived, theme, 'utc').adjacency!.keys()]).toEqual(['gateway', 'db']);
  });

  it('holds no entry for a mark with no field, so the lookup misses cleanly', () => {
    const data = frameToRelationsGraph([wideEdges()], theme);

    expect(getRelationsTooltipMarks(data!, theme, 'utc').nodes.size).toBe(0);
  });
});
