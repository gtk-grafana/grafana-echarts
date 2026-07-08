import { LegendDisplayMode, type VizLegendOptions } from '@grafana/schema';
import { getPanelLayout } from './layout';

const legend = (overrides: Partial<VizLegendOptions> = {}): VizLegendOptions => ({
  showLegend: true,
  displayMode: LegendDisplayMode.List,
  placement: 'bottom',
  calcs: [],
  ...overrides,
});

describe('getPanelLayout', () => {
  it('gives the full panel to the chart when there is no DOM legend', () => {
    expect(getPanelLayout(800, 400, legend(), false)).toEqual({
      chartWidth: 800,
      chartHeight: 400,
      legendWidth: 800,
      legendHeight: 0,
    });
  });

  it('reserves a numeric width for a right legend', () => {
    const { chartWidth, legendWidth } = getPanelLayout(800, 400, legend({ placement: 'right', width: 200 }), true);

    expect(legendWidth).toBe(200);
    expect(chartWidth).toBe(600);
  });

  it('caps the right legend at half the panel width', () => {
    const { chartWidth, legendWidth } = getPanelLayout(800, 400, legend({ placement: 'right', width: 900 }), true);

    expect(legendWidth).toBe(400);
    expect(chartWidth).toBe(400);
  });

  it('uses the default width when a right legend width is unset', () => {
    const { legendWidth } = getPanelLayout(800, 400, legend({ placement: 'right' }), true);

    expect(legendWidth).toBe(240);
  });
});
