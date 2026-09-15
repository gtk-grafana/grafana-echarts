import { type DataFrame, type Field, FieldType, type Labels, toDataFrame } from '@grafana/data';
import { aliasEndpointKeys, endpointsFromName, GRAPH_EDGES_WIDE } from 'lib/echarts/relations/converters/contract';
import { isEdgesWideFrame } from 'lib/echarts/relations/converters/frameRoles';
import { frameToGraphWide } from 'lib/echarts/relations/converters/graphWide';
import { theme, labelledEdges } from 'test/graphWide';
import { debug, LOG_LEVELS } from 'development';

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

describe('frameToGraphWide — endpoint label keys', () => {
  it('is unset for a response that carried the contract’s own keys', () => {
    expect(frameToGraphWide([labelledEdges()], theme)?.endpointLabels).toBeUndefined();
  });

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

describe('aliasEndpointKeys', () => {
  const field = (labels: Labels): Field => ({
    name: 'Value',
    type: FieldType.number,
    labels,
    config: {},
    values: [1],
  });

  /** Use the canonical endpoint pair read by `readLinks`. */
  const recover = (labels: Labels, endpoints: { source: string; target: string }) =>
    aliasEndpointKeys(field(labels), endpoints, { source: 'source', target: 'target' });

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

  it('declines when only one end matches', () => {
    expect(recover({ source: 'api', target: 'db', job: 'api' }, { source: 'api', target: 'db' })).toBeUndefined();
  });

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

  it('falls back to first-wins when no split matches both halves', () => {
    expect(endpointsFromName('a-->b-->c', { target: 'c' })).toEqual({ source: 'a', target: 'b-->c' });
  });

  it('is undefined for a name with no separator', () => {
    expect(endpointsFromName('plain')).toBeUndefined();
    expect(endpointsFromName('-->b')).toBeUndefined();
  });
});

describe('frameToGraphWide — per-edge filter labels', () => {
  /** Build one frame with two sankey levels. */
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

  it('reports the recovered pairs through the debug channel', () => {
    frameToGraphWide([twoLevels()], theme);

    expect(logged(LOG_LEVELS.info).join('\n')).toContain('cluster / namespace (1), namespace / workload (1)');
  });

  it('says nothing for a response that recovered nothing', () => {
    frameToGraphWide([labelledEdges()], theme);

    expect(logged(LOG_LEVELS.info).join('\n')).not.toContain('recovered');
  });

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
