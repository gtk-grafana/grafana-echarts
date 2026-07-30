import { createTheme, type DataFrame, type FieldConfigSource, FieldType, toDataFrame } from '@grafana/data';
import { relationsChartModule } from 'lib/echarts/charts/relations';
import { type RelationsChartContext } from 'lib/echarts/charts/types';
import { type PanelOptions } from 'types';

const theme = createTheme();
const emptyFieldConfig: FieldConfigSource = { defaults: {}, overrides: [] };

const nodesFrame = toDataFrame({
  name: 'nodes',
  fields: [
    { name: 'id', type: FieldType.string, values: ['a', 'b'] },
    { name: 'title', type: FieldType.string, values: ['Gateway', 'API'] },
    { name: 'mainstat', type: FieldType.number, values: [10, 20] },
  ],
});

const edgesFrame = toDataFrame({
  name: 'edges',
  fields: [
    { name: 'id', type: FieldType.string, values: ['e1'] },
    { name: 'source', type: FieldType.string, values: ['a'] },
    { name: 'target', type: FieldType.string, values: ['b'] },
    { name: 'mainstat', type: FieldType.number, values: [5] },
  ],
});

/** A cyclic edge set (A->B->A), the shape that throws out of ECharts' sankey layout. */
const cyclicEdgesFrame = toDataFrame({
  name: 'edges',
  fields: [
    { name: 'id', type: FieldType.string, values: ['e1', 'e2'] },
    { name: 'source', type: FieldType.string, values: ['a', 'b'] },
    { name: 'target', type: FieldType.string, values: ['b', 'a'] },
    { name: 'mainstat', type: FieldType.number, values: [5, 3] },
  ],
});

const ctx = (
  frames: DataFrame[],
  fieldConfig: FieldConfigSource = emptyFieldConfig,
  seriesType: RelationsChartContext['seriesType'] = 'graph'
): RelationsChartContext =>
  ({
    frames,
    theme,
    timeZone: 'utc',
    timeRange: {},
    options: {
      legend: { showLegend: true, displayMode: 'list', placement: 'bottom', calcs: [] },
      tooltip: { mode: 'single' },
    } as unknown as PanelOptions,
    seriesType,
    formatValue: (value: unknown) => ({ text: String(value) }),
    fieldConfig,
    replaceVariables: (value: string) => value,
  }) as unknown as RelationsChartContext;

/** The same context, narrowed to the sankey render variant. */
const sankeyCtx = (frames: DataFrame[]): RelationsChartContext => ctx(frames, emptyFieldConfig, 'sankey');
/** The same context, narrowed to the chord render variant. */
const chordCtx = (frames: DataFrame[]): RelationsChartContext => ctx(frames, emptyFieldConfig, 'chord');

const base = { isGrafanaLegend: true };

describe('relationsChartModule', () => {
  describe('buildOption', () => {
    it('builds a single graph series from a nodes + edges pair', () => {
      const option = relationsChartModule.buildOption(ctx([nodesFrame, edgesFrame]), base);
      expect(option).not.toBeNull();
      const series = option!.series as Array<Record<string, unknown>>;
      expect(series).toHaveLength(1);
      expect(series[0].type).toBe('graph');
      expect(series[0].data).toHaveLength(2);
      expect(series[0].links).toHaveLength(1);
    });

    it('builds from an edges-only response', () => {
      const option = relationsChartModule.buildOption(ctx([edgesFrame]), base);
      const series = option!.series as Array<Record<string, unknown>>;
      expect(series[0].data).toHaveLength(2);
    });

    it('returns null when there is no edges frame, so the panel shows no-data', () => {
      expect(relationsChartModule.buildOption(ctx([nodesFrame]), base)).toBeNull();
      expect(relationsChartModule.buildOption(ctx([]), base)).toBeNull();
    });

    // The variant is picked from `ctx.seriesType`, the way the hierarchy module picks
    // treemap vs sunburst — one module, one converter, two layouts.
    it('builds a sankey series from the same frames when the variant is selected', () => {
      const option = relationsChartModule.buildOption(sankeyCtx([nodesFrame, edgesFrame]), base);
      const series = option!.series as Array<Record<string, unknown>>;

      expect(series).toHaveLength(1);
      expect(series[0].type).toBe('sankey');
      expect(series[0].data).toHaveLength(2);
      expect(series[0].links).toHaveLength(1);
    });

    it('returns null for the sankey variant when there is no edges frame', () => {
      expect(relationsChartModule.buildOption(sankeyCtx([nodesFrame]), base)).toBeNull();
    });

    it('adds no dropped-link note for an acyclic sankey', () => {
      const option = relationsChartModule.buildOption(sankeyCtx([nodesFrame, edgesFrame]), base);

      expect(option).not.toHaveProperty('title');
    });

    // Without the cycle policy this edge set throws out of `sankeyLayout.ts` in a
    // production build, blanking the panel.
    it('breaks a cycle for the sankey variant and notes the dropped link', () => {
      const option = relationsChartModule.buildOption(sankeyCtx([nodesFrame, cyclicEdgesFrame]), base);
      const series = option!.series as Array<Record<string, unknown>>;

      expect(series[0].links).toHaveLength(1);
      expect(option).toHaveProperty('title');
      expect((option as { title?: { subtext?: string } }).title?.subtext).toBe('1 link hidden to remove cycles');
    });

    // The graph series accepts any digraph, so the same frames must keep both edges.
    it('keeps the cycle for the graph variant', () => {
      const option = relationsChartModule.buildOption(ctx([nodesFrame, cyclicEdgesFrame]), base);
      const series = option!.series as Array<Record<string, unknown>>;

      expect(series[0].links).toHaveLength(2);
      expect(option).not.toHaveProperty('title');
    });

    it('builds a chord series from the same frames when the variant is selected', () => {
      const option = relationsChartModule.buildOption(chordCtx([nodesFrame, edgesFrame]), base);
      const series = option!.series as Array<Record<string, unknown>>;

      expect(series).toHaveLength(1);
      expect(series[0].type).toBe('chord');
      expect(series[0].data).toHaveLength(2);
      expect(series[0].links).toHaveLength(1);
    });

    it('returns null for the chord variant when there is no edges frame', () => {
      expect(relationsChartModule.buildOption(chordCtx([nodesFrame]), base)).toBeNull();
    });

    // Chord has no DAG restriction, so unlike sankey it keeps every link and adds no
    // dropped-link note.
    it('keeps the cycle for the chord variant and adds no note', () => {
      const option = relationsChartModule.buildOption(chordCtx([nodesFrame, cyclicEdgesFrame]), base);
      const series = option!.series as Array<Record<string, unknown>>;

      expect(series[0].links).toHaveLength(2);
      expect(option).not.toHaveProperty('title');
    });
  });

  describe('buildLegendItems', () => {
    it('lists one entry per node, labelled by title', () => {
      const items = relationsChartModule.buildLegendItems(ctx([nodesFrame, edgesFrame]), []);
      expect(items.map((item) => item.label)).toEqual(['Gateway', 'API']);
      expect(items.every((item) => typeof item.color === 'string')).toBe(true);
    });

    it('keys items by node id so they stay stable across renders', () => {
      const items = relationsChartModule.buildLegendItems(ctx([nodesFrame, edgesFrame]), []);
      expect(items.map((item) => item.getItemKey!())).toEqual(['relations-a', 'relations-b']);
    });

    it('matches the swatch color to the chart', () => {
      const chartColors = (
        relationsChartModule.buildOption(ctx([nodesFrame, edgesFrame]), base)!.series as Array<Record<string, unknown>>
      )[0].data as Array<{ itemStyle?: { color?: string } }>;
      const items = relationsChartModule.buildLegendItems(ctx([nodesFrame, edgesFrame]), []);
      expect(items.map((item) => item.color)).toEqual(chartColors.map((node) => node.itemStyle?.color));
    });

    it('is empty when there is no usable graph', () => {
      expect(relationsChartModule.buildLegendItems(ctx([]), [])).toEqual([]);
    });
  });

  it('declares singleTooltipOnly — a hover is one node or one link', () => {
    expect(relationsChartModule.singleTooltipOnly).toBe(true);
  });
});
