import {
  cartesianChartModule,
  heatmapChartModule,
  multivariateChartModule,
  partToWholeChartModule,
  pieChartModule,
  relationsChartModule,
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

  it('routes pie to its module and both multivariate types to the multivariate module', () => {
    expect(resolveChartModule('pie')).toBe(pieChartModule);
    // Radar and parallel share the (renamed) multivariate module; the module
    // picks the coordinate system from the type.
    expect(resolveChartModule('radar')).toBe(multivariateChartModule);
    expect(resolveChartModule('parallel')).toBe(multivariateChartModule);
  });

  it('routes the part-to-whole family (pie + funnel) to the shared module', () => {
    // Pie and funnel share one module (the module picks the variant from the type);
    // `partToWholeChartModule` is the family alias of `pieChartModule`.
    expect(resolveChartModule('funnel')).toBe(partToWholeChartModule);
    expect(resolveChartModule('pie')).toBe(partToWholeChartModule);
  });

  it('routes both relations types to the shared module', () => {
    // Graph and sankey share one module (the module picks the variant from the
    // type), since both ECharts series read the identical node/link input.
    expect(resolveChartModule('graph')).toBe(relationsChartModule);
    expect(resolveChartModule('sankey')).toBe(relationsChartModule);
  });

  it('throws for unsupported concrete types', () => {
    // gauge is a planned part-to-whole variant, not yet registered.
    expect(() => resolveChartModule('gauge')).toThrow();
    // chord is a planned relations variant; until it is added to
    // `relationsSeriesTypes` it must still throw rather than silently render as a
    // graph.
    expect(() => resolveChartModule('chord')).toThrow();
  });

  it('lists all supported series types', () => {
    expect(supportedChartSeriesTypes).toEqual(
      expect.arrayContaining([
        'line',
        'bar',
        'scatter',
        'effectScatter',
        'heatmap',
        'pie',
        'funnel',
        'radar',
        'parallel',
        'graph',
      ])
    );
  });
});
