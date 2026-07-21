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
import { type EChartsType, init } from 'lib/echarts/echarts';
import { type TooltipModel } from 'lib/echarts/tooltip/model';
import { type PanelOptions } from 'types';
import { buildPanelChartOption } from './panelOption';

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

const pieFrame = (): DataFrame =>
  toDataFrame({
    fields: [
      { name: 'a', type: FieldType.number, values: [30] },
      { name: 'b', type: FieldType.number, values: [70] },
    ],
  });

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
  const option = buildPanelChartOption(ctx, { isGrafanaLegend: true, tooltipSink: (model) => emitted.push(model) });
  const dom = document.createElement('div');
  dom.style.width = '400px';
  dom.style.height = '300px';
  document.body.appendChild(dom);
  const chart = init(dom);
  chart.setOption(option, { notMerge: true });
  chart.dispatchAction({ type: 'showTip', ...showTip });
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
});
