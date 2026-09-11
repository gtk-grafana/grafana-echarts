import {
  createTheme,
  type DataFrame,
  type Field,
  FieldColorModeId,
  type FieldConfig,
  type FieldConfigSource,
  FieldType,
  getDisplayProcessor,
  type Labels,
  type ReduceDataOptions,
  ThresholdsMode,
  toDataFrame,
} from '@grafana/data';

import { debug, LOG_LEVELS } from 'development';
import {
  aliasEndpointKeys,
  endpointsFromName,
  frameToGraphWide,
  GRAPH_EDGES_WIDE,
  GRAPH_NODES_WIDE,
  hasNoNodeStats,
  isEdgesWideFrame,
  isGraphWideFrames,
  graphWideTimeline,
  hasGraphTimeline,
  normalizeRelationsCalcs,
  RELATIONS_CALC_DEFAULT,
} from 'lib/echarts/converters/graphWide';
import { getPaletteColorByIndex } from 'lib/echarts/style';
import { applyTestFieldConfig } from 'test/fieldConfig';

// `debug` is gated on `NODE_ENV`/`CI`/localStorage, so asserting on the console directly
// would pass locally and go quiet in CI. Mocking the module tests the *decision* to warn —
// and keeps the collision warning out of every other suite's output.
jest.mock('development', () => ({
  debug: jest.fn(),
  LOG_LEVELS: { debug: 0, info: 1, warn: 2, error: 3 },
}));

const logged = (level: number): string[] =>
  jest
    .mocked(debug)
    .mock.calls.filter((call) => call[1] === level)
    .map(([message]) => message);

beforeEach(() => {
  jest.mocked(debug).mockClear();
});

const theme = createTheme();

/** Edges carried the contract's primary way: endpoints in labels. */
const labelledEdges = (): DataFrame =>
  toDataFrame({
    name: 'edges',
    meta: { type: GRAPH_EDGES_WIDE },
    fields: [
      { name: 'e1', type: FieldType.number, labels: { source: 'a', target: 'b' }, values: [10] },
      { name: 'e2', type: FieldType.number, labels: { source: 'b', target: 'c' }, values: [20] },
    ],
  });

/** Edges carried the fallback way: endpoints in the field name. */
const namedEdges = (): DataFrame =>
  toDataFrame({
    fields: [
      { name: 'a-->b', type: FieldType.number, values: [10] },
      { name: 'b-->c', type: FieldType.number, values: [20] },
    ],
  });

const T0 = 1700000000000;
const STEP = 300000;

/**
 * One frame of a **raw labelled response**: `[Time, Value]`, endpoints on `Value`.
 *
 * Byte-for-byte what `sum by (source, target) (…)` in `Format: Time series` returns from
 * Prometheus, Loki or TestData, one frame per series — the contract's *Multi* row variant.
 * This is what reaches the reader untouched whenever the pivot does not run, which is the
 * default: the host gates panel-registered transformations behind
 * `grafana.panelPluginTransformations`.
 */
const rawSeries = (labels: Labels, values: Array<number | null>, times?: number[]): DataFrame =>
  toDataFrame({
    fields: [
      { name: 'Time', type: FieldType.time, values: times ?? values.map((_, row) => T0 + row * STEP) },
      { name: 'Value', type: FieldType.number, labels, values },
    ],
  });

/** The measured live-Mimir shape: N series, every value field called `Value`. */
const valueEdges = (): DataFrame[] => [
  rawSeries({ source: 'a', target: 'b' }, [10, 12]),
  rawSeries({ source: 'b', target: 'c' }, [20, 22]),
  rawSeries({ source: 'a', target: 'c' }, [30, 32]),
];

const withCalc = (calc: string): ReduceDataOptions => ({ calcs: [calc], values: false, fields: '' });

/** Attach the display processor `applyFieldOverrides` would have left behind. */
const withDisplay = (frame: DataFrame): DataFrame => {
  for (const field of frame.fields) {
    field.display = getDisplayProcessor({ field, theme });
  }
  return frame;
};

/**
 * The real pre-panel field-config pass, so an override is matched and resolved by
 * Grafana rather than by the test. Under jest the standard property registry is empty
 * and overrides are silently dropped unless one is supplied — see `test/fieldConfig.ts`.
 */
const asPipelineWould = (frames: DataFrame[], overrides: FieldConfigSource['overrides'] = []): DataFrame[] =>
  applyTestFieldConfig(frames, { defaults: {}, overrides }, theme);

describe('isGraphWideFrames', () => {
  it('detects an edges frame from endpoint labels', () => {
    expect(isGraphWideFrames([labelledEdges()])).toBe(true);
    expect(isEdgesWideFrame(labelledEdges())).toBe(true);
  });

  it('detects an edges frame from a `-->` field name', () => {
    expect(isGraphWideFrames([namedEdges()])).toBe(true);
  });

  it('does not claim a legacy long node-graph frame', () => {
    const long = toDataFrame({
      fields: [
        { name: 'id', type: FieldType.string, values: ['e1'] },
        { name: 'source', type: FieldType.string, values: ['a'] },
        { name: 'target', type: FieldType.string, values: ['b'] },
        { name: 'mainstat', type: FieldType.number, values: [10] },
      ],
    });

    expect(isGraphWideFrames([long])).toBe(false);
  });

  it('does not claim an ordinary numeric frame', () => {
    const series = toDataFrame({
      fields: [
        { name: 'time', type: FieldType.time, values: [1, 2] },
        { name: 'value', type: FieldType.number, values: [3, 4] },
      ],
    });

    expect(isGraphWideFrames([series])).toBe(false);
  });

  it('does not treat a lone nodes frame as a graph', () => {
    const nodes = toDataFrame({
      meta: { type: GRAPH_NODES_WIDE },
      fields: [{ name: 'a', type: FieldType.number, values: [1] }],
    });

    expect(isGraphWideFrames([nodes])).toBe(false);
  });

  // No datasource emits `source`/`target`; the conventional pairs are what actually arrives.
  it('detects an edges frame from a conventional endpoint pair', () => {
    const clientServer = toDataFrame({
      fields: [{ name: 'e1', type: FieldType.number, labels: { client: 'a', server: 'b' }, values: [10] }],
    });

    expect(isEdgesWideFrame(clientServer)).toBe(true);
    expect(isGraphWideFrames([clientServer])).toBe(true);
  });
});

/**
 * Which label keys the *datasource* used, resolved for the tooltip footer's ad-hoc filters.
 *
 * Nothing renders differently because of this — topology is already resolved by the time it is
 * read. Its whole job is that `source="web-api"` is a filter on a label a `client`/`server`
 * metric has never carried, so the dashboard silently returns nothing.
 */
describe('frameToGraphWide — endpoint label keys', () => {
  it('is unset for a response that carried the contract’s own keys', () => {
    expect(frameToGraphWide([labelledEdges()], theme)?.endpointLabels).toBeUndefined();
  });

  // The unconverted route: a host that cannot run the prefix, or a datasource emitting the
  // wide kind natively. The keys are still on the fields, so no declaration is needed.
  it('reads the keys straight off the fields of an unconverted response', () => {
    const clientServer = toDataFrame({
      meta: { type: GRAPH_EDGES_WIDE },
      fields: [{ name: 'e1', type: FieldType.number, labels: { client: 'a', server: 'b' }, values: [10] }],
    });

    expect(frameToGraphWide([clientServer], theme)?.endpointLabels).toEqual({ source: 'client', target: 'server' });
  });

  // The converted route: the pivot rewrote the labels, so only its declaration survives.
  it('prefers the pair a converter declared over the fields it rewrote', () => {
    const pivoted = toDataFrame({
      meta: {
        type: GRAPH_EDGES_WIDE,
        custom: { graph: { sourceKey: 'client', targetKey: 'server' } },
      },
      fields: [{ name: 'e1', type: FieldType.number, labels: { source: 'a', target: 'b' }, values: [10] }],
    });

    expect(frameToGraphWide([pivoted], theme)?.endpointLabels).toEqual({ source: 'client', target: 'server' });
  });

  it('ignores a malformed declaration rather than filtering on half a pair', () => {
    const pivoted = toDataFrame({
      meta: { type: GRAPH_EDGES_WIDE, custom: { graph: { sourceKey: 'client' } } },
      fields: [{ name: 'e1', type: FieldType.number, labels: { source: 'a', target: 'b' }, values: [10] }],
    });

    expect(frameToGraphWide([pivoted], theme)?.endpointLabels).toBeUndefined();
  });

  /**
   * The producer half of the same key. `meta.custom.graph` is the contract's declaration of
   * "where my endpoint labels are", so a frame that names keys outside the conventional list
   * resolves its topology from them — which is what makes the list a fallback rather than a
   * ceiling.
   */
  it('resolves endpoints from keys the frame declares, however unconventional', () => {
    const declared = toDataFrame({
      meta: { type: GRAPH_EDGES_WIDE, custom: { graph: { sourceKey: 'caller', targetKey: 'callee' } } },
      fields: [{ name: 'e1', type: FieldType.number, labels: { caller: 'a', callee: 'b' }, values: [10] }],
    });

    const data = frameToGraphWide([declared], theme);

    expect(data?.links).toEqual([expect.objectContaining({ id: 'e1', source: 'a', target: 'b' })]);
    expect(data?.endpointLabels).toEqual({ source: 'caller', target: 'callee' });
  });

  it('claims a frame whose only endpoint carrier is its declaration', () => {
    const declared = toDataFrame({
      meta: { custom: { graph: { sourceKey: 'caller', targetKey: 'callee' } } },
      fields: [{ name: 'e1', type: FieldType.number, labels: { caller: 'a', callee: 'b' }, values: [10] }],
    });

    expect(isEdgesWideFrame(declared)).toBe(true);
  });
});

/**
 * Recovering the datasource's keys **by value**, which is what makes a multi-level flow
 * filterable with nothing configured. See `aliasEndpointKeys`.
 */
describe('aliasEndpointKeys', () => {
  const field = (labels: Labels): Field => ({
    name: 'Value',
    type: FieldType.number,
    labels,
    config: {},
    values: [1],
  });

  /** What `readLinks` passes: the pair the endpoints were read from, canonical for these. */
  const recover = (labels: Labels, endpoints: { source: string; target: string }) =>
    aliasEndpointKeys(field(labels), endpoints, { source: 'source', target: 'target' });

  /**
   * The motivating shape: `sum by (source, target, cluster, namespace) (label_replace(…))`.
   * `label_replace` copies rather than moves, so the original is still there to be found.
   */
  it('recovers the pair a label_replace copied from', () => {
    expect(
      recover(
        { source: 'prod', target: 'ns-a', cluster: 'prod', namespace: 'ns-a' },
        {
          source: 'prod',
          target: 'ns-a',
        }
      )
    ).toEqual({ source: 'cluster', target: 'namespace' });
  });

  /**
   * A key that is half of a *recognised* pair is still a candidate. `server` is the leaf of
   * a `namespace → service` level as often as it is the far end of `client`/`server`, and
   * declining it would refuse the exact case this exists for.
   */
  it('recovers a key that is also half of a conventional pair', () => {
    expect(
      recover(
        { source: 'ns-a', target: 'checkout', namespace: 'ns-a', server: 'checkout' },
        {
          source: 'ns-a',
          target: 'checkout',
        }
      )
    ).toEqual({ source: 'namespace', target: 'server' });
  });

  // One matched end is a coincidence, not a pair. This is the guard that stops a response
  // which really did group by `source`/`target` from being hijacked by an equal label.
  it('declines when only one end matches', () => {
    expect(recover({ source: 'api', target: 'db', job: 'api' }, { source: 'api', target: 'db' })).toBeUndefined();
  });

  // Two labels holding the source's value cannot be told apart, and recording one of two
  // would be wrong for half the response.
  it('declines an ambiguous match rather than picking one of two', () => {
    expect(
      recover(
        { source: 'prod', target: 'ns-a', cluster: 'prod', origin: 'prod', namespace: 'ns-a' },
        {
          source: 'prod',
          target: 'ns-a',
        }
      )
    ).toBeUndefined();
  });

  // A self-loop's two ends share one value, so the matches come off one list: first is the
  // source, next is the target.
  it('resolves a self-loop from two keys holding the one value', () => {
    expect(
      recover(
        { source: 'ns-a', target: 'ns-a', namespace: 'ns-a', workload: 'ns-a' },
        {
          source: 'ns-a',
          target: 'ns-a',
        }
      )
    ).toEqual({ source: 'namespace', target: 'workload' });
  });

  // One key cannot be both ends, and with three there is no reason to prefer any two.
  it('declines a self-loop that matches one key, or more than two', () => {
    expect(
      recover({ source: 'ns-a', target: 'ns-a', namespace: 'ns-a' }, { source: 'ns-a', target: 'ns-a' })
    ).toBeUndefined();
    expect(recover({ source: 'x', target: 'x', a: 'x', b: 'x', c: 'x' }, { source: 'x', target: 'x' })).toBeUndefined();
  });

  // The pair the endpoints were *read* from is skipped: reporting back the key the value
  // came out of says nothing.
  it('skips the pair the endpoints were read from', () => {
    expect(
      aliasEndpointKeys(
        field({ caller: 'a', callee: 'b' }),
        { source: 'a', target: 'b' },
        {
          source: 'caller',
          target: 'callee',
        }
      )
    ).toBeUndefined();
  });
});

/**
 * Which keys **each edge** filters under, resolved by the reader because it is the only
 * layer that sees the field and its frame together. See `edgeFilterLabels`.
 */
describe('frameToGraphWide — per-edge filter labels', () => {
  /** One frame, two levels — what the `or`-joined sankey query pivots to. */
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

  /**
   * The whole point: two edges of **one** frame answer differently. Neither the frame's
   * declaration nor the response-wide pair can express this, which is why the panel option
   * it replaces could only ever be right for one of the two levels.
   */
  it('recovers a different pair per level of one frame', () => {
    const data = frameToGraphWide([twoLevels()], theme);

    expect(data?.links.map((link) => link.filterLabels)).toEqual([
      { source: 'cluster', target: 'namespace' },
      { source: 'namespace', target: 'workload' },
    ]);
    // Nothing frame-wide to declare, and nothing that needs declaring.
    expect(data?.endpointLabels).toBeUndefined();
  });

  it('leaves an edge that carried only the contract’s pair unset', () => {
    expect(frameToGraphWide([labelledEdges()], theme)?.links.map((link) => link.filterLabels)).toEqual([
      undefined,
      undefined,
    ]);
  });

  // A pair the response *stated* is not a recovery and outranks one: the frame's own
  // declaration first, then the field's own non-canonical labels.
  it('prefers a stated pair over a recovered one', () => {
    const declared = toDataFrame({
      meta: { type: GRAPH_EDGES_WIDE, custom: { graph: { sourceKey: 'client', targetKey: 'server' } } },
      fields: [
        {
          name: 'e1',
          type: FieldType.number,
          labels: { source: 'a', target: 'b', cluster: 'a', namespace: 'b' },
          values: [1],
        },
      ],
    });
    const own = toDataFrame({
      meta: { type: GRAPH_EDGES_WIDE },
      fields: [{ name: 'e1', type: FieldType.number, labels: { client: 'a', server: 'b' }, values: [1] }],
    });

    expect(frameToGraphWide([declared], theme)?.links[0].filterLabels).toEqual({ source: 'client', target: 'server' });
    expect(frameToGraphWide([own], theme)?.links[0].filterLabels).toEqual({ source: 'client', target: 'server' });
  });

  /**
   * The recovery renders nothing and only shows up on a pinned tooltip, so a panel whose
   * filters resolve to a key nobody configured has to be inspectable.
   */
  it('reports the recovered pairs through the debug channel', () => {
    frameToGraphWide([twoLevels()], theme);

    expect(logged(LOG_LEVELS.info).join('\n')).toContain('cluster / namespace (1), namespace / workload (1)');
  });

  it('says nothing for a response that recovered nothing', () => {
    frameToGraphWide([labelledEdges()], theme);

    expect(logged(LOG_LEVELS.info).join('\n')).not.toContain('recovered');
  });

  /**
   * A query carrying its topology twice is not carrying a discriminator: without dropping
   * the recovered pair, two parallel edges would be told apart by their own endpoints.
   */
  it('keeps a recovered pair out of the parallel-edge discriminator', () => {
    const parallel = toDataFrame({
      meta: { type: GRAPH_EDGES_WIDE },
      fields: [
        {
          name: 'Value',
          type: FieldType.number,
          labels: { source: 'a', target: 'b', cluster: 'a', namespace: 'b', protocol: 'grpc' },
          values: [1],
        },
        {
          name: 'Value',
          type: FieldType.number,
          labels: { source: 'a', target: 'b', cluster: 'a', namespace: 'b', protocol: 'http' },
          values: [2],
        },
      ],
    });

    expect(frameToGraphWide([parallel], theme)?.links.map((link) => link.markKey)).toEqual([
      'a-->b {protocol="grpc"}',
      'a-->b {protocol="http"}',
    ]);
  });
});

/**
 * The fallback carrier's one documented ambiguity, resolved where the mark has labels to
 * check the split against. See `endpointsFromName`.
 */
describe('endpointsFromName', () => {
  it('splits at the first separator with nothing to check against', () => {
    expect(endpointsFromName('a-->b-->c')).toEqual({ source: 'a', target: 'b-->c' });
  });

  it('splits where both halves are values the mark carries', () => {
    expect(endpointsFromName('a-->b-->c', { source: 'a-->b', target: 'c' })).toEqual({
      source: 'a-->b',
      target: 'c',
    });
  });

  // One matching half is no evidence: every split of `a-->b-->c` has some half that matches
  // something, so a partial match falls back to first-wins rather than guessing.
  it('falls back to first-wins when no split matches both halves', () => {
    expect(endpointsFromName('a-->b-->c', { target: 'c' })).toEqual({ source: 'a', target: 'b-->c' });
  });

  it('is undefined for a name with no separator', () => {
    expect(endpointsFromName('plain')).toBeUndefined();
    expect(endpointsFromName('-->b')).toBeUndefined();
  });
});

describe('frameToGraphWide — edges', () => {
  it('reads one link per field, with endpoints from labels', () => {
    const data = frameToGraphWide([labelledEdges()], theme);

    expect(data?.links).toEqual([
      expect.objectContaining({ id: 'e1', source: 'a', target: 'b', value: 10 }),
      expect.objectContaining({ id: 'e2', source: 'b', target: 'c', value: 20 }),
    ]);
  });

  it('falls back to splitting the field name', () => {
    const data = frameToGraphWide([namedEdges()], theme);

    expect(data?.links.map((link) => [link.source, link.target])).toEqual([
      ['a', 'b'],
      ['b', 'c'],
    ]);
  });

  it('prefers labels over the name split when a frame carries both', () => {
    const frame = toDataFrame({
      fields: [{ name: 'x-->y', type: FieldType.number, labels: { source: 'a', target: 'b' }, values: [1] }],
    });

    const [link] = frameToGraphWide([frame], theme)!.links;
    expect([link.source, link.target]).toEqual(['a', 'b']);
    // The name is still the identity, and so the override target.
    expect(link.id).toBe('x-->y');
  });

  it('splits on the first separator, so a node id may contain one', () => {
    const frame = toDataFrame({
      fields: [{ name: 'a-->b-->c', type: FieldType.number, values: [1] }],
    });

    const [link] = frameToGraphWide([frame], theme)!.links;
    expect([link.source, link.target]).toEqual(['a', 'b-->c']);
  });

  it('carries per-edge custom style', () => {
    const frame = toDataFrame({
      fields: [
        {
          name: 'e1',
          type: FieldType.number,
          labels: { source: 'a', target: 'b' },
          config: { custom: { lineWidth: 6, lineType: 'dashed', curveness: 0.4 } },
          values: [1],
        },
      ],
    });

    const [link] = frameToGraphWide([frame], theme)!.links;
    expect(link.width).toBe(6);
    expect(link.lineType).toBe('dashed');
    expect(link.curveness).toBe(0.4);
  });

  it('reduces the mark values with the requested calc', () => {
    const frame = toDataFrame({
      fields: [{ name: 'e1', type: FieldType.number, labels: { source: 'a', target: 'b' }, values: [1, 2, 9] }],
    });

    expect(frameToGraphWide([frame], theme, { calcs: ['max'] })!.links[0].value).toBe(9);
    expect(frameToGraphWide([frame], theme, { calcs: ['sum'] })!.links[0].value).toBe(12);
    // Default is lastNotNull.
    expect(frameToGraphWide([frame], theme)!.links[0].value).toBe(9);
  });

  it('carries the owning field on every link', () => {
    const [link] = frameToGraphWide([labelledEdges()], theme)!.links;
    expect(link.field?.name).toBe('e1');
  });

  it('ignores a numeric field that describes no edge', () => {
    const frame = toDataFrame({
      fields: [
        { name: 'e1', type: FieldType.number, labels: { source: 'a', target: 'b' }, values: [1] },
        { name: 'unrelated', type: FieldType.number, values: [2] },
      ],
    });

    expect(frameToGraphWide([frame], theme)!.links.map((link) => link.id)).toEqual(['e1']);
  });

  it('returns null when there is no edges frame', () => {
    const nodes = toDataFrame({
      meta: { type: GRAPH_NODES_WIDE },
      fields: [{ name: 'a', type: FieldType.number, values: [1] }],
    });

    expect(frameToGraphWide([nodes], theme)).toBeNull();
  });
});

describe('frameToGraphWide — nodes', () => {
  const nodesFrame = (): DataFrame =>
    toDataFrame({
      name: 'nodes',
      meta: { type: GRAPH_NODES_WIDE },
      fields: [
        {
          name: 'a',
          type: FieldType.number,
          config: { displayName: 'Gateway', custom: { subtitle: 'edge', nodeRadius: 30, fixedX: 1, fixedY: 2 } },
          values: [5],
        },
        { name: 'b', type: FieldType.number, labels: { secondarystat: '12 req/s' }, values: [6] },
      ],
    });

  it('reads one node per field, identified by name and titled by displayName', () => {
    const data = frameToGraphWide([labelledEdges(), nodesFrame()], theme);

    expect(data?.nodes[0]).toEqual(expect.objectContaining({ id: 'a', name: 'Gateway', value: 5 }));
    // No displayName: the id is the label.
    expect(data?.nodes[1]).toEqual(expect.objectContaining({ id: 'b', name: 'b', value: 6 }));
  });

  it('carries per-node custom style and the secondary stat label', () => {
    const data = frameToGraphWide([labelledEdges(), nodesFrame()], theme);

    expect(data?.nodes[0]).toEqual(expect.objectContaining({ subtitle: 'edge', radius: 30, fixedX: 1, fixedY: 2 }));
    expect(data?.nodes[1].secondaries).toEqual([{ value: '12 req/s' }]);
  });

  it('appends endpoints the nodes frame did not declare', () => {
    const partial = toDataFrame({
      meta: { type: GRAPH_NODES_WIDE },
      fields: [{ name: 'a', type: FieldType.number, values: [5] }],
    });

    const data = frameToGraphWide([labelledEdges(), partial], theme);

    expect(data?.nodes.map((node) => node.id)).toEqual(['a', 'b', 'c']);
  });

  it('derives the node set from the links when no nodes frame is present', () => {
    const data = frameToGraphWide([labelledEdges()], theme);

    expect(data?.nodes.map((node) => node.id)).toEqual(['a', 'b', 'c']);
    // No stat: a node with neither field nor row has nothing to report. It used to be the
    // node's degree, which is a link count wearing a measurement's clothes — see
    // `deriveNodesFromLinks` and `converters/deriveNodes.ts`, the pre-pass that gives these
    // nodes a field instead on a host that can run it.
    expect(data?.nodes.map((node) => node.value)).toEqual([null, null, null]);
  });
});

describe('frameToGraphWide — edge colour', () => {
  /** One edge, carrying whatever colour config the case is about. */
  const edgeWith = (color: FieldConfig['color'], config: FieldConfig = {}): DataFrame =>
    withDisplay(
      toDataFrame({
        fields: [
          {
            name: 'e1',
            type: FieldType.number,
            labels: { source: 'a', target: 'b' },
            config: { ...config, color },
            values: [1],
          },
        ],
      })
    );

  it('takes the colour the display processor resolved, per mark', () => {
    // The payoff of the pivot: whatever colour the field ended up with — a literal one
    // (`fixed` here, `shades`/`gradient` below), a by-value band, panel-wide or from a
    // byName override — arrives off the field already theme-resolved, so no separate
    // resolver is involved. Only the palettes are filtered, and only for an edge.
    const color = frameToGraphWide([edgeWith({ mode: FieldColorModeId.Fixed, fixedColor: 'dark-red' })], theme)!
      .links[0].color;

    expect(color).toBe(theme.visualization.getColorByName('dark-red'));
  });

  it('falls back to the configured fixed colour when overrides have not run', () => {
    const frame = toDataFrame({
      fields: [
        {
          name: 'e1',
          type: FieldType.number,
          labels: { source: 'a', target: 'b' },
          config: { color: { mode: FieldColorModeId.Fixed, fixedColor: '#ff0000' } },
          values: [1],
        },
      ],
    });

    expect(frameToGraphWide([frame], theme)!.links[0].color).toBe('#ff0000');
  });

  it('leaves colour unset when the field carries none', () => {
    expect(frameToGraphWide([labelledEdges()], theme)!.links[0].color).toBeUndefined();
  });

  /**
   * The important half of the rule, and the one a fixture without a display processor
   * cannot show: in the host every field has `config.color` merged in from the panel's
   * registered default, which is palette-classic. Reading it would paint every edge a
   * different palette colour and defeat the series-level endpoint colouring, so a
   * palette mode counts as "nothing chosen" for an edge — but not for a node, whose
   * palette colour is exactly right.
   */
  it('ignores a palette mode on an edge and honours it on a node', () => {
    const paletted = (name: string, index: number, labels?: Record<string, string>): Field => {
      const field: Field = {
        name,
        type: FieldType.number,
        ...(labels ? { labels } : {}),
        config: { color: { mode: FieldColorModeId.PaletteClassic } },
        values: [10],
        state: { seriesIndex: index },
      };
      field.display = getDisplayProcessor({ field, theme });
      return field;
    };

    const edges = toDataFrame({ meta: { type: GRAPH_EDGES_WIDE }, fields: [] });
    edges.fields = [paletted('e1', 0, { source: 'a', target: 'b' })];
    edges.length = 1;
    const nodes = toDataFrame({ meta: { type: GRAPH_NODES_WIDE }, fields: [] });
    nodes.fields = [paletted('a', 1), paletted('b', 2)];
    nodes.length = 1;

    const data = frameToGraphWide([edges, nodes], theme)!;

    expect(data.links[0].color).toBeUndefined();
    expect(data.nodes.map((node) => node.color)).toEqual([
      getPaletteColorByIndex(1, theme),
      getPaletteColorByIndex(2, theme),
    ]);
  });

  it('honours the other two literal-colour modes on an edge', () => {
    const shades = frameToGraphWide([edgeWith({ mode: FieldColorModeId.Shades, fixedColor: 'dark-red' })], theme)!;
    const gradient = frameToGraphWide(
      [edgeWith({ mode: FieldColorModeId.Gradient, fixedColor: 'dark-red', gradientColorTo: 'dark-blue' })],
      theme
    )!;

    expect(shades.links[0].color).toBeDefined();
    expect(gradient.links[0].color).toBeDefined();
  });

  /**
   * "Edges have no color-scheme path at all" (the pre-pivot bug report, phase 3 of
   * `graph-wide-migration.md`) closes by construction rather than by a new resolver: an
   * edge **is** a field, so an
   * ordinary `byName` override targets exactly one of them, and only that one. There
   * was never an edge equivalent of the node resolver to delete; this is the gap
   * closing because the mark became addressable.
   */
  it('lets a byName override recolour one edge, theme-resolved', () => {
    const [frame] = asPipelineWould(
      [
        toDataFrame({
          meta: { type: GRAPH_EDGES_WIDE },
          fields: [
            { name: 'e1', type: FieldType.number, labels: { source: 'a', target: 'b' }, values: [1] },
            { name: 'e2', type: FieldType.number, labels: { source: 'b', target: 'c' }, values: [2] },
          ],
        }),
      ],
      [
        {
          matcher: { id: 'byName', options: 'e2' },
          properties: [{ id: 'color', value: { mode: FieldColorModeId.Fixed, fixedColor: 'dark-red' } }],
        },
      ]
    );

    const [e1, e2] = frameToGraphWide([frame], theme)!.links;
    expect(e2.color).toBe(theme.visualization.getColorByName('dark-red'));
    // Its neighbour keeps the palette default, which for an *edge* means no per-edge
    // colour at all so the series-level endpoint mode still governs it.
    expect(e1.color).toBeUndefined();
  });

  /**
   * **The reported bug.** The rule used to be a two-entry deny-list of `palette-classic`
   * and `palette-classic-by-name`, so every other palette — `palette-colorblind`, and
   * 13.3's `palette-categorical-next*` — gave each edge a colour of its own and turned
   * "Link color" off for the whole panel. A palette is a colour by series index or by a
   * hash of the name, which says nothing about which two nodes an edge joins, so all of
   * them fall through to the endpoint colouring.
   *
   * `palette-invented-upstream` is not a real mode and is the point: `getFieldColorMode`
   * answers an id it does not know with the `thresholds` mode, so the registry alone
   * would read a palette shipped after this build as by-value and reopen the bug. The
   * `palette-` prefix is what closes it.
   */
  it.each([
    FieldColorModeId.PaletteClassicByName,
    FieldColorModeId.PaletteColorblind,
    'palette-categorical-next',
    'palette-invented-upstream',
  ])('leaves an edge to Link color under the %s palette', (mode) => {
    expect(frameToGraphWide([edgeWith({ mode })], theme)!.links[0].color).toBeUndefined();
  });

  /**
   * The other half of the rule, and the one deliberately **not** changed with it: a
   * by-value scheme grades the edge by its own weight, which is a thing only the edge can
   * say — no endpoint colour carries it — so it keeps beating `relationsLinkColor`. The
   * consequence is that "Link color" has nothing to decide under such a scheme, which is
   * what its description says, since no `showIf` can see `fieldConfig` to hide it.
   */
  it.each([FieldColorModeId.Thresholds, FieldColorModeId.ContinuousGrYlRd])(
    'lets a by-value scheme (%s) colour the edge by its own weight',
    (mode) => {
      const frame = edgeWith(
        { mode },
        {
          thresholds: {
            mode: ThresholdsMode.Absolute,
            steps: [
              { color: 'green', value: -Infinity },
              { color: 'red', value: 0.5 },
            ],
          },
          min: 0,
          max: 1,
        }
      );

      expect(frameToGraphWide([frame], theme)!.links[0].color).toBeDefined();
    }
  );

  /** Thresholds, resolved: the edge's own value picks the band, not an endpoint's. */
  it('grades an edge by its own value, not its source node', () => {
    const thresholds = {
      color: { mode: FieldColorModeId.Thresholds },
      thresholds: {
        mode: ThresholdsMode.Absolute,
        steps: [
          { color: 'green', value: -Infinity },
          { color: 'red', value: 0.5 },
        ],
      },
    };
    const edges = withDisplay(
      toDataFrame({
        meta: { type: GRAPH_EDGES_WIDE },
        fields: [
          {
            name: 'e1',
            type: FieldType.number,
            labels: { source: 'a', target: 'b' },
            config: thresholds,
            values: [0.9],
          },
          {
            name: 'e2',
            type: FieldType.number,
            labels: { source: 'a', target: 'c' },
            config: thresholds,
            values: [0.1],
          },
        ],
      })
    );

    const data = frameToGraphWide([edges], theme)!;

    // Same source node, opposite bands — which is exactly what an endpoint colour cannot
    // express, and why a by-value scheme still wins.
    expect(data.links.map((link) => link.color)).toEqual([
      theme.visualization.getColorByName('red'),
      theme.visualization.getColorByName('green'),
    ]);
  });
});

/**
 * `custom.hideFrom.viz`, read off the mark's own field.
 *
 * The reader only *flags* a hidden mark; dropping it (and the links touching a hidden
 * node) is `withoutHiddenMarks` in `charts/relations.ts`, because the legend has to
 * keep listing a hidden mark for it to be restorable.
 */
describe('frameToGraphWide — hidden marks', () => {
  const hiddenCustom = { hideFrom: { viz: true, legend: false, tooltip: false } };

  it('flags an edge whose field is hidden', () => {
    const frame = toDataFrame({
      meta: { type: GRAPH_EDGES_WIDE },
      fields: [
        { name: 'e1', type: FieldType.number, labels: { source: 'a', target: 'b' }, values: [1] },
        {
          name: 'e2',
          type: FieldType.number,
          labels: { source: 'b', target: 'c' },
          config: { custom: hiddenCustom },
          values: [2],
        },
      ],
    });

    expect(frameToGraphWide([frame], theme)!.links.map((link) => link.hidden)).toEqual([undefined, true]);
  });

  it('flags a node whose field is hidden', () => {
    const nodes = toDataFrame({
      meta: { type: GRAPH_NODES_WIDE },
      fields: [
        { name: 'a', type: FieldType.number, values: [1] },
        { name: 'b', type: FieldType.number, config: { custom: hiddenCustom }, values: [2] },
      ],
    });

    expect(frameToGraphWide([labelledEdges(), nodes], theme)!.nodes.map((node) => node.hidden)).toEqual([
      undefined,
      true,
      // `c` is derived from the edges and has no field to carry the flag.
      undefined,
    ]);
  });

  // `viz: false` is the default `addHideFrom` writes onto every field, so reading it
  // as anything but "visible" would hide the whole graph the moment the property is
  // registered.
  it('treats an unset or false viz flag as visible', () => {
    const frame = toDataFrame({
      meta: { type: GRAPH_EDGES_WIDE },
      fields: [
        {
          name: 'e1',
          type: FieldType.number,
          labels: { source: 'a', target: 'b' },
          config: { custom: { hideFrom: { viz: false, legend: true, tooltip: true } } },
          values: [1],
        },
      ],
    });

    expect(frameToGraphWide([frame], theme)!.links[0].hidden).toBeUndefined();
  });
});

/**
 * The colour path, end to end. There is no resolver any more: `applyFieldOverrides`
 * runs above the panel, so whatever it decided is already on `field.display` by the
 * time the reader looks. These are the cases `makeRelationsColorResolver` used to
 * enumerate, restated against the pipeline that actually produces them.
 */
describe('frameToGraphWide — node colour', () => {
  /** Two marks, `a` and `b`, joined by the single edge below. */
  const nodesFrame = (): DataFrame =>
    toDataFrame({
      meta: { type: GRAPH_NODES_WIDE },
      fields: [
        { name: 'a', type: FieldType.number, values: [1] },
        { name: 'b', type: FieldType.number, values: [100] },
      ],
    });

  const oneEdge = (): DataFrame =>
    toDataFrame({
      meta: { type: GRAPH_EDGES_WIDE },
      fields: [{ name: 'e1', type: FieldType.number, labels: { source: 'a', target: 'b' }, values: [1] }],
    });

  /**
   * Nodes are listed **first** because `applyFieldOverrides` numbers `state.seriesIndex`
   * across the whole response, and that index is the palette slot. Role resolution reads
   * `meta.type`, not order, so the graph is the same either way.
   */
  const graph = (overrides: FieldConfigSource['overrides'] = []): DataFrame[] =>
    asPipelineWould([nodesFrame(), oneEdge()], overrides);

  const colorsOf = (frames: DataFrame[]): Array<string | undefined> =>
    frameToGraphWide(frames, theme)!.nodes.map((node) => node.color);

  /**
   * The headline capability, and the measurement the migration plan rests on: a
   * `byName` override targets **one mark**, and it arrives theme-resolved. The old
   * resolver read `fixedColor` straight out of `fieldConfig` and handed ECharts the
   * raw name, so `dark-red` painted as CSS `darkred` rather than Grafana's `#C4162A`.
   */
  it('lets a byName override recolour one node, theme-resolved', () => {
    const [a, b] = colorsOf(
      graph([
        {
          matcher: { id: 'byName', options: 'b' },
          properties: [{ id: 'color', value: { mode: FieldColorModeId.Fixed, fixedColor: 'dark-red' } }],
        },
      ])
    );

    expect(b).toBe(theme.visualization.getColorByName('dark-red'));
    expect(b).not.toBe('dark-red');
    // And only that one: its neighbour keeps its palette colour.
    expect(a).toBe(getPaletteColorByIndex(0, theme));
  });

  it('colours every node from its own value under a by-value scheme', () => {
    const [a, b] = colorsOf(
      graph([
        {
          matcher: { id: 'byType', options: 'number' },
          properties: [{ id: 'color', value: { mode: FieldColorModeId.ContinuousGrYlRd } }],
        },
      ])
    );

    // Different values, different points on the gradient — per mark, not per frame.
    expect(a).not.toBe(b);
  });

  /**
   * Grafana's own default colour mode is by-value (thresholds), but the panel
   * registers palette-classic, so "nothing configured" must stay categorical.
   */
  it('keeps an unconfigured node on the classic palette, by position', () => {
    expect(colorsOf(graph())).toEqual([getPaletteColorByIndex(0, theme), getPaletteColorByIndex(1, theme)]);
  });

  /**
   * A node **derived** from an edge's endpoints has no field, so nothing resolved a
   * colour for it. Left unset it would fall through to ECharts' own palette, which is
   * not the theme's — see `fillPaletteColors`.
   */
  it('palettes a derived node, which has no field to ask', () => {
    // `labelledEdges` is a->b, b->c: three nodes, none of them declared.
    const data = frameToGraphWide([labelledEdges()], theme)!;

    expect(data.nodes.every((node) => node.field == null)).toBe(true);
    expect(data.nodes.map((node) => node.color)).toEqual([
      getPaletteColorByIndex(0, theme),
      getPaletteColorByIndex(1, theme),
      getPaletteColorByIndex(2, theme),
    ]);
  });

  /**
   * Positions run over the *final* node list, so an endpoint the nodes frame did not
   * declare continues the palette rather than restarting it and colliding with the
   * first declared node.
   */
  it('continues the palette across appended endpoints', () => {
    const partial = toDataFrame({
      meta: { type: GRAPH_NODES_WIDE },
      fields: [{ name: 'a', type: FieldType.number, values: [5] }],
    });
    const data = frameToGraphWide([labelledEdges(), partial], theme)!;

    expect(data.nodes.map((node) => node.id)).toEqual(['a', 'b', 'c']);
    expect(new Set(data.nodes.map((node) => node.color)).size).toBe(3);
    expect(data.nodes[2].color).toBe(getPaletteColorByIndex(2, theme));
  });
});

describe('frame role resolution', () => {
  /**
   * `meta.type` first, in both directions. Without the negative half a node
   * legitimately named `a-->b` would be read as an edge, and the nodes frame would
   * become its own edges frame.
   */
  it('never claims a declared nodes frame as edges, however its fields are named', () => {
    const nodes = toDataFrame({
      meta: { type: GRAPH_NODES_WIDE },
      fields: [{ name: 'a-->b', type: FieldType.number, values: [5] }],
    });

    expect(isEdgesWideFrame(nodes)).toBe(false);
    expect(isGraphWideFrames([nodes])).toBe(false);
    expect(frameToGraphWide([nodes], theme)).toBeNull();
  });

  it('picks the declared edges frame over one that merely looks like edges', () => {
    const declared = toDataFrame({
      meta: { type: GRAPH_EDGES_WIDE },
      fields: [{ name: 'e1', type: FieldType.number, labels: { source: 'a', target: 'b' }, values: [1] }],
    });
    const lookalike = toDataFrame({
      fields: [{ name: 'x-->y', type: FieldType.number, values: [2] }],
    });

    // Listed second, and still the edges frame.
    expect(frameToGraphWide([lookalike, declared], theme)!.links.map((link) => link.id)).toEqual(['e1']);
  });

  /**
   * The nodes frame is not "any other frame with a numeric field": a second query
   * returning an ordinary series would otherwise add a disconnected node named after
   * it. Requiring a field name that an edge refers to is the wide equivalent of the row
   * form's "a nodes frame must have an `id` column".
   */
  it('does not read an unrelated frame in a mixed response as nodes', () => {
    const unrelated = toDataFrame({
      name: 'B-series',
      fields: [
        { name: 'time', type: FieldType.time, values: [1, 2] },
        { name: 'cpu', type: FieldType.number, values: [3, 4] },
      ],
    });

    const data = frameToGraphWide([namedEdges(), unrelated], theme)!;

    expect(data.nodes.map((node) => node.id)).toEqual(['a', 'b', 'c']);
  });

  it('still finds an undeclared nodes frame that names the endpoints', () => {
    const nodes = toDataFrame({
      fields: [
        { name: 'a', type: FieldType.number, values: [5] },
        { name: 'b', type: FieldType.number, values: [6] },
      ],
    });

    const data = frameToGraphWide([nodes, namedEdges()], theme)!;

    expect(data.nodes.map((node) => [node.id, node.value])).toEqual([
      ['a', 5],
      ['b', 6],
      // Declared nodes keep their stat; `c`, which only the edges name, has none.
      ['c', null],
    ]);
  });
});

describe('reduceOptions', () => {
  const ranged = (): DataFrame =>
    toDataFrame({
      meta: { type: GRAPH_NODES_WIDE },
      fields: [{ name: 'a', type: FieldType.number, config: { unit: 'ms' }, values: [1, 5, 9] }],
    });

  /**
   * Nothing is truncated. Only `calcs[0]` has a job outside the tooltip — it sizes a node and
   * weighs an edge — and every calc after it is a row, so a third and fourth are as usable as
   * the second. This used to drop `calcs[2..]` silently.
   */
  it('keeps every calc, defaulting only an empty list', () => {
    expect(normalizeRelationsCalcs({ calcs: ['max', 'min', 'mean'] })).toEqual(['max', 'min', 'mean']);
    expect(normalizeRelationsCalcs({ calcs: [] })).toEqual([RELATIONS_CALC_DEFAULT]);
    expect(normalizeRelationsCalcs(undefined)).toEqual([RELATIONS_CALC_DEFAULT]);
  });

  it('reduces the main stat with calcs[0] and the secondary with calcs[1]', () => {
    const frames = [labelledEdges(), withDisplay(ranged())];
    const data = frameToGraphWide(frames, theme, { calcs: ['max', 'min'], values: false, fields: '' })!;

    expect(data.nodes[0].value).toBe(9);
    // Formatted through the mark's *own* display processor, so it carries its own unit — and
    // paired with the reducer that produced it, so the tooltip can label the row.
    expect(data.nodes[0].secondaries).toEqual([{ calc: 'min', value: '1 ms' }]);
  });

  /**
   * A third and fourth calculation are rows too. They used to be dropped by
   * `normalizeRelationsCalcs` before the reader ever saw them, so picking one did nothing.
   */
  it('reduces one stat per calc past the first, in the order they were picked', () => {
    const frames = [labelledEdges(), withDisplay(ranged())];
    const data = frameToGraphWide(frames, theme, {
      calcs: ['max', 'min', 'mean', 'first'],
      values: false,
      fields: '',
    })!;

    expect(data.nodes[0].value).toBe(9);
    expect(data.nodes[0].secondaries).toEqual([
      { calc: 'min', value: '1 ms' },
      { calc: 'mean', value: '5 ms' },
      { calc: 'first', value: '1 ms' },
    ]);
  });

  /**
   * Each row keeps its own reducer rather than relying on position, so a calc that reduces to
   * nothing on this mark drops its row without relabelling the rows below it. A reducer the
   * registry does not know is the reachable case — `reduceField` answers `undefined` for it,
   * which `reduceValue` reads as no value.
   */
  it('skips a calc that reduces to nothing without shifting the rest', () => {
    const data = frameToGraphWide([labelledEdges(), withDisplay(ranged())], theme, {
      calcs: ['max', 'notAReducer', 'min'],
      values: false,
      fields: '',
    })!;

    expect(data.nodes[0].secondaries).toEqual([{ calc: 'min', value: '1 ms' }]);
  });

  it('falls back to the secondarystat label when no second calc is chosen', () => {
    const frames = [labelledEdges(), ranged()];
    frames[1].fields[0].labels = { secondarystat: '12 req/s' };

    expect(
      frameToGraphWide(frames, theme, { calcs: ['max'], values: false, fields: '' })!.nodes[0].secondaries
    ).toEqual([{ value: '12 req/s' }]);
  });

  /**
   * The second reducer applies to **edges too**, which it did not: `readLinks` took only
   * `calcs[0]`, so on the common shape — an edges-only response, where every mark is an
   * edge — picking a second calculation produced no second value anywhere and the
   * option read as broken. A mark is a mark; both kinds reduce the same way.
   */
  it('reduces an edge secondary stat with calcs[1]', () => {
    const rangedEdges = toDataFrame({
      meta: { type: GRAPH_EDGES_WIDE },
      fields: [
        {
          name: 'e1',
          type: FieldType.number,
          config: { unit: 'ms' },
          labels: { source: 'a', target: 'b' },
          values: [1, 5, 9],
        },
      ],
    });
    const data = frameToGraphWide([withDisplay(rangedEdges)], theme, {
      calcs: ['max', 'min'],
      values: false,
      fields: '',
    })!;

    expect(data.links[0].value).toBe(9);
    // Formatted through the edge's own display processor, as a node's is.
    expect(data.links[0].secondaries).toEqual([{ calc: 'min', value: '1 ms' }]);
  });

  it('leaves an edge secondary unset when only one calc is chosen', () => {
    const data = frameToGraphWide([labelledEdges()], theme, { calcs: ['max'], values: false, fields: '' })!;

    expect(data.links[0].secondaries).toBeUndefined();
  });
});

/**
 * The predicate behind "Show node values"'s visibility: on an edges-only response every
 * node is derived from an endpoint and carries no stat, so the switch would be a control
 * that visibly does nothing. See `hasNoNodeStats`.
 */
describe('hasNoNodeStats', () => {
  it('is true when no nodes frame reached the panel at all', () => {
    expect(hasNoNodeStats([labelledEdges()])).toBe(true);
  });

  it('is true when the derived-node pre-pass declared them with null values', () => {
    const derived = toDataFrame({
      meta: { type: GRAPH_NODES_WIDE },
      fields: [
        { name: 'a', type: FieldType.number, values: [null] },
        { name: 'b', type: FieldType.number, values: [null] },
      ],
    });

    expect(hasNoNodeStats([labelledEdges(), derived])).toBe(true);
  });

  it('is false as soon as one node carries a value', () => {
    const mixed = toDataFrame({
      meta: { type: GRAPH_NODES_WIDE },
      fields: [
        { name: 'a', type: FieldType.number, values: [null] },
        { name: 'b', type: FieldType.number, values: [7] },
      ],
    });

    expect(hasNoNodeStats([labelledEdges(), mixed])).toBe(false);
  });

  // The important half: it answers false whenever it cannot tell, because hiding a
  // working control is worse than showing an inert one.
  it('is false for frames that are not the wide contract, and for no frames', () => {
    expect(hasNoNodeStats([])).toBe(false);
    expect(hasNoNodeStats(undefined)).toBe(false);
    expect(hasNoNodeStats([toDataFrame({ fields: [{ name: 'x', type: FieldType.number, values: [1] }] })])).toBe(false);
  });
});

describe('mark rows', () => {
  it('points every mark with a field at row 0, and derived nodes at none', () => {
    const data = frameToGraphWide([labelledEdges()], theme)!;

    expect(data.links.map((link) => link.sourceRowIndex)).toEqual([0, 0]);
    // A derived node has no field, so there is no row for its data links either.
    expect(data.nodes.every((node) => node.sourceRowIndex === undefined && node.field === undefined)).toBe(true);
  });
});

/**
 * Reading a mark at **one timestamp** instead of reducing its rows away — the panel's
 * time slider. Two things make this more than an index lookup: the timeline is a union
 * across frames, because the raw shape gives every edge its own time column and no two
 * need agree; and the timestamp is therefore resolved to a row **per frame**, because a
 * shared index would read one mark at another mark's instant.
 */
describe('reading a mark at a timestamp', () => {
  /** One ranged edges frame on a shared row grid — what the pivot produces. */
  const pivoted = (): DataFrame =>
    toDataFrame({
      meta: { type: GRAPH_EDGES_WIDE },
      fields: [
        { name: 'Time', type: FieldType.time, values: [T0, T0 + STEP, T0 + 2 * STEP] },
        { name: 'a-->b', type: FieldType.number, values: [1, 2, 3] },
        { name: 'b-->c', type: FieldType.number, values: [10, 20, 30] },
      ],
    });

  /**
   * The switch's own visibility, which is a different question from the timeline's
   * contents: "is there anywhere to scrub to at all". See {@link hasGraphTimeline}.
   */
  describe('hasGraphTimeline', () => {
    it('is true for a ranged response with more than one stop', () => {
      expect(hasGraphTimeline([pivoted()])).toBe(true);
    });

    // Two frames of one stop each are still two stops, so the union is what decides —
    // not any single frame's row count.
    it('is true when the stops are spread across frames', () => {
      const frames = [
        rawSeries({ source: 'a', target: 'b' }, [1], [T0]),
        rawSeries({ source: 'b', target: 'c' }, [2], [T0 + STEP]),
      ];

      expect(hasGraphTimeline(frames)).toBe(true);
    });

    // One stop is an instant response with a clock on it: nowhere to scrub to.
    it('is false for a single stop, however many frames carry it', () => {
      const frames = [
        rawSeries({ source: 'a', target: 'b' }, [1], [T0]),
        rawSeries({ source: 'b', target: 'c' }, [2], [T0]),
      ];

      expect(hasGraphTimeline(frames)).toBe(false);
      expect(hasGraphTimeline([labelledEdges()])).toBe(false);
    });

    /**
     * False whenever it cannot tell — the opposite of `hasNoNodeStats`, and the note on
     * {@link hasGraphTimeline} says why: the control's own `showIf` keeps an
     * already-enabled switch visible, so hiding on "don't know" cannot strand anyone.
     */
    it('is false with no data at all', () => {
      expect(hasGraphTimeline(undefined)).toBe(false);
      expect(hasGraphTimeline([])).toBe(false);
    });

    // Not a graph in either shape: no roles resolve, so there is nothing to time.
    it('is false for frames that are not a graph', () => {
      const plain = toDataFrame({
        fields: [
          { name: 'time', type: FieldType.time, values: [T0, T0 + STEP] },
          { name: 'value', type: FieldType.number, values: [1, 2] },
        ],
      });

      expect(hasGraphTimeline([plain])).toBe(false);
    });
  });

  describe('graphWideTimeline', () => {
    it("unions every frame's stops, ascending and deduped", () => {
      // Ragged on purpose: the second series starts a step late and the third skips one,
      // which is the raw labelled shape a stock host reads without any pivot.
      const frames = [
        rawSeries({ source: 'a', target: 'b' }, [1, 2], [T0, T0 + STEP]),
        rawSeries({ source: 'b', target: 'c' }, [3, 4], [T0 + STEP, T0 + 2 * STEP]),
        rawSeries({ source: 'a', target: 'c' }, [5], [T0 + 3 * STEP]),
      ];

      expect(graphWideTimeline(frames)).toEqual([T0, T0 + STEP, T0 + 2 * STEP, T0 + 3 * STEP]);
    });

    // The pivoted shape already shares one grid, so the union is that grid unchanged.
    it('reads the shared row grid of a pivoted frame', () => {
      expect(graphWideTimeline([pivoted()])).toEqual([T0, T0 + STEP, T0 + 2 * STEP]);
    });

    /**
     * Empty on instant data, which is what hides the slider: `tempo-service-map.json`
     * and every `rowsToFields` route reach the panel with no row dimension at all.
     */
    it('is empty when no frame has a row dimension', () => {
      expect(graphWideTimeline([labelledEdges()])).toEqual([]);
    });

    // Not a graph at all: no roles resolve, so there is nothing to build a timeline from.
    it('is empty when the frames are not a graph', () => {
      expect(graphWideTimeline([])).toEqual([]);
    });

    // A nodes frame's clock counts too — its marks are read at the same instant.
    it('includes the stops a nodes frame carries', () => {
      const nodes = toDataFrame({
        meta: { type: GRAPH_NODES_WIDE },
        fields: [
          { name: 'Time', type: FieldType.time, values: [T0 + 9 * STEP] },
          { name: 'a', type: FieldType.number, values: [7] },
        ],
      });

      expect(graphWideTimeline([pivoted(), nodes])).toContain(T0 + 9 * STEP);
    });
  });

  it("takes each mark's value at the selected row rather than reducing", () => {
    const at = frameToGraphWide([pivoted()], theme, undefined, T0 + STEP)!;

    expect(at.links.map((link) => link.value)).toEqual([2, 20]);
    // The reducing reading of the same frames, for contrast: `lastNotNull` is the newest.
    expect(frameToGraphWide([pivoted()], theme)!.links.map((link) => link.value)).toEqual([3, 30]);
  });

  /**
   * Ragged frames, resolved **per frame**. Row 1 is a different instant in each of these,
   * which is exactly what a shared index would get wrong.
   */
  it("resolves the timestamp against each frame's own row dimension", () => {
    const frames = [
      rawSeries({ source: 'a', target: 'b' }, [1, 2, 3], [T0, T0 + STEP, T0 + 2 * STEP]),
      rawSeries({ source: 'b', target: 'c' }, [40, 50], [T0 + STEP, T0 + 2 * STEP]),
    ];

    const data = frameToGraphWide(frames, theme, undefined, T0 + STEP)!;

    expect(data.links.map((link) => link.value)).toEqual([2, 40]);
  });

  /**
   * A mark with no sample at the selected timestamp reads `null` — the same thing an
   * all-null field reduces to today, so the existing handling applies unchanged: the edge
   * draws weightless (`value ?? 1`) rather than vanishing, and the topology stays stable
   * while scrubbing. No carry-forward, no invented data.
   */
  it('reads null where a frame has no sample at the timestamp, keeping the edge', () => {
    const frames = [
      rawSeries({ source: 'a', target: 'b' }, [1, 2], [T0, T0 + STEP]),
      rawSeries({ source: 'b', target: 'c' }, [40], [T0 + STEP]),
    ];

    const data = frameToGraphWide(frames, theme, undefined, T0)!;

    // The second edge is still in the graph, weightless.
    expect(data.links.map((link) => [link.source, link.target, link.value])).toEqual([
      ['a', 'b', 1],
      ['b', 'c', 1],
    ]);
    expect(data.nodes.map((node) => node.id)).toEqual(['a', 'b', 'c']);
  });

  /**
   * `sourceRowIndex` is what a data link interpolates `${__value.numeric}` against, and
   * at a selected row it agrees with the tooltip — which the reducing reading cannot
   * promise, since "the row the reducer picked" is meaningless for a mean.
   */
  it("points a mark's data link at the selected row", () => {
    const data = frameToGraphWide([pivoted()], theme, undefined, T0 + 2 * STEP)!;

    expect(data.links.map((link) => link.sourceRowIndex)).toEqual([2, 2]);
  });

  // Falls back to row 0 when the frame has no sample there, so an interpolated link still
  // resolves rather than reading off the end of the field.
  it('falls back to row 0 for a frame with no sample at the timestamp', () => {
    const frames = [rawSeries({ source: 'b', target: 'c' }, [40], [T0 + STEP])];

    expect(frameToGraphWide(frames, theme, undefined, T0)!.links[0].sourceRowIndex).toBe(0);
  });

  /**
   * No secondary stats at a row: every reducer agrees over one value, so `calcs[1..]`
   * would render as duplicate tooltip rows saying the same number under different names.
   */
  it('suppresses the secondary stats at a selected row', () => {
    const options: ReduceDataOptions = { calcs: ['max', 'min', 'mean'], values: false, fields: '' };
    const reduced = frameToGraphWide([pivoted()], theme, options)!;
    const at = frameToGraphWide([pivoted()], theme, options, T0 + STEP)!;

    expect(reduced.links[0].secondaries).toEqual([
      { calc: 'min', value: '1' },
      { calc: 'mean', value: '2' },
    ]);
    expect(at.links[0].secondaries).toBeUndefined();
  });

  /**
   * The `secondarystat` label is not a reducer's output — it is one value the conversion
   * carried across for row input — so it survives the selected-row reading.
   */
  it('keeps the secondarystat label at a selected row', () => {
    const frame = pivoted();
    frame.fields[1].labels = { ...frame.fields[1].labels, secondarystat: '12 req/s' };

    const data = frameToGraphWide([frame], theme, undefined, T0)!;

    expect(data.links[0].secondaries).toEqual([{ value: '12 req/s' }]);
  });

  /**
   * Node marks read at the row too. Their frame's own clock is what resolves it, which is
   * why a nodes frame on a different grid is not silently indexed by the edges' rows.
   */
  it('reads a declared node at the selected row', () => {
    const nodes = toDataFrame({
      meta: { type: GRAPH_NODES_WIDE },
      fields: [
        { name: 'Time', type: FieldType.time, values: [T0, T0 + STEP, T0 + 2 * STEP] },
        { name: 'a', type: FieldType.number, values: [100, 200, 300] },
      ],
    });

    const data = frameToGraphWide([pivoted(), nodes], theme, undefined, T0 + STEP)!;

    expect(data.nodes.find((node) => node.id === 'a')?.value).toBe(200);
  });

  // A timestamp no frame carries is not resolved to a neighbour here: snapping to a real
  // stop is the slider's job (`resolveTimelineIndex`), and inventing one would hide a bug.
  it('reads every mark as null at a timestamp no frame carries', () => {
    const data = frameToGraphWide([pivoted()], theme, undefined, T0 + 99 * STEP)!;

    expect(data.links.every((link) => link.value === 1)).toBe(true);
  });
});

describe('collecting every edges frame', () => {
  /**
   * The contract's *Multi* row variant, and the shape any labelled datasource returns with
   * no transformation at all. Each of these frames passes `isEdgesWideFrame` on its own, so
   * the old singular `.find()` drew a **one-edge graph** from a ten-series response with no
   * error, no notice and no log. The pivot that fixes the identity side cannot be relied on
   * to fix this one: `setDataTransformations` is feature-detected *and* gated behind
   * `grafana.panelPluginTransformations`, off by default, so on a stock host the reader is
   * the entire data path.
   */
  it('collects every frame that looks like edges', () => {
    const data = frameToGraphWide(valueEdges(), theme)!;

    expect(data.links.map((link) => [link.source, link.target, link.value])).toEqual([
      ['a', 'b', 12],
      ['b', 'c', 22],
      ['a', 'c', 32],
    ]);
    // The whole topology, rather than the first frame's single pair.
    expect(data.nodes.map((node) => node.id)).toEqual(['a', 'b', 'c']);
  });

  /**
   * Declared-wins is a **filter**, not a find — the generalisation of "picks the declared
   * edges frame over one that merely looks like edges".
   *
   * It keeps `meta.type` authoritative in the negative direction: a frame that says what it
   * is never gets mixed with frames that were only guessed at. It also keeps the reader and
   * the pivot agreeing about one response, since `longEdgeSeries` declines a whole response
   * for the same reason — so a declared frame beside raw series renders what it does today.
   */
  it('collects only the declared frames when any frame declares itself', () => {
    const declared = toDataFrame({
      meta: { type: GRAPH_EDGES_WIDE },
      fields: [{ name: 'e1', type: FieldType.number, labels: { source: 'a', target: 'b' }, values: [1] }],
    });
    const lookalike = toDataFrame({
      fields: [{ name: 'x-->y', type: FieldType.number, values: [2] }],
    });
    const raw = rawSeries({ source: 'c', target: 'd' }, [3]);

    expect(frameToGraphWide([lookalike, declared, raw], theme)!.links.map((link) => link.id)).toEqual(['e1']);
  });

  /**
   * The nodes search runs over the union of every collected frame's endpoints. Here `c` is
   * named by the **second** edges frame alone, so a search over the first frame's endpoints
   * would miss this nodes frame entirely and `c` would be derived — statless — instead of
   * keeping the stat the frame declares for it.
   */
  it('unions the endpoint set across every edges frame when looking for nodes', () => {
    const nodes = toDataFrame({
      fields: [{ name: 'c', type: FieldType.number, values: [6] }],
    });

    const data = frameToGraphWide(
      [rawSeries({ source: 'a', target: 'b' }, [1]), rawSeries({ source: 'b', target: 'c' }, [2]), nodes],
      theme
    )!;

    expect(data.nodes.map((node) => [node.id, node.value])).toEqual([
      ['c', 6],
      ['a', null],
      ['b', null],
    ]);
  });

  /**
   * The nodes search excludes **every** edges candidate, collected or not. The second frame
   * here is edges by its labels *and* named after an endpoint, so under the old
   * "any frame that is not the edges frame" exclusion it would have become the nodes frame —
   * turning one of the two edges into a node's stat.
   */
  it('does not read a second edges frame as the nodes frame', () => {
    const first = toDataFrame({
      fields: [{ name: 'a-->b', type: FieldType.number, values: [1] }],
    });
    const second = toDataFrame({
      fields: [{ name: 'b', type: FieldType.number, labels: { source: 'b', target: 'c' }, values: [2] }],
    });

    const data = frameToGraphWide([first, second], theme)!;

    expect(data.links.map((link) => [link.source, link.target])).toEqual([
      ['a', 'b'],
      ['b', 'c'],
    ]);
    expect(data.nodes.map((node) => node.id)).toEqual(['a', 'b', 'c']);
    expect(data.nodes.every((node) => node.field == null)).toBe(true);
  });

  /**
   * A mark reduces over its **own** rows, and every reducer skips nulls — so a raw series
   * gives the same number as the same series null-padded onto a pivot's shared row grid.
   * "Key on the timestamp, never the row index" binds whatever *builds* a frame; the reader
   * joins nothing.
   */
  it('reduces each mark over its own rows, however ragged', () => {
    const frames = [
      rawSeries({ source: 'a', target: 'b' }, [5]),
      rawSeries({ source: 'b', target: 'c' }, [1, null, 3, 4]),
    ];

    expect(frameToGraphWide(frames, theme, withCalc('sum'))!.links.map((link) => link.value)).toEqual([5, 8]);
    // The gap is skipped rather than averaged in as a zero: 8 / 3, not 8 / 4.
    expect(frameToGraphWide(frames, theme, withCalc('mean'))!.links.map((link) => link.value)).toEqual([5, 8 / 3]);
  });

  /**
   * A series with no samples still claimed to describe this edge, so it draws — weightless.
   * Pre-existing behaviour of the `value ?? 1` fallback, asserted because a raw multi-frame
   * response is where an empty series actually turns up.
   */
  it('draws a weightless edge for a series with no samples', () => {
    const data = frameToGraphWide([rawSeries({ source: 'a', target: 'b' }, [])], theme)!;

    expect(data.links).toHaveLength(1);
    expect(data.links[0].value).toBe(1);
  });
});

describe('identity across collected frames', () => {
  /**
   * The contract's first sentence, held even where it is inconvenient: identity is
   * `field.name`. A minted id would be one no override can match — `byName`/`byNames`
   * compare against `field.name` or the display name — and `getOverrideTargetNames` feeds an
   * **exclude** matcher, so an id no field answers to there would make hiding one node erase
   * every link in the panel. The fix for `Value` × N is upstream: a legend format, or the
   * `graph-edges-wide` pivot.
   */
  it('keeps field.name as the id, even when several marks share it', () => {
    const data = frameToGraphWide(valueEdges(), theme)!;

    expect(data.links.map((link) => link.id)).toEqual(['Value', 'Value', 'Value']);
    // Each mark still carries its own field, so nothing but the *name* is shared.
    expect(data.links.map((link) => link.field?.labels?.target)).toEqual(['b', 'c', 'c']);
  });

  /**
   * `markKey` is what `getRelationsTooltipMarks` keys its link map by, and the only thing
   * duplicate ids actually break: without it the map is last-write-wins and all N edges
   * format with the last one's unit and surface its `config.links`.
   */
  it('gives each colliding mark its own lookup key', () => {
    const keys = frameToGraphWide(valueEdges(), theme)!.links.map((link) => link.markKey);

    expect(keys).toEqual(['a-->b', 'b-->c', 'a-->c']);
    expect(new Set(keys).size).toBe(3);
  });

  /** The ladder's second rung, shared with the pivot: parallel edges by their own label. */
  it('discriminates colliding marks over one node pair by the label that tells them apart', () => {
    const data = frameToGraphWide(
      [
        rawSeries({ source: 'a', target: 'b', protocol: 'http' }, [1]),
        rawSeries({ source: 'a', target: 'b', protocol: 'grpc' }, [2]),
      ],
      theme
    )!;

    expect(data.links.map((link) => link.markKey)).toEqual(['a-->b {protocol="http"}', 'a-->b {protocol="grpc"}']);
  });

  it('leaves markKey unset when the ids are already unique', () => {
    const data = frameToGraphWide([labelledEdges()], theme)!;

    expect(data.links.every((link) => link.markKey === undefined)).toBe(true);
  });

  /**
   * The one per-edge override the raw path does support, and why the duplication is
   * "degraded, not lost": `byName` tests the **display name** as well as the field name, and
   * a field named exactly `Value` contributes nothing to its own display name, so what is
   * left is the label set. It stops working the moment a legend format is added, because
   * `displayNameFromDS` then wins.
   */
  it('lets a byName override on the display name reach exactly one of N Value marks', () => {
    const frames = asPipelineWould(valueEdges(), [
      {
        matcher: { id: 'byName', options: '{source="b", target="c"}' },
        properties: [{ id: 'color', value: { mode: FieldColorModeId.Fixed, fixedColor: 'dark-red' } }],
      },
    ]);

    expect(frameToGraphWide(frames, theme)!.links.map((link) => link.color)).toEqual([
      undefined,
      theme.visualization.getColorByName('dark-red'),
      undefined,
    ]);
  });
});

describe('collecting every nodes frame', () => {
  /**
   * The same silent drop on the nodes side: `legacyToWide` converts *every* legacy nodes
   * frame it finds, so a two-query legacy response produces two `graph-nodes-wide` frames of
   * which the reader used to read one. A node id is the ECharts graph key, so a repeated
   * declaration is a real collision rather than a display problem — response order decides.
   */
  it('reads every nodes frame, first field per id winning', () => {
    const first = toDataFrame({
      meta: { type: GRAPH_NODES_WIDE },
      fields: [
        { name: 'a', type: FieldType.number, values: [5] },
        { name: 'b', type: FieldType.number, values: [6] },
      ],
    });
    const second = toDataFrame({
      meta: { type: GRAPH_NODES_WIDE },
      fields: [
        { name: 'b', type: FieldType.number, values: [99] },
        { name: 'c', type: FieldType.number, values: [7] },
      ],
    });

    const data = frameToGraphWide([labelledEdges(), first, second], theme)!;

    expect(data.nodes.map((node) => [node.id, node.value])).toEqual([
      ['a', 5],
      ['b', 6],
      ['c', 7],
    ]);
  });
});

/**
 * The collection is invisible — no notice, no Transform tab entry — so the two cases where
 * it changes what a response renders have to be legible somewhere. `development.ts`
 * suppresses info by default and shows warn in a dev build, which is the split these want.
 * @todo clean up (by hand) - these tests are useless but they keep the bot from removing the console logs while we're in dev/PoC mode
 */
describe('reader diagnostics', () => {
  it('notes the collection at info level, with what the first frame alone would have drawn', () => {
    frameToGraphWide(valueEdges(), theme);

    expect(logged(LOG_LEVELS.info)).toEqual([expect.stringContaining('read 3 edge(s) from 3 edges frames')]);
  });

  it('warns when collected marks share an id, and names the fix', () => {
    frameToGraphWide(valueEdges(), theme);

    expect(logged(LOG_LEVELS.warn)).toEqual([
      expect.stringContaining('Colliding edges: 3 edges with colliding names: Value'),
    ]);
  });

  it('says nothing about a single edges frame whose ids are unique', () => {
    frameToGraphWide([labelledEdges()], theme);

    expect(logged(LOG_LEVELS.info)).toEqual([]);
    expect(logged(LOG_LEVELS.warn)).toEqual([]);
  });
});
