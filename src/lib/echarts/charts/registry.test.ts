import { createDataFrame, type DataFrame, DataFrameType, FieldType, getPanelDataSummary } from '@grafana/data';
import {
  cartesianChartModule,
  heatmapChartModule,
  pieChartModule,
  radarChartModule,
  resolveAutoSeriesType,
  resolveChartModule,
  supportedChartSeriesTypes,
} from 'lib/echarts/charts/registry';

// Frame fixtures mirror the per-family suggestions.test.ts patterns so the
// resolver is exercised through the same PanelDataSummary the suppliers use.
const timeNumberFrame = () =>
  createDataFrame({
    fields: [
      { name: 'time', type: FieldType.time, values: [0, 100, 200] },
      { name: 'value', type: FieldType.number, values: [1, 2, 3] },
    ],
  });

const heatmapRowsFrame = () =>
  createDataFrame({
    meta: { type: DataFrameType.HeatmapRows },
    fields: [
      { name: 'xMax', type: FieldType.time, values: [0, 100] },
      { name: '1', type: FieldType.number, values: [1, 2] },
    ],
  });

const instantNumericFrame = () =>
  createDataFrame({
    fields: [
      { name: 'time', type: FieldType.time, values: [100, 100, 100] },
      { name: 'value', type: FieldType.number, values: [1, 2, 3] },
    ],
  });

const numericWideFrame = () =>
  createDataFrame({
    meta: { type: DataFrameType.NumericWide },
    fields: [
      { name: 'a', type: FieldType.number, values: [1] },
      { name: 'b', type: FieldType.number, values: [2] },
    ],
  });

const categoryMetricsFrame = () =>
  createDataFrame({
    fields: [
      { name: 'entity', type: FieldType.string, values: ['a', 'b'] },
      { name: 'speed', type: FieldType.number, values: [1, 2] },
      { name: 'power', type: FieldType.number, values: [3, 4] },
      { name: 'range', type: FieldType.number, values: [5, 6] },
    ],
  });

describe('resolveChartModule', () => {
  it('routes the heatmap family (composite panel) to the heatmap module', () => {
    expect(resolveChartModule('heatmap', [])).toBe(heatmapChartModule);
  });

  it('routes cartesian types to the cartesian module (panel identity fixes the family)', () => {
    // A heatmap-tagged frame no longer forces heatmap rendering here: the
    // cartesian panel stays cartesian and never overlays the heatmap composite.
    // Data-driven heatmap detection lives in the suggestions supplier instead.
    expect(resolveChartModule('line', [])).toBe(cartesianChartModule);
    expect(resolveChartModule('bar', [])).toBe(cartesianChartModule);
  });

  it('routes pie and radar to their modules', () => {
    expect(resolveChartModule('pie', [])).toBe(pieChartModule);
    expect(resolveChartModule('radar', [])).toBe(radarChartModule);
  });

  it('throws for unsupported concrete types', () => {
    expect(() => resolveChartModule('gauge', [])).toThrow();
  });

  it('resolves an unset series type (freshly added panel) instead of throwing', () => {
    // Regression for the starting-panels crash: options.seriesType is undefined
    // for a panel that never went through a suggestion, and must resolve rather
    // than throw (resolveChartModule runs before the panel's empty-data guard).
    expect(() => resolveChartModule(undefined, [])).not.toThrow();
    expect(resolveChartModule(undefined, [])).toBe(cartesianChartModule);
  });

  it("resolves 'Auto' from the frame data", () => {
    expect(resolveChartModule('Auto', [heatmapRowsFrame()])).toBe(heatmapChartModule);
    expect(resolveChartModule('Auto', [timeNumberFrame()])).toBe(cartesianChartModule);
  });

  it('lists all supported series types', () => {
    expect(supportedChartSeriesTypes).toEqual(
      expect.arrayContaining(['line', 'bar', 'scatter', 'effectScatter', 'heatmap', 'pie', 'radar'])
    );
  });
});

describe('resolveAutoSeriesType', () => {
  const auto = (frames: DataFrame[]) => resolveAutoSeriesType(getPanelDataSummary(frames));

  it('prefers heatmap for heatmap-tagged frames (even with time + number present)', () => {
    expect(auto([heatmapRowsFrame()])).toBe('heatmap');
  });

  it('picks line for multi-point time + number data', () => {
    expect(auto([timeNumberFrame()])).toBe('line');
  });

  it('picks pie for instant (snapshot) numeric data', () => {
    expect(auto([instantNumericFrame()])).toBe('pie');
  });

  it('picks pie over radar for a numeric multi-field frame', () => {
    expect(auto([numericWideFrame()])).toBe('pie');
  });

  it('picks radar for multiple numeric metrics without a numeric-frame tag or time', () => {
    expect(auto([categoryMetricsFrame()])).toBe('radar');
  });

  it('falls back to line for empty data (never throws)', () => {
    expect(() => auto([])).not.toThrow();
    expect(auto([])).toBe('line');
  });
});
