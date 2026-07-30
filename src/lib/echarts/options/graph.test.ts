import { createTheme, FieldColorModeId, type FieldConfigSource, FieldType, toDataFrame } from '@grafana/data';
import { type RelationsChartContext } from 'lib/echarts/charts/types';
import { type NodeGraphData } from 'lib/echarts/converters/nodeGraph';
import {
  ARC_BORDER_WIDTH,
  getGraphEdgeSymbol,
  getGraphEmphasis,
  getGraphForce,
  getGraphLabel,
  getGraphLayout,
  getGraphLinkStyle,
  getGraphSeries,
  makeRelationsColorResolver,
  RELATIONS_NODE_SIZE_DEFAULT,
} from 'lib/echarts/options/graph';
import { type PanelOptions } from 'types';

const theme = createTheme();
const emptyFieldConfig: FieldConfigSource = { defaults: {}, overrides: [] };

const baseOptions = (extra: Partial<PanelOptions> = {}): PanelOptions =>
  ({
    legend: { showLegend: true, displayMode: 'list', placement: 'bottom', calcs: [] },
    tooltip: { mode: 'single' },
    ...extra,
  }) as PanelOptions;

const ctx = (options: PanelOptions = baseOptions()): RelationsChartContext =>
  ({
    frames: [],
    theme,
    timeZone: 'utc',
    timeRange: {} as RelationsChartContext['timeRange'],
    options,
    seriesType: 'graph',
    formatValue: (value: unknown) => ({ text: String(value) }),
    fieldConfig: emptyFieldConfig,
    replaceVariables: (value: string) => value,
  }) as unknown as RelationsChartContext;

const data = (extra: Partial<NodeGraphData> = {}): NodeGraphData => ({
  nodes: [
    { id: 'a', name: 'A', value: 1 },
    { id: 'b', name: 'B', value: 2 },
  ],
  links: [{ id: 'e1', source: 'a', target: 'b', value: 5 }],
  ...extra,
});

describe('getGraphLayout', () => {
  it('defaults to force', () => {
    expect(getGraphLayout(data(), baseOptions())).toBe('force');
  });

  it('honors an explicit layout option', () => {
    expect(getGraphLayout(data(), baseOptions({ relationsLayout: 'circular' }))).toBe('circular');
  });

  it('uses none when every node pins fixedx/fixedy', () => {
    const pinned = data({
      nodes: [
        { id: 'a', name: 'A', value: 1, fixedX: 0, fixedY: 0 },
        { id: 'b', name: 'B', value: 2, fixedX: 10, fixedY: 10 },
      ],
    });
    expect(getGraphLayout(pinned, baseOptions())).toBe('none');
  });

  it('stays on force when only some nodes pin coordinates', () => {
    // The node-graph spec is all-or-nothing: "If used, all nodes must provide a value".
    const partial = data({
      nodes: [
        { id: 'a', name: 'A', value: 1, fixedX: 0, fixedY: 0 },
        { id: 'b', name: 'B', value: 2 },
      ],
    });
    expect(getGraphLayout(partial, baseOptions())).toBe('force');
  });

  it('an explicit layout still wins over pinned coordinates', () => {
    const pinned = data({ nodes: [{ id: 'a', name: 'A', value: 1, fixedX: 0, fixedY: 0 }] });
    expect(getGraphLayout(pinned, baseOptions({ relationsLayout: 'force' }))).toBe('force');
  });
});

describe('getGraphForce', () => {
  it('is undefined when nothing is overridden, so the key is omitted', () => {
    expect(getGraphForce(baseOptions())).toBeUndefined();
  });

  it('includes only the overridden knobs', () => {
    expect(getGraphForce(baseOptions({ relationsRepulsion: 200 }))).toEqual({ repulsion: 200 });
    expect(
      getGraphForce(baseOptions({ relationsRepulsion: 200, relationsGravity: 0.2, relationsEdgeLength: 40 }))
    ).toEqual({ repulsion: 200, gravity: 0.2, edgeLength: 40 });
  });
});

describe('getGraphEdgeSymbol / getGraphEmphasis', () => {
  it('omit their keys at the default (off)', () => {
    expect(getGraphEdgeSymbol(baseOptions())).toBeUndefined();
    expect(getGraphEmphasis(baseOptions())).toBeUndefined();
  });

  it('emit an arrow at the target end when enabled', () => {
    expect(getGraphEdgeSymbol(baseOptions({ relationsEdgeArrows: true }))).toEqual(['none', 'arrow']);
  });

  it('focus adjacency when enabled', () => {
    expect(getGraphEmphasis(baseOptions({ relationsFocusAdjacency: true }))).toEqual({ focus: 'adjacency' });
  });
});

describe('getGraphLinkStyle', () => {
  it('defaults to inheriting the source node color and omits curveness', () => {
    const style = getGraphLinkStyle(baseOptions());
    expect(style).toEqual({ color: 'source' });
    expect(style).not.toHaveProperty('curveness');
  });

  it('honors the link color mode', () => {
    expect(getGraphLinkStyle(baseOptions({ relationsLinkColor: 'gradient' })).color).toBe('gradient');
  });

  it('omits curveness at 0 but emits it above', () => {
    expect(getGraphLinkStyle(baseOptions({ relationsCurveness: 0 }))).not.toHaveProperty('curveness');
    expect(getGraphLinkStyle(baseOptions({ relationsCurveness: 0.3 })).curveness).toBe(0.3);
  });
});

describe('getGraphLabel', () => {
  it('shows labels by default', () => {
    expect(getGraphLabel(ctx())).toMatchObject({ show: true, position: 'bottom' });
  });

  it('hides labels when switched off', () => {
    expect(getGraphLabel(ctx(baseOptions({ relationsShowNodeLabels: false })))).toEqual({ show: false });
  });
});

describe('makeRelationsColorResolver', () => {
  it('uses the classic palette by position when nothing else applies', () => {
    const resolve = makeRelationsColorResolver(theme, emptyFieldConfig);
    expect(resolve({ id: 'a', name: 'A', value: 1 }, 0)).toEqual(expect.any(String));
    // Distinct per index — the categorical default.
    expect(resolve({ id: 'a', name: 'A', value: 1 }, 0)).not.toBe(resolve({ id: 'b', name: 'B', value: 2 }, 1));
  });

  it("prefers the node's own color field over the palette", () => {
    const resolve = makeRelationsColorResolver(theme, emptyFieldConfig);
    expect(resolve({ id: 'a', name: 'A', value: 1, color: 'cyan' }, 0)).toBe('cyan');
  });

  it('lets a byName fixed-color override win over the node color', () => {
    const fieldConfig: FieldConfigSource = {
      defaults: {},
      overrides: [
        {
          matcher: { id: 'byName', options: 'A' },
          properties: [{ id: 'color', value: { mode: FieldColorModeId.Fixed, fixedColor: 'purple' } }],
        },
      ],
    };
    const resolve = makeRelationsColorResolver(theme, fieldConfig);
    expect(resolve({ id: 'a', name: 'A', value: 1, color: 'cyan' }, 0)).toBe('purple');
  });

  it('colors from the value field when a by-value scheme is configured', () => {
    const frame = toDataFrame({
      fields: [
        {
          name: 'mainstat',
          type: FieldType.number,
          values: [1, 100],
          config: { color: { mode: FieldColorModeId.ContinuousGrYlRd } },
        },
      ],
    });
    const valueField = frame.fields[0];
    const resolve = makeRelationsColorResolver(theme, emptyFieldConfig, valueField);
    // Different values map to different points on the gradient.
    expect(resolve({ id: 'a', name: 'A', value: 1 }, 0)).not.toBe(resolve({ id: 'b', name: 'B', value: 100 }, 1));
  });

  it('treats an unset color mode as the classic palette, not by-value', () => {
    // Grafana's own default mode is by-value (thresholds), but the panel registers
    // PaletteClassic, so "unset" must stay categorical.
    const frame = toDataFrame({
      fields: [{ name: 'mainstat', type: FieldType.number, values: [1, 2] }],
    });
    const resolve = makeRelationsColorResolver(theme, emptyFieldConfig, frame.fields[0]);
    const paletteResolve = makeRelationsColorResolver(theme, emptyFieldConfig);
    expect(resolve({ id: 'a', name: 'A', value: 1 }, 0)).toBe(paletteResolve({ id: 'a', name: 'A', value: 1 }, 0));
  });
});

describe('getGraphSeries', () => {
  it('maps nodes to data and links to links, keyed by id', () => {
    const series = getGraphSeries(data(), ctx());
    expect(series.type).toBe('graph');
    // `id` pins ECharts' link resolution; `name` carries the display title.
    expect(series.data).toMatchObject([
      { id: 'a', name: 'A', value: 1, symbolSize: RELATIONS_NODE_SIZE_DEFAULT },
      { id: 'b', name: 'B', value: 2, symbolSize: RELATIONS_NODE_SIZE_DEFAULT },
    ]);
    expect(series.links).toMatchObject([{ source: 'a', target: 'b', value: 5 }]);
  });

  it('lets noderadius win over the panel-level node size', () => {
    const withRadius = data({ nodes: [{ id: 'a', name: 'A', value: 1, radius: 42 }] });
    const series = getGraphSeries(withRadius, ctx(baseOptions({ relationsNodeSize: 8 })));
    expect(series.data).toMatchObject([{ symbolSize: 42 }]);
  });

  it('applies the panel node size to nodes without a radius', () => {
    const series = getGraphSeries(data(), ctx(baseOptions({ relationsNodeSize: 8 })));
    expect(series.data).toMatchObject([{ symbolSize: 8 }, { symbolSize: 8 }]);
  });

  it('emits x/y only for pinned nodes', () => {
    const pinned = data({
      nodes: [
        { id: 'a', name: 'A', value: 1, fixedX: 5, fixedY: 6 },
        { id: 'b', name: 'B', value: 2 },
      ],
    });
    const series = getGraphSeries(pinned, ctx());
    expect(series.data![0]).toMatchObject({ x: 5, y: 6 });
    expect(series.data![1]).not.toHaveProperty('x');
  });

  it('maps a per-edge color, width and dash array onto the link item', () => {
    const styled = data({
      links: [{ id: 'e1', source: 'a', target: 'b', value: 1, color: 'cyan', width: 3, dashArray: '5 5' }],
    });
    const series = getGraphSeries(styled, ctx());
    expect(series.links).toMatchObject([{ lineStyle: { color: 'cyan', width: 3, type: 'dashed' } }]);
  });

  it('reads a small leading dash as dotted', () => {
    const dotted = data({ links: [{ id: 'e1', source: 'a', target: 'b', value: 1, dashArray: '1 4' }] });
    expect(getGraphSeries(dotted, ctx()).links).toMatchObject([{ lineStyle: { type: 'dotted' } }]);
  });

  it('omits lineStyle entirely for an unstyled link', () => {
    expect(getGraphSeries(data(), ctx()).links![0]).not.toHaveProperty('lineStyle');
  });

  it('keeps roam and draggable off by default', () => {
    const series = getGraphSeries(data(), ctx());
    expect(series.roam).toBe(false);
    expect(series.draggable).toBe(false);
  });

  it('omits force, edgeSymbol and emphasis at their defaults', () => {
    const series = getGraphSeries(data(), ctx());
    expect(series).not.toHaveProperty('force');
    expect(series).not.toHaveProperty('edgeSymbol');
    expect(series).not.toHaveProperty('emphasis');
  });

  it('draws an arc approximation as a node border', () => {
    const withArc = data({ nodes: [{ id: 'a', name: 'A', value: 1, borderColor: 'green' }] });
    expect(getGraphSeries(withArc, ctx()).data).toMatchObject([
      { itemStyle: { borderColor: 'green', borderWidth: ARC_BORDER_WIDTH } },
    ]);
  });

  it('omits border styling for nodes with no arc fields', () => {
    const series = getGraphSeries(data(), ctx());
    expect(series.data![0]).toMatchObject({ itemStyle: expect.any(Object) });
    expect((series.data![0] as { itemStyle: Record<string, unknown> }).itemStyle).not.toHaveProperty('borderColor');
  });

  it('carries the series zlevel from the panel option', () => {
    const series = getGraphSeries(data(), ctx(baseOptions({ zLevel: { series: 3 } })));
    expect(series.zlevel).toBe(3);
  });
});
