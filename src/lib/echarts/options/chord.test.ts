import { createTheme, type FieldConfigSource } from '@grafana/data';
import { type RelationsChartContext } from 'lib/echarts/charts/types';
import { type NodeGraphData } from 'lib/echarts/converters/relationsModel';
import { getChordEmphasis, getChordLabel, getChordLinkStyle, getChordSeries } from 'lib/echarts/options/chord';
import { applyEditorModeDefaults } from 'lib/echarts/options/editorMode';
import { type RelationsSeriesContext } from 'lib/echarts/options/graph';
import { type RelationsLinkItem, type RelationsNodeItem } from 'lib/echarts/tooltip/types';
import { type PanelOptions } from 'types';

const theme = createTheme();
const emptyFieldConfig: FieldConfigSource = { defaults: {}, overrides: [] };

const baseOptions = (extra: Partial<PanelOptions> = {}): PanelOptions =>
  ({
    legend: { showLegend: true, displayMode: 'list', placement: 'bottom', calcs: [] },
    tooltip: { mode: 'single' },
    ...extra,
  }) as PanelOptions;

const ctx = (options: PanelOptions = baseOptions()): RelationsSeriesContext =>
  ({
    frames: [],
    theme,
    timeZone: 'utc',
    timeRange: {} as RelationsChartContext['timeRange'],
    options,
    seriesType: 'chord',
    formatValue: (value: unknown) => ({ text: String(value) }),
    fieldConfig: emptyFieldConfig,
    replaceVariables: (value: string) => value,
  }) as unknown as RelationsSeriesContext;

const data = (extra: Partial<NodeGraphData> = {}): NodeGraphData => ({
  nodes: [
    { id: 'a', name: 'A', value: 1 },
    { id: 'b', name: 'B', value: 2 },
  ],
  links: [{ id: 'e1', source: 'a', target: 'b', value: 5 }],
  ...extra,
});

const nodeItems = (series: ReturnType<typeof getChordSeries>): RelationsNodeItem[] =>
  series.data as unknown as RelationsNodeItem[];
const linkItems = (series: ReturnType<typeof getChordSeries>): RelationsLinkItem[] =>
  series.links as unknown as RelationsLinkItem[];

describe('getChordLabel', () => {
  it('shows themed labels by default', () => {
    const label = getChordLabel(ctx());

    expect(label?.show).toBe(true);
    expect(label?.color).toBe(theme.colors.text.primary);
  });

  // `ChordPiece` passes `defaultText: node.dataIndex + ''`, so without a formatter the
  // labels are raw numeric indices. Its fallback — using the item's `name` as a
  // *formatter string* — would also misread a node named `{svc}` as a template.
  it('routes the label through the node name, not the data index', () => {
    expect(getChordLabel(ctx())?.formatter).toBe('{b}');
  });

  // The shared formatter reads `params.name`, so the index-labelling bug above stays
  // fixed while the stat is appended.
  it('swaps in the shared formatter when node values are switched on', () => {
    const formatter = getChordLabel(ctx(baseOptions({ relationsShowNodeValues: true })))?.formatter;

    expect(typeof formatter).toBe('function');
    expect(
      typeof formatter === 'function'
        ? formatter({ name: 'us-east', data: { id: 'us-east', name: 'us-east', stat: 420 } } as never)
        : undefined
    ).toBe('us-east\n420');
  });

  // `position: 'outside'` is ECharts' own chord default and is left alone.
  it('does not override the ECharts label position', () => {
    expect(getChordLabel(ctx())).not.toHaveProperty('position');
  });

  it('hides labels when switched off', () => {
    expect(getChordLabel(ctx(baseOptions({ relationsShowNodeLabels: false })))).toEqual({ show: false });
  });
});

describe('getChordLinkStyle', () => {
  // The family default is `gradient`, so a ribbon blends from one arc's colour into the
  // other's; ECharts' own chord default is `source`, so the key has to be emitted for it
  // to take effect. `ChordEdge` implements all three keywords, so nothing else is needed.
  it('emits the family default, which ECharts does not share', () => {
    expect(getChordLinkStyle(baseOptions())).toEqual({ color: 'gradient' });
  });

  it("omits the key only when the mode already matches ECharts' chord default", () => {
    expect(getChordLinkStyle(baseOptions({ relationsLinkColor: 'source' }))).toBeUndefined();
  });

  it('emits an explicitly chosen mode', () => {
    expect(getChordLinkStyle(baseOptions({ relationsLinkColor: 'target' }))).toEqual({ color: 'target' });
  });

  it('omits opacity at the ECharts default', () => {
    expect(getChordLinkStyle(baseOptions({ relationsChordLinkOpacity: 0.2 }))).not.toHaveProperty('opacity');
  });

  it('emits an overridden opacity', () => {
    expect(getChordLinkStyle(baseOptions({ relationsChordLinkOpacity: 0.75 }))).toMatchObject({ opacity: 0.75 });
  });
});

describe('getChordEmphasis', () => {
  // The family default is adjacency now, which is also ECharts' own chord default, so
  // the two finally agree out of the box.
  it('focuses adjacency by default', () => {
    expect(getChordEmphasis(baseOptions())).toEqual({ focus: 'adjacency' });
  });

  // Still always emitted: omitting it would leave ECharts' adjacency highlighting
  // active while the switch reads off, and the control would be lying.
  it('pins focus to none when the switch is off, against the ECharts default', () => {
    expect(getChordEmphasis(baseOptions({ relationsFocusAdjacency: false }))).toEqual({ focus: 'none' });
  });
});

describe('getChordSeries', () => {
  it('builds a chord series from the shared node/link model', () => {
    const series = getChordSeries(data(), ctx());

    expect(series.type).toBe('chord');
    expect(nodeItems(series).map((node) => node.id)).toEqual(['a', 'b']);
    expect(linkItems(series)).toEqual([{ markId: 'e1', source: 'a', target: 'b', value: 5 }]);
  });

  it('omits every ring key at its ECharts default', () => {
    const series = getChordSeries(
      data(),
      ctx(
        baseOptions({
          relationsChordStartAngle: 90,
          relationsChordClockwise: true,
          relationsChordPadAngle: 3,
          relationsChordMinAngle: 0,
        })
      )
    );

    expect(series).not.toHaveProperty('startAngle');
    expect(series).not.toHaveProperty('clockwise');
    expect(series).not.toHaveProperty('padAngle');
    expect(series).not.toHaveProperty('minAngle');
  });

  it('emits ring keys when overridden', () => {
    const series = getChordSeries(
      data(),
      ctx(
        baseOptions({
          relationsChordStartAngle: 0,
          relationsChordClockwise: false,
          relationsChordPadAngle: 8,
          relationsChordMinAngle: 2,
        })
      )
    );

    expect(series.startAngle).toBe(0);
    expect(series.clockwise).toBe(false);
    expect(series.padAngle).toBe(8);
    expect(series.minAngle).toBe(2);
  });

  // `series.chord` has no `nodeWidth`/`nodeGap` — they are sankey keys. Wiring them by
  // analogy would have produced two controls that silently do nothing.
  it('never emits the sankey-only node geometry keys', () => {
    const series = getChordSeries(
      data(),
      ctx(baseOptions({ relationsSankeyNodeWidth: 40, relationsSankeyNodeGap: 20 }))
    );

    expect(series).not.toHaveProperty('nodeWidth');
    expect(series).not.toHaveProperty('nodeGap');
  });

  // `chordLayout` takes `Math.max(declaredValue, edgeSum)`, so a declared value is an
  // arc-angle floor — the same trap as sankey.
  it('carries mainstat as stat rather than value', () => {
    const series = getChordSeries(data(), ctx());

    expect(nodeItems(series)[0].stat).toBe(1);
    expect(nodeItems(series)[0]).not.toHaveProperty('value');
  });

  it('drops per-edge thickness and strokedasharray but keeps color', () => {
    const styled = data({
      links: [{ id: 'e1', source: 'a', target: 'b', value: 5, width: 4, lineType: 'dashed' as const, color: 'red' }],
    });

    expect(linkItems(getChordSeries(styled, ctx()))[0].lineStyle).toEqual({ color: 'red' });
  });

  it('drops noderadius and fixed coordinates', () => {
    const pinned = data({ nodes: [{ id: 'a', name: 'A', value: 1, radius: 40, fixedX: 10, fixedY: 20 }] });
    const series = getChordSeries(pinned, ctx());

    expect(nodeItems(series)[0]).not.toHaveProperty('symbolSize');
    expect(nodeItems(series)[0]).not.toHaveProperty('x');
    expect(nodeItems(series)[0]).not.toHaveProperty('y');
  });

  // Neither key is emitted. `ChordSeries` declares no `draggable` and no `roam` — it
  // pins `coordinateSystem: 'none'`, so there is no view to move or scale and the two
  // switches were writing keys nothing reads. The panel hides them on chord instead.
  it('emits neither roam nor draggable, which chord does not implement', () => {
    const series = getChordSeries(data(), ctx(baseOptions({ relationsDraggable: true, relationsPan: true })));

    expect(series).not.toHaveProperty('roam');
    expect(series).not.toHaveProperty('draggable');
  });

  // A ring of small arcs is exactly where labels pile up, and `series.chord` has no
  // `avoidLabelOverlap` of its own — the shared label-layout stage is the answer.
  it('hides overlapping labels by default', () => {
    expect(getChordSeries(data(), ctx()).labelLayout).toEqual({ hideOverlap: true });
    expect(getChordSeries(data(), ctx(baseOptions({ relationsHideOverlappingLabels: false })))).not.toHaveProperty(
      'labelLayout'
    );
  });

  // The headline difference from sankey: no DAG restriction, so nothing is rewritten.
  describe('cycles', () => {
    it('passes a cyclic link set through untouched', () => {
      const cyclic = data({
        links: [
          { id: 'e1', source: 'a', target: 'b', value: 1 },
          { id: 'e2', source: 'b', target: 'a', value: 2 },
        ],
      });

      const series = getChordSeries(cyclic, ctx());

      expect(linkItems(series)).toEqual([
        { markId: 'e1', source: 'a', target: 'b', value: 1 },
        { markId: 'e2', source: 'b', target: 'a', value: 2 },
      ]);
    });

    it('keeps a self-loop, which a sankey would have to drop', () => {
      const selfLoop = data({ links: [{ id: 'e1', source: 'a', target: 'a', value: 3 }] });

      expect(linkItems(getChordSeries(selfLoop, ctx()))).toEqual([
        { markId: 'e1', source: 'a', target: 'a', value: 3 },
      ]);
    });
  });
});

describe('editor-mode normalization', () => {
  const advanced: Partial<PanelOptions> = {
    relationsChordStartAngle: 0,
    relationsChordClockwise: false,
    relationsChordPadAngle: 8,
    relationsChordMinAngle: 2,
    relationsChordLinkOpacity: 0.75,
  };

  it('resets every chord Advanced option in Default mode', () => {
    const normalized = applyEditorModeDefaults('chord', baseOptions(advanced));

    for (const key of Object.keys(advanced) as Array<keyof PanelOptions>) {
      expect(normalized[key]).toBeUndefined();
    }
  });

  it('keeps them in Advanced mode', () => {
    const normalized = applyEditorModeDefaults('chord', baseOptions({ ...advanced, editorMode: 'advanced' }));

    expect(normalized.relationsChordPadAngle).toBe(8);
    expect(normalized.relationsChordClockwise).toBe(false);
  });

  // Keyed on the family, not the variant, so switching Chart type cannot leave another
  // variant's hidden Advanced values in force.
  it('resets the chord tier for the other variants too', () => {
    expect(applyEditorModeDefaults('graph', baseOptions(advanced)).relationsChordPadAngle).toBeUndefined();
    expect(applyEditorModeDefaults('sankey', baseOptions(advanced)).relationsChordPadAngle).toBeUndefined();
  });
});
