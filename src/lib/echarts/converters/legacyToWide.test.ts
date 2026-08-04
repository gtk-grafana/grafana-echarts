import { type DataFrame, FieldType, toDataFrame } from '@grafana/data';
import { lastValueFrom, of } from 'rxjs';

import { GRAPH_EDGES_WIDE, GRAPH_NODES_WIDE } from 'lib/echarts/converters/graphWide';
import { legacyToWide, legacyToWideOperator } from 'lib/echarts/converters/legacyToWide';

const edgesFrame = (): DataFrame =>
  toDataFrame({
    name: 'edges',
    refId: 'edges',
    fields: [
      { name: 'id', type: FieldType.string, values: ['e1', 'e2'] },
      { name: 'source', type: FieldType.string, values: ['a', 'b'] },
      { name: 'target', type: FieldType.string, values: ['b', 'c'] },
      { name: 'mainstat', type: FieldType.number, values: [10, 20], config: { unit: 'ms', decimals: 1 } },
    ],
  });

const nodesFrame = (): DataFrame =>
  toDataFrame({
    name: 'nodes',
    refId: 'nodes',
    fields: [
      { name: 'id', type: FieldType.string, values: ['a', 'b'] },
      { name: 'title', type: FieldType.string, values: ['Gateway', 'API'] },
      { name: 'subtitle', type: FieldType.string, values: ['edge', 'svc'] },
      { name: 'mainstat', type: FieldType.number, values: [1, 2] },
    ],
  });

describe('legacyToWide — edges', () => {
  it('makes one numeric field per edge, named by id, with endpoints in labels', () => {
    const [edges] = legacyToWide([edgesFrame()]);

    expect(edges.fields.map((field) => field.name)).toEqual(['e1', 'e2']);
    expect(edges.fields.map((field) => field.type)).toEqual([FieldType.number, FieldType.number]);
    expect(edges.fields[0].labels).toEqual({ source: 'a', target: 'b' });
    expect(edges.fields[1].labels).toEqual({ source: 'b', target: 'c' });
    // The mark's value is its weight, over a single (instant) row.
    expect(edges.fields.map((field) => field.values[0])).toEqual([10, 20]);
    expect(edges.length).toBe(1);
  });

  it('falls back to a `-->` name when the edge has no id', () => {
    const frame = toDataFrame({
      fields: [
        { name: 'source', type: FieldType.string, values: ['a'] },
        { name: 'target', type: FieldType.string, values: ['b'] },
        { name: 'mainstat', type: FieldType.number, values: [7] },
      ],
    });

    expect(legacyToWide([frame])[0].fields[0].name).toBe('a-->b');
  });

  it('carries the stat column formatting onto every mark', () => {
    const [edges] = legacyToWide([edgesFrame()]);

    for (const field of edges.fields) {
      expect(field.config.unit).toBe('ms');
      expect(field.config.decimals).toBe(1);
    }
  });

  it('maps thickness, colour and strokedasharray onto per-edge config', () => {
    const frame = toDataFrame({
      fields: [
        { name: 'source', type: FieldType.string, values: ['a', 'b'] },
        { name: 'target', type: FieldType.string, values: ['b', 'c'] },
        { name: 'mainstat', type: FieldType.number, values: [1, 2] },
        { name: 'thickness', type: FieldType.number, values: [3, 9] },
        { name: 'color', type: FieldType.string, values: ['#ff0000', ''] },
        { name: 'strokedasharray', type: FieldType.string, values: ['1 1', '10 4'] },
      ],
    });

    const [edges] = legacyToWide([frame]);

    expect(edges.fields[0].config.custom).toEqual({ lineWidth: 3, lineType: 'dotted' });
    expect(edges.fields[0].config.color).toEqual({ mode: 'fixed', fixedColor: '#ff0000' });
    expect(edges.fields[1].config.custom).toEqual({ lineWidth: 9, lineType: 'dashed' });
    // An empty `color` cell is not a colour.
    expect(edges.fields[1].config.color).toBeUndefined();
  });

  it('uses thickness as the weight only when mainstat is absent', () => {
    const frame = toDataFrame({
      fields: [
        { name: 'source', type: FieldType.string, values: ['a'] },
        { name: 'target', type: FieldType.string, values: ['b'] },
        { name: 'thickness', type: FieldType.number, values: [4] },
      ],
    });

    expect(legacyToWide([frame])[0].fields[0].values[0]).toBe(4);
  });

  it('drops an edge missing either endpoint', () => {
    const frame = toDataFrame({
      fields: [
        { name: 'source', type: FieldType.string, values: ['a', null] },
        { name: 'target', type: FieldType.string, values: ['b', 'c'] },
        { name: 'mainstat', type: FieldType.number, values: [1, 2] },
      ],
    });

    expect(legacyToWide([frame])[0].fields.map((field) => field.name)).toEqual(['a-->b']);
  });

  it('folds detail__* columns into labels alongside the endpoints', () => {
    const frame = toDataFrame({
      fields: [
        { name: 'id', type: FieldType.string, values: ['e1'] },
        { name: 'source', type: FieldType.string, values: ['a'] },
        { name: 'target', type: FieldType.string, values: ['b'] },
        { name: 'mainstat', type: FieldType.number, values: [1] },
        { name: 'detail__env', type: FieldType.string, values: ['prod'] },
      ],
    });

    expect(legacyToWide([frame])[0].fields[0].labels).toEqual({ source: 'a', target: 'b', env: 'prod' });
  });

  it('stamps the wide kind and its type version', () => {
    const [edges] = legacyToWide([edgesFrame()]);

    expect(edges.meta?.type).toBe(GRAPH_EDGES_WIDE);
    expect(edges.meta?.typeVersion).toEqual([0, 1]);
  });
});

describe('legacyToWide — nodes', () => {
  it('makes one numeric field per node, named by id, titled by displayName', () => {
    const [, nodes] = legacyToWide([edgesFrame(), nodesFrame()]);

    expect(nodes.fields.map((field) => field.name)).toEqual(['a', 'b']);
    expect(nodes.fields.map((field) => field.config.displayName)).toEqual(['Gateway', 'API']);
    expect(nodes.fields.map((field) => field.values[0])).toEqual([1, 2]);
    expect(nodes.meta?.type).toBe(GRAPH_NODES_WIDE);
  });

  it('maps subtitle, icon, noderadius and fixed positions onto custom config', () => {
    const frame = toDataFrame({
      fields: [
        { name: 'id', type: FieldType.string, values: ['a'] },
        { name: 'mainstat', type: FieldType.number, values: [1] },
        { name: 'subtitle', type: FieldType.string, values: ['edge'] },
        { name: 'icon', type: FieldType.string, values: ['database'] },
        { name: 'noderadius', type: FieldType.number, values: [40] },
        { name: 'fixedx', type: FieldType.number, values: [5] },
        { name: 'fixedy', type: FieldType.number, values: [6] },
      ],
    });

    // Needs an edges frame alongside it, else the frame is not a graph at all.
    const [, nodes] = legacyToWide([edgesFrame(), frame]);

    expect(nodes.fields[0].config.custom).toEqual({
      subtitle: 'edge',
      icon: 'database',
      nodeRadius: 40,
      fixedX: 5,
      fixedY: 6,
    });
  });

  it('carries secondarystat as a label, since instant data has no second reducer', () => {
    const frame = toDataFrame({
      fields: [
        { name: 'id', type: FieldType.string, values: ['a'] },
        { name: 'mainstat', type: FieldType.number, values: [1] },
        { name: 'secondarystat', type: FieldType.string, values: ['12 req/s'] },
      ],
    });

    const [, nodes] = legacyToWide([edgesFrame(), frame]);

    expect(nodes.fields[0].labels).toEqual({ secondarystat: '12 req/s' });
  });
});

describe('legacyToWide — pass-through', () => {
  it('returns the same array when there is no graph to convert', () => {
    const frames = [
      toDataFrame({
        fields: [
          { name: 'time', type: FieldType.time, values: [1] },
          { name: 'value', type: FieldType.number, values: [2] },
        ],
      }),
    ];

    expect(legacyToWide(frames)).toBe(frames);
  });

  it('returns the same array when the frames are already wide', () => {
    const frames = legacyToWide([edgesFrame()]);

    expect(legacyToWide(frames)).toBe(frames);
  });

  it('leaves unrelated frames identity-intact when converting alongside them', () => {
    const unrelated = toDataFrame({
      fields: [{ name: 'value', type: FieldType.number, values: [1] }],
    });
    const out = legacyToWide([edgesFrame(), unrelated]);

    // A custom operator bypasses `config.filter`, so it must return what it does not
    // own unchanged — by reference, so field-override memoisation still short-circuits.
    expect(out[1]).toBe(unrelated);
  });

  it('handles an empty response', () => {
    const frames: DataFrame[] = [];
    expect(legacyToWide(frames)).toBe(frames);
  });
});

describe('legacyToWideOperator', () => {
  it('converts through the rx pipeline the host runs it in', async () => {
    const ctx = { interpolate: (value: string) => value };
    const out = await lastValueFrom(of([edgesFrame()]).pipe(legacyToWideOperator(ctx)));

    expect(out[0].fields.map((field) => field.name)).toEqual(['e1', 'e2']);
    expect(out[0].meta?.type).toBe(GRAPH_EDGES_WIDE);
  });
});
