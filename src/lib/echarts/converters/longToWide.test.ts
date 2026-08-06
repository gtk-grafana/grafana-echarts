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
import { GRAPH_EDGES_WIDE, GRAPH_NODES_WIDE } from 'lib/echarts/converters/graphWide';
import { isLongEdgesFrame, isLongGraphFrames, longToWide, longToWideOperator } from 'lib/echarts/converters/longToWide';
import { frameToRelationsGraph } from 'lib/echarts/converters/relationsGraph';

// `debug` is gated on `NODE_ENV`/`CI`/localStorage, so asserting on the console directly
// would pass locally and go quiet in CI. Mocking the module tests the *decision* to warn.
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

const T0 = 1700000000000;
const T1 = T0 + 300000;

/**
 * One frame of a long response, byte-for-byte what a labelled datasource returns for
 * `sum by (source, target) (…)` in `Format: Time series`: `meta.type: timeseries-multi`,
 * a `Time` column, and a single `Value` field carrying the grouping labels.
 */
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
    // The leading field is the row dimension; the marks follow.
    expect(out[0].fields.map((field) => field.name)).toEqual(['Time', 'a-->b', 'b-->c', 'a-->c']);
    expect(out[0].fields.slice(1).map((field) => field.type)).toEqual([
      FieldType.number,
      FieldType.number,
      FieldType.number,
    ]);
  });

  /**
   * What the pivot buys, in the model the panel actually reads: every edge arrives with its
   * **own** id, so each one is a `byName` override target, a legend entry and a tooltip
   * title of its own.
   *
   * Deliberately says nothing about how the reader treats a *raw* multi-frame response —
   * that it collects all of them is the reader's own contract, asserted in
   * `graphWide.test.ts`. The pivot's job is identity either way: N frames whose value field
   * is called `Value` are N marks sharing one name, and no override can address them.
   */
  it('gives every edge its own id in the model the panel reads', () => {
    const data = frameToRelationsGraph(longToWide(edges()), createTheme());

    expect(data?.links.map((link) => link.id)).toEqual(['a-->b', 'b-->c', 'a-->c']);
    expect(data?.links.map((link) => [link.source, link.target])).toEqual([
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

  /**
   * `refId` and `meta` describe the query every series shares, so they carry over. The
   * frame *name* cannot: one series' legend is not the name of a frame holding all of them.
   */
  it('carries the query identity over but not one series name', () => {
    const [wide] = longToWide([series({ source: 'a', target: 'b' }, [1], { name: 'a-->b' })]);

    expect(wide.refId).toBe('A');
    expect(wide.name).toBeUndefined();
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

  /**
   * Prometheus aligns a range query to one step grid, but a series with a gap has fewer
   * points than its siblings. Index-aligning the columns would put a mark's values on rows
   * belonging to another mark.
   */
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

  /**
   * The parity case with the route this replaces: `joinByField` renamed each `Value` field
   * to its frame name, so a dashboard whose overrides target those names keeps working.
   */
  it('prefers a frame name, which is what the documented join renamed fields to', () => {
    const [wide] = longToWide([series({ source: 'gateway', target: 'api' }, [1], { name: 'gateway->api (http)' })]);

    expect(wide.fields[1].name).toBe('gateway->api (http)');
  });

  /**
   * Without a legend format Prometheus names the frame after the series' own label set,
   * which is no id anybody would write an override against — and is why the acceptance
   * query needs no legend format at all.
   */
  it('ignores a frame name that is only the label set', () => {
    const [wide] = longToWide([series({ source: 'a', target: 'b' }, [1], { name: '{source="a", target="b"}' })]);

    expect(wide.fields[1].name).toBe('a-->b');
  });

  /**
   * Parallel edges: two marks over one node pair, separated only by a third label. Two
   * fields with one name would be silent mark loss — `byName` matches both. **Every**
   * member of the clash is discriminated, not just the later one, so the pair reads as a
   * pair rather than as an edge plus an anomaly.
   */
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

  /**
   * The `csv_content` / SQL / `rowsToFields` route: no time column, one mark per field
   * already. Claiming it would rename marks that have real ids, and `meta` does not
   * survive those paths, so shape is all there is to go on.
   */
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

  /**
   * A declared edges frame *is* the edges frame; a labelled series beside it is a second
   * query. Pivoting it would mint a rival edges frame — a second set of ids over the same
   * topology — which is how two converters end up disagreeing about one response. The
   * reader agrees from the other side: declared frames win as a *filter*, so this response
   * renders exactly the declared frame's edges.
   */
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

    // A custom operator bypasses `config.filter`, so it must return what it does not own
    // unchanged — by reference, so field-override memoisation still short-circuits.
    expect(out).toHaveLength(2);
    expect(out[0]).toBe(unrelated);
    expect(out[1].meta?.type).toBe(GRAPH_EDGES_WIDE);
  });

  it('handles an empty response', () => {
    const frames: DataFrame[] = [];

    expect(longToWide(frames)).toBe(frames);
  });
});

/**
 * The conversion is invisible — no Transform tab entry, no off switch — so what it did has
 * to be legible somewhere. `development.ts` suppresses info by default and shows warn in a
 * dev build, which is the split these two want.
 */
describe('longToWide — diagnostics', () => {
  it('notes the pivot at info level, with the edge count that would otherwise be lost', () => {
    longToWide(edges());

    expect(logged(LOG_LEVELS.info)).toEqual([expect.stringContaining('pivoted 3 long graph series')]);
    expect(logged(LOG_LEVELS.warn)).toEqual([]);
  });

  /**
   * The inherent ambiguity: one long series and one single-edge wide frame with a row
   * dimension are the same shape. Renaming the edge breaks a `byName` override on the old
   * id, so it cannot be silent — and cannot be an error either, since for a real
   * single-series query the conversion is right.
   */
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
