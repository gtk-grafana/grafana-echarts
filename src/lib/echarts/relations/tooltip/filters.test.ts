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
            config: { filterable: true },
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
     * The two halves differ on purpose for a node in the **middle** of a chain: negating
     * both directions is "everything that does not touch this node", while asserting both
     * would be `source=x AND target=x`, i.e. self-loops. See `nodeFilters`.
     */
    it('negates both directions of a node in the middle but asserts only the source', () => {
      const model = modelFor([hubNodes(), hubEdges()]);

      const filters = model(nodeParams({ id: 'gateway', name: 'gateway' })).filters;

      expect(filters).toEqual({
        each: [],
        filterFor: [{ key: 'source', value: 'gateway' }],
        filterOut: [
          { key: 'source', value: 'gateway' },
          { key: 'target', value: 'gateway' },
        ],
      });
    });

    /**
     * **The reported bug.** A destination-only service — `warpstream-agent-write` on the
     * live service graph — is never a `source`, so asserting the source key wrote
     * `client="warpstream-agent-write"` and matched no series at all. No key mapping could
     * fix it: the key was right, the *direction* was wrong. Which key a node may claim is a
     * property of the topology, so it comes off the edges touching it
     * (`toNodeFilterLabels`).
     */
    it('asserts the target key for a destination-only node', () => {
      const model = modelFor([hubNodes(), hubEdges()]);

      const filters = model(nodeParams({ id: 'api', name: 'API', value: 7 })).filters;

      expect(filters?.filterFor).toEqual([{ key: 'target', value: 'api' }]);
      // The negation still covers the role it does not play, filled from the far end of the
      // pair it sits on: a `topk` re-ranks under the filter and it would reappear as a
      // source. See `NodeFilterLabels.negate`.
      expect(filters?.filterOut).toEqual([
        { key: 'source', value: 'api' },
        { key: 'target', value: 'api' },
      ]);
    });

    it('asserts the source key for an origin-only node', () => {
      const model = modelFor([hubNodes(), hubEdges()]);

      const filters = model(nodeParams({ id: 'web', name: 'web' })).filters;

      expect(filters?.filterFor).toEqual([{ key: 'source', value: 'web' }]);
      expect(filters?.filterOut).toEqual([
        { key: 'source', value: 'web' },
        { key: 'target', value: 'web' },
      ]);
    });

    /**
     * The case with no field at all — on a host that cannot run the derived-node pre-pass,
     * **every** node of an edges-only response is this. The filters come off the item, so
     * they survive it, and the `filterable` opt-in comes off the **edges** that named the
     * node: gating on the node's own (absent) field left a service-graph panel offering
     * filters on its links and none at all on its nodes. See `markFilterable`.
     */
    it('offers filters for a derived node, on the edges’ opt-in', () => {
      const model = modelFor([wideEdges()]);

      const node = model(nodeParams({ id: 'gateway', name: 'gateway' }));

      expect(node.source).toBeUndefined();
      expect(node.filters?.filterOut).toEqual([
        { key: 'source', value: 'gateway' },
        { key: 'target', value: 'gateway' },
      ]);
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

    /**
     * A mark that **has** a field answers for itself, `false` included: an explicit "not
     * filterable" is an override the user wrote, and the edges' answer must not overrule it.
     */
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
            config: { filterable: true, custom: { sourceFilterLabel: 'client', targetFilterLabel: 'server' } },
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

    /**
     * A self-loop makes the node both an origin and a destination by itself, so both keys
     * come off roles it really plays rather than off the far-end fill.
     */
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
        { key: 'target', value: 'gateway' },
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
