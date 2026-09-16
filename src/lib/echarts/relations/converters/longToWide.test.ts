import {
  createTheme,
  type DataFrame,
  type DataFrameType,
  type FieldConfig,
  FieldType,
  type Labels,
  toDataFrame,
} from '@grafana/data';
import { lastValueFrom, of } from 'rxjs';

import { debug, LOG_LEVELS } from 'development';

import {
  isLongEdgesFrame,
  isLongGraphFrames,
  longToWide,
  longToWideOperator,
} from 'lib/echarts/relations/converters/longToWide';
import { frameToRelationsGraph, type RelationsGraphReadResult } from 'lib/echarts/relations/converters/nodeGraph';

import { GRAPH_EDGES_WIDE, GRAPH_NODES_WIDE } from 'lib/echarts/relations/converters/contract';
jest.mock('development', () => ({
  debug: jest.fn(),
  LOG_LEVELS: { debug: 0, info: 1, warn: 2, error: 3 },
}));

const logged = (level: number): string[] =>
  jest
    .mocked(debug)
    .mock.calls.filter((call) => call[1] === level)
    .map(([message]) => message);

const graphData = (result: RelationsGraphReadResult) => {
  if (result.kind !== 'data') {
    throw new Error(`fixture produced ${result.reason}`);
  }
  return result.data;
};

beforeEach(() => {
  jest.mocked(debug).mockClear();
});

const T0 = 1700000000000;
const T1 = T0 + 300000;

const series = (
  labels: Labels,
  values: Array<number | null>,
  extra: { name?: string; times?: number[]; config?: FieldConfig } = {}
): DataFrame =>
  toDataFrame({
    ...(extra.name != null ? { name: extra.name } : {}),
    refId: 'A',
    meta: { type: 'timeseries-multi' as DataFrameType },
    fields: [
      { name: 'Time', type: FieldType.time, values: extra.times ?? [T0, T1].slice(0, values.length) },
      { name: 'Value', type: FieldType.number, labels, values, config: extra.config ?? {} },
    ],
  });

const edges = (): DataFrame[] => [
  series({ source: 'a', target: 'b' }, [10, 12]),
  series({ source: 'b', target: 'c' }, [20, 22]),
  series({ source: 'a', target: 'c' }, [30, 32]),
];

describe('longToWide — the pivot', () => {
  it('makes one numeric field per series, named by its endpoints, in one frame', () => {
    const out = longToWide(edges());

    expect(out).toHaveLength(1);
    // The row dimension comes before the mark fields.
    expect(out[0].fields.map((field) => field.name)).toEqual(['Time', 'a-->b', 'b-->c', 'a-->c']);
    expect(out[0].fields.slice(1).map((field) => field.type)).toEqual([
      FieldType.number,
      FieldType.number,
      FieldType.number,
    ]);
  });

  it('gives every edge its own id in the model the panel reads', () => {
    const data = graphData(frameToRelationsGraph(longToWide(edges()), createTheme()));

    expect(data.links.map((link) => link.id)).toEqual(['a-->b', 'b-->c', 'a-->c']);
    expect(data.links.map((link) => [link.source, link.target])).toEqual([
      ['a', 'b'],
      ['b', 'c'],
      ['a', 'c'],
    ]);
  });

  it('re-emits the endpoints as labels under the canonical keys', () => {
    const [wide] = longToWide(edges());

    expect(wide.fields[1].labels).toEqual({ source: 'a', target: 'b' });
    expect(wide.fields[2].labels).toEqual({ source: 'b', target: 'c' });
  });

  it('keeps every other label alongside the endpoints', () => {
    const [wide] = longToWide([series({ source: 'a', target: 'b', protocol: 'grpc' }, [1])]);

    expect(wide.fields[1].labels).toEqual({ source: 'a', target: 'b', protocol: 'grpc' });
  });

  it('stamps the wide kind and its type version', () => {
    const [wide] = longToWide(edges());

    expect(wide.meta?.type).toBe(GRAPH_EDGES_WIDE);
    expect(wide.meta?.typeVersion).toEqual([0, 1]);
  });

  it('carries the query identity over but not one series name', () => {
    const [wide] = longToWide([series({ source: 'a', target: 'b' }, [1], { name: 'a-->b' })]);

    expect(wide.refId).toBe('A');
    expect(wide.name).toBeUndefined();
  });
});

describe('longToWide — conventional endpoint labels', () => {
  const clientServer = (): DataFrame[] => [
    series({ client: 'a', server: 'b' }, [10, 12]),
    series({ client: 'b', server: 'c' }, [20, 22]),
  ];

  it('claims a client/server response as edges', () => {
    expect(isLongGraphFrames(clientServer())).toBe(true);
  });

  it('pivots it to the canonical keys, so the reader needs no new carrier', () => {
    const [wide] = longToWide(clientServer());

    expect(wide.fields.map((field) => field.name)).toEqual(['Time', 'a-->b', 'b-->c']);
    expect(wide.fields[1].labels).toEqual({ source: 'a', target: 'b' });
  });

  it('declares the pair it read on the frame', () => {
    const [wide] = longToWide(clientServer());

    expect(wide.meta?.custom?.graph).toEqual({ sourceKey: 'client', targetKey: 'server' });
  });

  it('records nothing for a response that really did group by source/target', () => {
    const [wide] = longToWide(edges());

    expect(wide.meta?.custom?.graph).toBeUndefined();
  });

  it('records nothing when the response mixes pairs', () => {
    const [wide] = longToWide([series({ client: 'a', server: 'b' }, [1]), series({ source: 'b', target: 'c' }, [1])]);

    expect(wide.meta?.custom?.graph).toBeUndefined();
  });

  it('keeps the endpoints out of the parallel-edge discriminator', () => {
    const [wide] = longToWide([
      series({ client: 'a', server: 'b', protocol: 'grpc' }, [1]),
      series({ client: 'a', server: 'b', protocol: 'http' }, [2]),
    ]);

    expect(wide.fields.map((field) => field.name)).toEqual([
      'Time',
      'a-->b {protocol="grpc"}',
      'a-->b {protocol="http"}',
    ]);
  });

  it('prefers the canonical pair when both are present', () => {
    const [wide] = longToWide([series({ source: 'a', target: 'b', client: 'x', server: 'y' }, [1])]);

    expect(wide.fields[1].labels).toEqual({ source: 'a', target: 'b', client: 'x', server: 'y' });
    expect(wide.meta?.custom?.graph).toBeUndefined();
  });

  // End to end: the keys reach the model the tooltip footer reads.
  it('reaches the model as the response’s endpoint labels', () => {
    const data = graphData(frameToRelationsGraph(longToWide(clientServer()), createTheme()));

    expect(data.endpointLabels).toEqual({ source: 'client', target: 'server' });
  });
});

describe('longToWide — the legend format as a carrier', () => {
  const legend = (id: string, labels: Labels = {}): DataFrame =>
    series(labels, [1, 2], { config: { displayNameFromDS: id } });

  it('claims a series whose legend format is an edge id, with no endpoint labels at all', () => {
    const frame = legend('a-->b', { cluster: 'a', namespace: 'b' });

    expect(isLongEdgesFrame(frame)).toBe(true);
    expect(isLongGraphFrames([frame])).toBe(true);
  });

  it('pivots it under the canonical keys, so the reader needs no new carrier', () => {
    const [wide] = longToWide([legend('a-->b', { cluster: 'a', namespace: 'b' })]);

    expect(wide.fields.map((field) => field.name)).toEqual(['Time', 'a-->b']);
    expect(wide.fields[1].labels).toEqual({ cluster: 'a', namespace: 'b', source: 'a', target: 'b' });
  });

  it('records the pair the id was rendered from', () => {
    const [wide] = longToWide([legend('a-->b', { cluster: 'a', namespace: 'b' })]);

    expect(wide.meta?.custom?.graph).toEqual({ sourceKey: 'cluster', targetKey: 'namespace' });
  });

  it('still declines a series that carries neither labels nor an id', () => {
    expect(isLongEdgesFrame(legend('just a name', { job: 'api' }))).toBe(false);
    expect(isLongEdgesFrame(series({ job: 'api' }, [1]))).toBe(false);
  });

  // A TestData `alias` lands on the frame rather than on the field, and is the same carrier.
  it('reads a frame name as the id too', () => {
    const [wide] = longToWide([series({ cluster: 'a', namespace: 'b' }, [1], { name: 'a-->b' })]);

    expect(wide.fields.map((field) => field.name)).toEqual(['Time', 'a-->b']);
  });

  // The endpoints are `a-->b` and `c`, not `a` and `b-->c`: the labels say so.
  it('splits a multi-separator id where the labels agree', () => {
    const [wide] = longToWide([legend('a-->b-->c', { src_group: 'a-->b', dst_group: 'c' })]);

    expect(wide.fields[1].labels).toEqual({ src_group: 'a-->b', dst_group: 'c', source: 'a-->b', target: 'c' });
  });
});

describe('longToWide — recovered endpoint labels', () => {
  it('declares a pair recovered from a response that kept its originals', () => {
    const [wide] = longToWide([
      series({ source: 'prod', target: 'ns-a', cluster: 'prod', namespace: 'ns-a' }, [1]),
      series({ source: 'prod', target: 'ns-b', cluster: 'prod', namespace: 'ns-b' }, [2]),
    ]);

    expect(wide.meta?.custom?.graph).toEqual({ sourceKey: 'cluster', targetKey: 'namespace' });
  });

  it('declares nothing when two levels recover different pairs', () => {
    const [wide] = longToWide([
      series({ source: 'prod', target: 'ns-a', cluster: 'prod', namespace: 'ns-a' }, [1]),
      series({ source: 'ns-a', target: 'checkout', namespace: 'ns-a', workload: 'checkout' }, [2]),
    ]);

    expect(wide.meta?.custom?.graph).toBeUndefined();
  });

  it('carries the originals through so the reader can answer per edge', () => {
    const data = graphData(
      frameToRelationsGraph(
        longToWide([
          series({ source: 'prod', target: 'ns-a', cluster: 'prod', namespace: 'ns-a' }, [1]),
          series({ source: 'ns-a', target: 'checkout', namespace: 'ns-a', workload: 'checkout' }, [2]),
        ]),
        createTheme()
      )
    );

    expect(data.links.map((link) => link.filterLabels)).toEqual([
      { source: 'cluster', target: 'namespace' },
      { source: 'namespace', target: 'workload' },
    ]);
  });

  // A read pair is not a recovery and outranks one.
  it('prefers the pair the series were labelled with', () => {
    const [wide] = longToWide([series({ client: 'a', server: 'b', cluster: 'a', namespace: 'b' }, [1])]);

    expect(wide.meta?.custom?.graph).toEqual({ sourceKey: 'client', targetKey: 'server' });
  });
});

describe('longToWide — the row dimension', () => {
  it('keeps a ranged query rows, so calcs[0] has something to reduce', () => {
    const [wide] = longToWide(edges());

    expect(wide.length).toBe(2);
    expect(wide.fields[0].values).toEqual([T0, T1]);
    expect(wide.fields[1].values).toEqual([10, 12]);
    expect(wide.fields[3].values).toEqual([30, 32]);
  });

  it('comes out one row for an instant query', () => {
    const [wide] = longToWide([series({ source: 'a', target: 'b' }, [7])]);

    expect(wide.length).toBe(1);
    expect(wide.fields[1].values).toEqual([7]);
  });

  it('outer-joins mismatched timestamps and nulls the gaps', () => {
    const [wide] = longToWide([
      series({ source: 'a', target: 'b' }, [10, 12], { times: [T0, T1] }),
      series({ source: 'b', target: 'c' }, [20], { times: [T1] }),
    ]);

    expect(wide.fields[0].values).toEqual([T0, T1]);
    expect(wide.fields[1].values).toEqual([10, 12]);
    // A missing scrape is not a zero.
    expect(wide.fields[2].values).toEqual([null, 20]);
  });

  it('names the row dimension after the column it came from', () => {
    const frame = toDataFrame({
      fields: [
        { name: 'timestamp', type: FieldType.time, values: [T0] },
        { name: 'Value', type: FieldType.number, labels: { source: 'a', target: 'b' }, values: [1] },
      ],
    });

    expect(longToWide([frame])[0].fields[0].name).toBe('timestamp');
  });
});

describe('longToWide — identity', () => {
  it('prefers a rendered legend format, which is where a datasource puts the id', () => {
    const [wide] = longToWide([
      series({ source: 'a', target: 'b' }, [1], { config: { displayNameFromDS: 'gateway to api' } }),
    ]);

    expect(wide.fields[1].name).toBe('gateway to api');
    // Endpoints still come from the labels, so the id is never parsed for topology.
    expect(wide.fields[1].labels).toEqual({ source: 'a', target: 'b' });
  });

  it('prefers a frame name, which is what the documented join renamed fields to', () => {
    const [wide] = longToWide([series({ source: 'gateway', target: 'api' }, [1], { name: 'gateway->api (http)' })]);

    expect(wide.fields[1].name).toBe('gateway->api (http)');
  });

  it('ignores a frame name that is only the label set', () => {
    const [wide] = longToWide([series({ source: 'a', target: 'b' }, [1], { name: '{source="a", target="b"}' })]);

    expect(wide.fields[1].name).toBe('a-->b');
  });

  it('discriminates parallel edges by the label that distinguishes them', () => {
    const [wide] = longToWide([
      series({ source: 'a', target: 'b', protocol: 'http' }, [1]),
      series({ source: 'a', target: 'b', protocol: 'grpc' }, [2]),
    ]);

    expect(wide.fields.map((field) => field.name)).toEqual([
      'Time',
      'a-->b {protocol="http"}',
      'a-->b {protocol="grpc"}',
    ]);
    expect(wide.fields[2].labels).toEqual({ source: 'a', target: 'b', protocol: 'grpc' });
  });

  it('leaves an uncontested id alone even when the series carries other labels', () => {
    const [wide] = longToWide([
      series({ source: 'a', target: 'b', protocol: 'http' }, [1]),
      series({ source: 'b', target: 'c', protocol: 'grpc' }, [2]),
    ]);

    expect(wide.fields.map((field) => field.name)).toEqual(['Time', 'a-->b', 'b-->c']);
  });

  it('falls back to a counter for series that are genuinely indistinguishable', () => {
    const [wide] = longToWide([series({ source: 'a', target: 'b' }, [1]), series({ source: 'a', target: 'b' }, [2])]);

    expect(wide.fields.map((field) => field.name)).toEqual(['Time', 'a-->b', 'a-->b #2']);
  });
});

describe('longToWide — config', () => {
  it('carries the field config of each series onto its mark', () => {
    const [wide] = longToWide([
      series({ source: 'a', target: 'b' }, [1], { config: { unit: 'reqps', decimals: 2 } }),
      series({ source: 'b', target: 'c' }, [2], {
        config: { unit: 'ms', color: { mode: 'fixed', fixedColor: '#ff0000' }, custom: { lineWidth: 4 } },
      }),
    ]);

    expect(wide.fields[1].config.unit).toBe('reqps');
    expect(wide.fields[1].config.decimals).toBe(2);
    expect(wide.fields[2].config.unit).toBe('ms');
    expect(wide.fields[2].config.color).toEqual({ mode: 'fixed', fixedColor: '#ff0000' });
    expect(wide.fields[2].config.custom).toEqual({ lineWidth: 4 });
  });

  it('does not share config objects with the input frames', () => {
    const input = [series({ source: 'a', target: 'b' }, [1], { config: { unit: 'ms' } })];
    const [wide] = longToWide(input);

    expect(wide.fields[1].config).not.toBe(input[0].fields[1].config);
  });
});

describe('longToWide — detection', () => {
  it('claims a labelled series with a row dimension', () => {
    expect(isLongEdgesFrame(edges()[0])).toBe(true);
    expect(isLongGraphFrames(edges())).toBe(true);
  });

  it('declines a series with only one endpoint label — a node stat, not an edge', () => {
    const nodeStat = series({ server: 'b' }, [1]);

    expect(isLongEdgesFrame(nodeStat)).toBe(false);
    expect(isLongGraphFrames([nodeStat])).toBe(false);
  });

  it('declines a plain time series', () => {
    const frame = toDataFrame({
      fields: [
        { name: 'Time', type: FieldType.time, values: [T0] },
        { name: 'Value', type: FieldType.number, values: [1] },
      ],
    });

    expect(isLongEdgesFrame(frame)).toBe(false);
    expect(longToWide([frame])[0]).toBe(frame);
  });

  it('declines a frame that declares a wide kind, however its fields look', () => {
    for (const type of [GRAPH_EDGES_WIDE, GRAPH_NODES_WIDE]) {
      const declared = toDataFrame({
        meta: { type },
        fields: [
          { name: 'Time', type: FieldType.time, values: [T0] },
          { name: 'Value', type: FieldType.number, labels: { source: 'a', target: 'b' }, values: [1] },
        ],
      });

      expect(isLongEdgesFrame(declared)).toBe(false);
    }
  });

  it('declines a static wide table, which has no row dimension', () => {
    const table = toDataFrame({
      fields: [{ name: 'e1', type: FieldType.number, labels: { source: 'a', target: 'b' }, values: [1] }],
    });

    expect(isLongEdgesFrame(table)).toBe(false);
  });

  it('declines a frame that is already one field per edge', () => {
    const wide = toDataFrame({
      fields: [
        { name: 'Time', type: FieldType.time, values: [T0] },
        { name: 'e1', type: FieldType.number, labels: { source: 'a', target: 'b' }, values: [1] },
        { name: 'e2', type: FieldType.number, labels: { source: 'b', target: 'c' }, values: [2] },
      ],
    });

    expect(isLongEdgesFrame(wide)).toBe(false);
    expect(isLongGraphFrames([wide])).toBe(false);
  });

  it('declines a single-edge frame whose field name is already an edge id', () => {
    const wide = toDataFrame({
      fields: [
        { name: 'Time', type: FieldType.time, values: [T0] },
        { name: 'a-->b', type: FieldType.number, labels: { source: 'a', target: 'b' }, values: [1] },
      ],
    });

    expect(isLongEdgesFrame(wide)).toBe(false);
  });

  it('declines a row-format response, which is the other converter job', () => {
    const rows = toDataFrame({
      fields: [
        { name: 'id', type: FieldType.string, values: ['e1'] },
        { name: 'source', type: FieldType.string, values: ['a'] },
        { name: 'target', type: FieldType.string, values: ['b'] },
        { name: 'mainstat', type: FieldType.number, values: [10] },
      ],
    });

    expect(isLongEdgesFrame(rows)).toBe(false);
    expect(isLongGraphFrames([rows])).toBe(false);
  });

  it('declines the whole response when something else is already the edges frame', () => {
    const declared = toDataFrame({
      meta: { type: GRAPH_EDGES_WIDE },
      fields: [{ name: 'e1', type: FieldType.number, labels: { source: 'a', target: 'b' }, values: [1] }],
    });
    const frames = [declared, series({ source: 'c', target: 'd' }, [1])];

    expect(isLongGraphFrames(frames)).toBe(false);
    expect(longToWide(frames)).toBe(frames);
  });
});

describe('longToWide — pass-through', () => {
  it('returns the same array when there is nothing to pivot', () => {
    const frames = [
      toDataFrame({
        fields: [
          { name: 'Time', type: FieldType.time, values: [T0] },
          { name: 'Value', type: FieldType.number, values: [1] },
        ],
      }),
    ];

    expect(longToWide(frames)).toBe(frames);
  });

  it('returns the same array when the frames are already wide', () => {
    const frames = longToWide(edges());

    expect(longToWide(frames)).toBe(frames);
  });

  it('leaves unrelated frames identity-intact, in place, alongside the pivot', () => {
    const unrelated = toDataFrame({
      name: 'cpu',
      fields: [
        { name: 'Time', type: FieldType.time, values: [T0] },
        { name: 'Value', type: FieldType.number, values: [1] },
      ],
    });
    const out = longToWide([unrelated, ...edges()]);

    expect(out).toHaveLength(2);
    expect(out[0]).toBe(unrelated);
    expect(out[1].meta?.type).toBe(GRAPH_EDGES_WIDE);
  });

  it('handles an empty response', () => {
    const frames: DataFrame[] = [];

    expect(longToWide(frames)).toBe(frames);
  });
});

describe('longToWide — diagnostics', () => {
  it('notes the pivot at info level, with the edge count that would otherwise be lost', () => {
    longToWide(edges());

    expect(logged(LOG_LEVELS.info)).toEqual([expect.stringContaining('pivoted 3 long graph series')]);
    expect(logged(LOG_LEVELS.warn)).toEqual([]);
  });

  it('warns when it renames the only mark in the response', () => {
    const wideLookalike = toDataFrame({
      fields: [
        { name: 'Time', type: FieldType.time, values: [T0] },
        { name: 'gateway to api', type: FieldType.number, labels: { source: 'a', target: 'b' }, values: [1] },
      ],
    });

    expect(longToWide([wideLookalike])[0].fields[1].name).toBe('a-->b');
    expect(logged(LOG_LEVELS.warn)).toEqual([expect.stringContaining('renamed its edge "gateway to api"')]);
  });

  it('stays quiet when the renamed field was only a datasource value column', () => {
    // `Value` and `Value #A` carry no id, so there is nothing to have lost.
    longToWide([series({ source: 'a', target: 'b' }, [1])]);

    expect(logged(LOG_LEVELS.warn)).toEqual([]);
  });

  it('stays quiet for a multi-series response, which is unambiguously long', () => {
    const named = (name: string, source: string, target: string): DataFrame =>
      toDataFrame({
        fields: [
          { name: 'Time', type: FieldType.time, values: [T0] },
          { name, type: FieldType.number, labels: { source, target }, values: [1] },
        ],
      });

    longToWide([named('one', 'a', 'b'), named('two', 'b', 'c')]);

    expect(logged(LOG_LEVELS.warn)).toEqual([]);
  });
});

describe('longToWideOperator', () => {
  it('pivots through the rx pipeline the host runs it in', async () => {
    const ctx = { interpolate: (value: string) => value };
    const out = await lastValueFrom(of(edges()).pipe(longToWideOperator(ctx)));

    expect(out).toHaveLength(1);
    expect(out[0].fields.map((field) => field.name)).toEqual(['Time', 'a-->b', 'b-->c', 'a-->c']);
    expect(out[0].meta?.type).toBe(GRAPH_EDGES_WIDE);
  });
});
