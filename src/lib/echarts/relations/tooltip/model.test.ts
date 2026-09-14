import { createTheme, type DataFrame, FieldType, toDataFrame } from '@grafana/data';
import { type TopLevelFormatterParams } from 'echarts/types/dist/shared';
import { GRAPH_EDGES_WIDE, GRAPH_NODES_WIDE } from 'lib/echarts/relations/converters/contract';
import { frameToRelationsGraph } from 'lib/echarts/relations/converters/nodeGraph';
import { getRelationsTooltipMarks } from 'lib/echarts/relations/tooltip/marks';
import { buildRelationsTooltipModel } from 'lib/echarts/relations/tooltip/model';
import { type RelationsLinkItem, type RelationsNodeItem } from 'lib/echarts/relations/tooltip/types';
import { type TooltipModel } from 'lib/echarts/tooltip/types';
import { type PanelOptions } from 'types';

// The reader warns when collected marks share a `field.name`, which the fixtures below do
// deliberately. Mocked so the decision is testable in `graphWide.test.ts` and silent here.
jest.mock('development', () => ({
  debug: jest.fn(),
  LOG_LEVELS: { debug: 0, info: 1, warn: 2, error: 3 },
}));

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
      { name: 'gateway', type: FieldType.number, values: [12], config: { unit: 'ms', decimals: 1, filterable: true } },
      {
        name: 'db',
        type: FieldType.number,
        values: [0.42],
        config: { unit: 'percentunit', decimals: 0, filterable: true },
      },
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
        'Median'
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
      //
      // Sliced: everything the node says about *itself* comes first, and the edges touching
      // it follow (asserted in "a node's edges" below).
      expect(node.rows.slice(0, 3).map((row) => [row.label, row.value])).toEqual([
        ['Median', '12.0 ms'],
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
        ['Median', '3.50 s'],
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
   *
   * Listed for **every** node now, not just that one: a node's own measurement leads and its
   * edges follow, since the two are different facts and neither displaces the other.
   */

  /**
   * A node with no stat of its own used to produce a tooltip with a header and no rows at
   * all — the normal case, not a corner one: an edges-only response derives every one of its
   * nodes (`docs/relations-derived-nodes.md`). It has no measurement to report, but it does
   * know its edges, and those are numbers the response really returned.
   *
   * Listed for **every** node now, not just that one: a node's own measurement leads and its
   * edges follow, since the two are different facts and neither displaces the other.
   */
  describe('a node’s edges', () => {
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

    /**
     * **The reported ask.** A node that measures something used to report *only* that and
     * lose its edge list; a node that measured nothing reported only the edges. Both are
     * reported now, in that order — the node's own value first, which is what a core plot
     * leads with, then what it is connected to.
     */
    it('leads with the stat and still lists the edges, for a node that has one', () => {
      const model = modelFor([hubNodes(), hubEdges()]);

      const rows = model(nodeParams({ id: 'api', name: 'API', value: 7 })).rows;

      expect(rows[0]).toEqual(expect.objectContaining({ label: 'Median', value: '7 ms' }));
      expect(rows.slice(1).map((row) => [row.label, row.value])).toEqual([['gateway →', '1.2 s']]);
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

    // The default reducer is still a reducer, and naming it is what makes a panel nobody
    // configured say what its number means.
    it('names the default calculation when none is picked', () => {
      const model = modelFor([wideNodes(), wideEdges()]);

      expect(model(nodeParams({ id: 'gateway', name: 'Gateway', value: 12 })).rows[0].label).toBe('Median');
    });

    /**
     * Under the time slider the value was **read**, not reduced — so no reducer is named.
     * `Median` there would label a calculation the panel did not run and whose picker the
     * switch has hidden, which is the wart this closes. `Value` is what core's tooltips
     * call an unnamed measurement.
     */
    it('labels the main row Value under the time slider, on nodes and edges alike', () => {
      const model = modelFor([wideNodes(), wideEdges()], options({ relationsTimeSlider: true }));

      expect(model(nodeParams({ id: 'gateway', name: 'Gateway', value: 12 })).rows[0].label).toBe('Value');
      expect(model(linkParams({ source: 'gateway', target: 'db', markId: 'e1', value: 3.5 })).rows[0].label).toBe(
        'Value'
      );
    });

    /**
     * Keyed on the **switch**, not on whether a stop is selected. The switch is also what
     * hides the reducer picker, and the two have to agree: a refresh that takes the
     * timeline away must not flip the label back to a reducer whose control is still gone.
     */
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

    // A stat with no reducer behind it did not come from a reduction at all: it is the
    // `secondarystat` label the row-form conversion carries, where an instant response has no
    // second value to reduce. See `secondaryStatsOf`.
    it('keeps the generic label for a secondarystat with no reducer behind it', () => {
      const model = modelFor([wideNodes(), wideEdges()], options({ reduceOptions: { calcs: ['mean'] } }));

      const node = model(
        nodeParams({ id: 'gateway', name: 'Gateway', value: 12, secondaries: [{ value: '3 errors' }] })
      );

      expect(node.rows.slice(0, 2).map((row) => row.label)).toEqual(['Mean', 'Secondary']);
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
});
