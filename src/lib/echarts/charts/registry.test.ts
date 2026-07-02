import {
  resolveChartModule,
  supportedChartSeriesTypes,
  heatmapChartModule,
  cartesianChartModule,
  pieChartModule,
  radarChartModule,
} from 'lib/echarts/charts/registry';

describe('resolveChartModule', () => {
  it('routes the heatmap family (composite panel) to the heatmap module', () => {
    expect(resolveChartModule('heatmap')).toBe(heatmapChartModule);
  });

  it('routes cartesian types to the cartesian module (panel identity fixes the family)', () => {
    // A heatmap-tagged frame no longer forces heatmap rendering here: the
    // cartesian panel stays cartesian and never overlays the heatmap composite.
    // Data-driven heatmap detection lives in the suggestions supplier instead.
    expect(resolveChartModule('line')).toBe(cartesianChartModule);
    expect(resolveChartModule('bar')).toBe(cartesianChartModule);
  });

  it('routes pie and radar to their modules', () => {
    expect(resolveChartModule('pie')).toBe(pieChartModule);
    expect(resolveChartModule('radar')).toBe(radarChartModule);
  });

  it('returns null for unsupported types', () => {
    expect(resolveChartModule('gauge')).toBeNull();
  });

  it('lists all supported series types', () => {
    expect(supportedChartSeriesTypes).toEqual(
      expect.arrayContaining(['line', 'bar', 'scatter', 'effectScatter', 'heatmap', 'pie', 'radar'])
    );
  });
});
