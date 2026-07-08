import { LegendDisplayMode, type VizLegendOptions } from '@grafana/schema';
import { getPanelLayout, resolveLegendWidthPx } from './layout';

const legend = (overrides: Partial<VizLegendOptions> = {}): VizLegendOptions => ({
  showLegend: true,
  displayMode: LegendDisplayMode.List,
  placement: 'bottom',
  calcs: [],
  ...overrides,
});

describe('resolveLegendWidthPx', () => {
  it('returns numeric pixel widths unchanged', () => {
    expect(resolveLegendWidthPx(220, 1000)).toBe(220);
  });

  it('resolves bare numeric strings as pixels', () => {
    expect(resolveLegendWidthPx('220', 1000)).toBe(220);
  });

  it('resolves explicit px strings as pixels', () => {
    expect(resolveLegendWidthPx('220px', 1000)).toBe(220);
  });

  it('resolves percentage strings against the container width', () => {
    expect(resolveLegendWidthPx('35%', 1000)).toBe(350);
    expect(resolveLegendWidthPx('50%', 401)).toBe(201);
  });

  it('returns 0 for empty, auto, or unparseable values', () => {
    expect(resolveLegendWidthPx(undefined, 1000)).toBe(0);
    expect(resolveLegendWidthPx('', 1000)).toBe(0);
    expect(resolveLegendWidthPx('auto', 1000)).toBe(0);
    expect(resolveLegendWidthPx(0, 1000)).toBe(0);
    expect(resolveLegendWidthPx(-10, 1000)).toBe(0);
  });
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

  it('reserves a percentage width resolved against the panel width for a right legend', () => {
    const { chartWidth, legendWidth } = getPanelLayout(800, 400, legend({ placement: 'right', width: '25%' }), true);

    expect(legendWidth).toBe(200);
    expect(chartWidth).toBe(600);
  });

  it('caps the right legend at half the panel width', () => {
    const { chartWidth, legendWidth } = getPanelLayout(800, 400, legend({ placement: 'right', width: '90%' }), true);

    expect(legendWidth).toBe(400);
    expect(chartWidth).toBe(400);
  });

  it('uses the default width when a right legend width is unset', () => {
    const { legendWidth } = getPanelLayout(800, 400, legend({ placement: 'right' }), true);

    expect(legendWidth).toBe(240);
  });
});
