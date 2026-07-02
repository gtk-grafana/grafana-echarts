import { type DataFrame, DataFrameType, FieldType } from '@grafana/data';
import {
  resolveChartModule,
  supportedChartSeriesTypes,
  heatmapChartModule,
  cartesianChartModule,
  pieChartModule,
  radarChartModule,
} from 'lib/echarts/charts/registry';

describe('resolveChartModule', () => {
  it('routes heatmap-tagged frames to the heatmap module regardless of series type', () => {
    const frame: DataFrame = {
      fields: [],
      length: 0,
      meta: { type: DataFrameType.HeatmapRows },
    };
    expect(resolveChartModule('line', [frame])).toBe(heatmapChartModule);
  });

  it('routes forced heatmap type to the heatmap module', () => {
    const frame: DataFrame = {
      fields: [{ name: 'value', type: FieldType.number, config: {}, values: [1] }],
      length: 1,
    };
    expect(resolveChartModule('heatmap', [frame])).toBe(heatmapChartModule);
  });

  it('routes cartesian types to the cartesian module', () => {
    expect(resolveChartModule('line', [])).toBe(cartesianChartModule);
    expect(resolveChartModule('bar', [])).toBe(cartesianChartModule);
  });

  it('routes pie and radar to their modules', () => {
    expect(resolveChartModule('pie', [])).toBe(pieChartModule);
    expect(resolveChartModule('radar', [])).toBe(radarChartModule);
  });

  it('returns null for unsupported types', () => {
    expect(resolveChartModule('gauge', [])).toBeNull();
  });

  it('lists all supported series types', () => {
    expect(supportedChartSeriesTypes).toEqual(
      expect.arrayContaining(['line', 'bar', 'scatter', 'effectScatter', 'heatmap', 'pie', 'radar'])
    );
  });
});
