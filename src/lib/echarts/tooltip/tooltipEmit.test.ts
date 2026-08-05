/**
 * End-to-end tooltip emission through a real ECharts instance: the option built
 * by `buildPanelChartOption` is set on a live chart and `showTip` is dispatched,
 * so these tests exercise the actual formatter params ECharts produces (not
 * hand-built fixtures). Guards the React overlay's data contract: header
 * composition, per-field values, and footer `source` resolution.
 */
import {
  createTheme,
  type DataFrame,
  dateTime,
  FieldType,
  type TimeRange,
  toDataFrame,
  type ValueFormatter,
} from '@grafana/data';
import { LegendDisplayMode, TooltipDisplayMode, type VizLegendOptions } from '@grafana/schema';
import { seriesTypePath } from 'editor/constants';
import { type SeriesType } from 'editor/types';
import { type ChartContext } from 'lib/echarts/charts/types';
import { GRAPH_EDGES_WIDE, GRAPH_NODES_WIDE } from 'lib/echarts/converters/graphWide';
import { type EChartsType, init } from 'lib/echarts/echarts';
import { type TooltipModel } from 'lib/echarts/tooltip/types';
import { type PanelOptions } from 'types';
import { buildPanelChartOption } from 'lib/echarts/options/panelOption';

const timeRange: TimeRange = {
  from: dateTime(1783137094497),
  to: dateTime(1783147894497),
  raw: { from: 'now-3h', to: 'now' },
};
const formatValue: ValueFormatter = (value) => ({ text: String(value) });
const legend: VizLegendOptions = {
  showLegend: true,
  displayMode: LegendDisplayMode.List,
  placement: 'bottom',
  calcs: [],
};

const timeFrame = (): DataFrame =>
  toDataFrame({
    fields: [
      { name: 'time', type: FieldType.time, values: [1783137094497, 1783140694497] },
      { name: 'a', type: FieldType.number, values: [1, 2] },
      { name: 'b', type: FieldType.number, values: [3, 4] },
    ],
  });

/** OHLC frame; the converter detects candlestick from these field names. */
const candlestickFrame = (): DataFrame =>
  toDataFrame({
    fields: [
      { name: 'time', type: FieldType.time, values: [1783137094497, 1783140694497] },
      { name: 'open', type: FieldType.number, values: [10, 20] },
      { name: 'high', type: FieldType.number, values: [15, 25] },
      { name: 'low', type: FieldType.number, values: [5, 15] },
      { name: 'close', type: FieldType.number, values: [12, 22] },
    ],
  });

/** Five-number summary frame; the converter detects boxplot from these names. */
const boxplotFrame = (): DataFrame =>
  toDataFrame({
    fields: [
      { name: 'cat', type: FieldType.string, values: ['a', 'b'] },
      { name: 'min', type: FieldType.number, values: [1, 2] },
      { name: 'q1', type: FieldType.number, values: [3, 4] },
      { name: 'median', type: FieldType.number, values: [5, 6] },
      { name: 'q3', type: FieldType.number, values: [7, 8] },
      { name: 'max', type: FieldType.number, values: [9, 10] },
    ],
  });

/**
 * Categorical frame with one numeric field per radar polygon — the shape the
 * showcase dashboard's radar panel produces after its `convertFieldType`.
 */
const radarFrame = (): DataFrame =>
  toDataFrame({
    fields: [
      { name: 'metric', type: FieldType.string, values: ['speed', 'power', 'range', 'cost'] },
      { name: 'alpha', type: FieldType.number, values: [80, 70, 60, 90] },
      { name: 'bravo', type: FieldType.number, values: [60, 90, 75, 50] },
    ],
  });

const pieFrame = (): DataFrame =>
  toDataFrame({
    fields: [
      { name: 'a', type: FieldType.number, values: [30] },
      { name: 'b', type: FieldType.number, values: [70] },
    ],
  });

/**
 * Wide graph frames (`data-plane/graph-wide.md`): one node per field, one edge per
 * field. The two nodes carry **different units**, which is the case the row form
 * cannot express — one `mainstat` column means one unit for every node.
 */
const relationsFrames = (): DataFrame[] => [
  toDataFrame({
    name: 'nodes',
    meta: { type: GRAPH_NODES_WIDE },
    fields: [
      { name: 'gateway', type: FieldType.number, values: [12], config: { unit: 'ms', decimals: 1 } },
      { name: 'db', type: FieldType.number, values: [0.42], config: { unit: 'percentunit', decimals: 0 } },
    ],
  }),
  toDataFrame({
    name: 'edges',
    meta: { type: GRAPH_EDGES_WIDE },
    fields: [
      {
        name: 'e1',
        type: FieldType.number,
        labels: { source: 'gateway', target: 'db' },
        values: [3.5],
        config: { unit: 's', decimals: 2 },
      },
    ],
  }),
];

const makeContext = (frames: DataFrame[], seriesType: SeriesType, mode: TooltipDisplayMode): ChartContext => ({
  frames,
  theme: createTheme(),
  timeZone: 'utc',
  timeRange,

  options: {
    [seriesTypePath]: seriesType,
    legend,
    tooltip: { mode, sort: undefined, hideZeros: false },
  } as unknown as PanelOptions,
  seriesType,
  formatValue,
  replaceVariables: (value: string) => value,
  fieldConfig: { defaults: {}, overrides: [] },
});

/** Mount a live chart, set the panel option with a capturing sink, and dispatch showTip. */
function emitViaShowTip(
  ctx: ChartContext,
  showTip: { seriesIndex: number; dataIndex: number }
): { emitted: TooltipModel[]; chart: EChartsType } {
  const emitted: TooltipModel[] = [];
  // Non-null: every fixture mounted here is one the family can draw.
  const option = buildPanelChartOption(ctx, { isGrafanaLegend: true, tooltipSink: (model) => emitted.push(model) })!;
  const dom = document.createElement('div');
  dom.style.width = '400px';
  dom.style.height = '300px';
  document.body.appendChild(dom);
  const chart = init(dom);
  chart.setOption(option, { notMerge: true });
  chart.dispatchAction({ type: 'showTip', ...showTip });
  return { emitted, chart };
}

/**
 * Mount a live chart and hover the graphic element ECharts drew for `dataIndex`,
 * by dispatching a ZRender `mousemove` at one of its own points. For coordinate
 * systems that cannot be addressed by `showTip` (see the parallel case below),
 * this is the only way to exercise the real formatter params — and it is what a
 * browser does anyway.
 */
function emitViaHover(ctx: ChartContext, dataIndex: number): { emitted: TooltipModel[]; chart: EChartsType } {
  const emitted: TooltipModel[] = [];
  // Non-null: every fixture mounted here is one the family can draw.
  const option = buildPanelChartOption(ctx, { isGrafanaLegend: true, tooltipSink: (model) => emitted.push(model) })!;
  const dom = document.createElement('div');
  dom.style.width = '400px';
  dom.style.height = '300px';
  document.body.appendChild(dom);
  const chart = init(dom);
  chart.setOption(option, { notMerge: true });

  const zr = chart.getZr() as unknown as {
    storage: { getDisplayList: () => Array<{ shape?: { points?: number[][] } }> };
    handler: { dispatch: (name: string, event: unknown) => void };
  };
  // Polylines carry their points as [x, y] pairs; ask ECharts where it put them
  // rather than hard-coding pixels that shift with the layout box.
  const polylines = zr.storage.getDisplayList().filter((el) => Array.isArray(el.shape?.points?.[0]));
  const point = polylines[dataIndex]?.shape?.points?.[0];
  if (point == null) {
    throw new Error(`no polyline drawn for dataIndex ${dataIndex}`);
  }
  zr.handler.dispatch('mousemove', {
    zrX: point[0],
    zrY: point[1],
    offsetX: point[0],
    offsetY: point[1],
    preventDefault: () => {},
    stopPropagation: () => {},
    stopImmediatePropagation: () => {},
  });
  return { emitted, chart };
}

describe('tooltip emission through a real ECharts instance', () => {
  it('line / Single: emits the hovered item with a Grafana-formatted time header and its source', () => {
    const { emitted, chart } = emitViaShowTip(makeContext([timeFrame()], 'line', TooltipDisplayMode.Single), {
      seriesIndex: 1,
      dataIndex: 1,
    });

    expect(emitted).toHaveLength(1);
    const [model] = emitted;
    // Header carries the x time in `value` (core TimeSeriesTooltip composition),
    // formatted by Grafana in the panel time zone (UTC here), not ECharts.
    expect(model.header?.label).toBe('');
    expect(model.header?.value).toMatch(/^2026-07-04 04:51:34$/);
    expect(model.rows).toHaveLength(1);
    expect(model.rows[0]).toMatchObject({ label: 'b', value: '4' });
    // The hovered series' field resolves for the footer (series index 1 -> field 'b').
    expect(model.source?.field.name).toBe('b');
    expect(model.source?.rowIndex).toBe(1);
    chart.dispose();
  });

  it('line / All (axis): emits every series with per-row sources for the clicked-row footer', () => {
    const { emitted, chart } = emitViaShowTip(makeContext([timeFrame()], 'line', TooltipDisplayMode.Multi), {
      seriesIndex: 0,
      dataIndex: 1,
    });

    expect(emitted).toHaveLength(1);
    const [model] = emitted;
    expect(model.header?.value).toMatch(/^2026-07-04 04:51:34$/);
    expect(model.rows.map((row) => row.label)).toEqual(['a', 'b']);
    // No single focused item at the model level...
    expect(model.source).toBeUndefined();
    // ...but every row carries its own source, keyed by seriesIndex.
    expect(model.rows.map((row) => ({ seriesIndex: row.seriesIndex, field: row.source?.field.name }))).toEqual([
      { seriesIndex: 0, field: 'a' },
      { seriesIndex: 1, field: 'b' },
    ]);
    chart.dispose();
  });

  it('candlestick: lists every packed dimension and a real time header', () => {
    const { emitted, chart } = emitViaShowTip(
      makeContext([candlestickFrame()], 'candlestick', TooltipDisplayMode.Single),
      { seriesIndex: 0, dataIndex: 1 }
    );

    expect(emitted).toHaveLength(1);
    const [model] = emitted;
    // A multi-value item's `value` starts with its data index, so a naive
    // `value[0]` header would render index 1 as 1970-01-01.
    expect(model.header?.value).toMatch(/^2026-07-04 04:51:34$/);
    // Rows follow ECharts' candlestick data order, `[open, close, low, high]`.
    expect(model.rows.map((row) => [row.label, row.value])).toEqual([
      ['Open', '20'],
      ['Close', '22'],
      ['Low', '15'],
      ['High', '25'],
    ]);
    chart.dispose();
  });

  it('boxplot: lists the five-number summary rather than only the last dimension', () => {
    const { emitted, chart } = emitViaShowTip(makeContext([boxplotFrame()], 'boxplot', TooltipDisplayMode.Single), {
      seriesIndex: 0,
      dataIndex: 1,
    });

    expect(emitted).toHaveLength(1);
    const [model] = emitted;
    expect(model.header?.value).toBe('b');
    expect(model.rows.map((row) => [row.label, row.value])).toEqual([
      ['Min', '2'],
      ['Q1', '4'],
      ['Median', '6'],
      ['Q3', '8'],
      ['Max', '10'],
    ]);
    chart.dispose();
  });

  it('radar: emits the hovered polygon and resolves its field for the footer', () => {
    const { emitted, chart } = emitViaShowTip(makeContext([radarFrame()], 'radar', TooltipDisplayMode.Single), {
      seriesIndex: 0,
      dataIndex: 1,
    });

    expect(emitted).toHaveLength(1);
    const [model] = emitted;
    expect(model.rows).toHaveLength(1);
    // Radar keys its resolvers by `dataIndex` (one data item per polygon), so
    // index 1 is the second numeric field.
    expect(model.source?.field.name).toBe('bravo');
    chart.dispose();
  });

  // Parallel shares radar's frames and resolvers but reaches ECharts through a
  // different coordinate system, so it needs its own end-to-end case — and it
  // cannot use `emitViaShowTip`: ECharts throws on an index-addressed `showTip`
  // for a parallel coordinate system (`Parallel.dataToPoint` needs a `dim` that
  // `findPointFromSeries` never passes). Hovering is the path the panel actually
  // uses, so this drives the ZRender handler the way a browser would.
  it('parallel: emits the hovered polyline, names it in the header, and resolves its field for the footer', () => {
    const { emitted, chart } = emitViaHover(
      makeContext([radarFrame()], 'parallel', TooltipDisplayMode.Single),
      // Second polyline: the family renders one series whose data items are the
      // numeric fields, so index 1 is `bravo`.
      1
    );

    expect(emitted).toHaveLength(1);
    const [model] = emitted;
    expect(model.rows).toHaveLength(1);
    // The header reads `params.name`, which ECharts fills from the data item's
    // own `name` — the thing `buildParallelOption` used to drop.
    expect(model.header?.value).toBe('bravo');
    // Keyed by `dataIndex`, and what the pinned tooltip's data-link footer
    // resolves its links from.
    expect(model.source?.field.name).toBe('bravo');
    chart.dispose();
  });

  it('pie: emits the hovered slice with its name as the header label and the slice field as source', () => {
    const { emitted, chart } = emitViaShowTip(makeContext([pieFrame()], 'pie', TooltipDisplayMode.Single), {
      seriesIndex: 0,
      dataIndex: 0,
    });

    expect(emitted).toHaveLength(1);
    const [model] = emitted;
    // Item chart: name in the header label (no time-style value).
    expect(model.header?.value).toBe('');
    expect(model.header?.label).not.toBe('');
    expect(model.rows[0].value).toMatch(/\(\d+%\)$/);
    expect(model.source).toBeDefined();
    chart.dispose();
  });

  // Funnel is the pie's sibling render variant and shares the slice model, so it
  // shares the pie tooltip verbatim (see `buildFunnelChartOption`). It landed
  // after the React overlay, so these guard that its series formatter is wired
  // to the sink rather than left on the pre-overlay DOM path.
  it('funnel: emits the hovered slice with its name as the header label and the slice field as source', () => {
    const { emitted, chart } = emitViaShowTip(makeContext([pieFrame()], 'funnel', TooltipDisplayMode.Single), {
      seriesIndex: 0,
      dataIndex: 0,
    });

    expect(emitted).toHaveLength(1);
    const [model] = emitted;
    expect(model.header?.value).toBe('');
    expect(model.header?.label).not.toBe('');
    expect(model.rows[0].value).toMatch(/\(\d+%\)$/);
    expect(model.source).toBeDefined();
    chart.dispose();
  });

  it('funnel / All (Multi): lists every slice with the hovered one emphasized', () => {
    const { emitted, chart } = emitViaShowTip(makeContext([pieFrame()], 'funnel', TooltipDisplayMode.Multi), {
      seriesIndex: 0,
      dataIndex: 1,
    });

    expect(emitted).toHaveLength(1);
    const [model] = emitted;
    expect(model.rows).toHaveLength(2);
    // Every row carries its own source so the pinned footer can resolve the
    // clicked row's data links.
    expect(model.rows.every((row) => row.source != null)).toBe(true);
    expect(model.rows.map((row) => row.emphasis)).toEqual([false, true]);
    chart.dispose();
  });

  /**
   * Relations, where the params ECharts produces are the whole question: one
   * formatter serves both the node and the edge table, and each hovered mark has to
   * find *its own* field. The `formatValue` this context supplies stringifies the
   * raw number, so a formatted unit in the row proves the mark's own display
   * processor ran rather than the panel's.
   */
  it('relations: formats a hovered node with its own unit and resolves its own field', () => {
    const { emitted, chart } = emitViaShowTip(
      makeContext(relationsFrames(), 'graph', TooltipDisplayMode.Single),
      // The node table; `dataType` defaults to it.
      { seriesIndex: 0, dataIndex: 1 }
    );

    expect(emitted).toHaveLength(1);
    const [model] = emitted;
    expect(model.header?.label).toBe('db');
    // `db` is a percentunit field; `gateway` next to it is milliseconds.
    expect(model.rows[0].value).toBe('42%');
    expect(model.source?.field.name).toBe('db');
    chart.dispose();
  });
});
