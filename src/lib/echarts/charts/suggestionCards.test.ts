import { LegendDisplayMode } from '@grafana/schema';
import { previewCardOptions } from 'lib/echarts/charts/suggestionCards';
import { PREVIEW_MAX_SERIES } from 'lib/echarts/charts/suggestionLimits';
import { type PanelOptions } from 'types';

describe('previewCardOptions', () => {
  it('caps series by default and leaves rows unbounded', () => {
    const cardOptions = previewCardOptions();

    expect(cardOptions.maxSeries).toBe(PREVIEW_MAX_SERIES);
    expect(cardOptions).not.toHaveProperty('maxRows');
  });

  it('applies the caps it is given', () => {
    expect(previewCardOptions({ maxSeries: 3, maxRows: 25 })).toMatchObject({ maxSeries: 3, maxRows: 25 });
  });

  // A bare card (`{ score }`, no options object) is the shape several suppliers
  // emit, and core Grafana's own preview modifiers would throw on it.
  it('modifies a card that carries no options object without throwing', () => {
    const suggestion: { options?: Partial<PanelOptions> } = {};

    expect(() => previewCardOptions().previewModifier(suggestion)).not.toThrow();
    expect(suggestion.options?.legend?.showLegend).toBe(false);
  });

  it('hides the legend and disarms per-point rendering', () => {
    const suggestion: { options?: Partial<PanelOptions> } = { options: { seriesType: 'line' } };

    previewCardOptions().previewModifier(suggestion);

    expect(suggestion.options?.legend?.showLegend).toBe(false);
    expect(suggestion.options?.performance).toEqual({ showPoints: 'never', downsampling: true });
    // The card's own options survive the modifier.
    expect(suggestion.options?.seriesType).toBe('line');
  });

  it('merges per-family overrides over the shared degradations', () => {
    const suggestion: { options?: Partial<PanelOptions> } = { options: { seriesType: 'pie' } };

    previewCardOptions({ options: { displayLabels: [] } }).previewModifier(suggestion);

    expect(suggestion.options?.displayLabels).toEqual([]);
    expect(suggestion.options?.legend?.showLegend).toBe(false);
  });

  it('keeps a legend the card configured, forcing only visibility', () => {
    const suggestion: { options?: Partial<PanelOptions> } = {
      options: {
        legend: { showLegend: true, displayMode: LegendDisplayMode.Table, placement: 'right', calcs: ['sum'] },
      },
    };

    previewCardOptions().previewModifier(suggestion);

    expect(suggestion.options?.legend).toMatchObject({ showLegend: false, placement: 'right', calcs: ['sum'] });
  });
});
