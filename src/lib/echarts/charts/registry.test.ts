import {
  cartesianChartModule,
  heatmapChartModule,
  multivariateChartModule,
  pieChartModule,
  resolveChartModule,
  supportedChartSeriesTypes,
} from 'lib/echarts/charts/registry';

describe('resolveChartModule', () => {
  it('routes the heatmap family (composite panel) to the heatmap module', () => {
    expect(resolveChartModule('heatmap')).toBe(heatmapChartModule);
  });

  it('routes cartesian types (single- and multi-value) to the cartesian module', () => {
    // Panel identity fixes the family; the module picks the build path from the type.
    expect(resolveChartModule('line')).toBe(cartesianChartModule);
    expect(resolveChartModule('bar')).toBe(cartesianChartModule);
    expect(resolveChartModule('candlestick')).toBe(cartesianChartModule);
    expect(resolveChartModule('boxplot')).toBe(cartesianChartModule);
  });

  it('routes pie and radar to their modules', () => {
    expect(resolveChartModule('pie')).toBe(pieChartModule);
    // Radar routes to the (renamed) multivariate module.
    expect(resolveChartModule('radar')).toBe(multivariateChartModule);
  });

  it('throws for unsupported concrete types', () => {
    expect(() => resolveChartModule('gauge')).toThrow();
  });

  it('lists all supported series types', () => {
    expect(supportedChartSeriesTypes).toEqual(
      expect.arrayContaining(['line', 'bar', 'scatter', 'effectScatter', 'heatmap', 'pie', 'radar'])
    );
  });
});
