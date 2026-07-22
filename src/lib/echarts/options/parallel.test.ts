import {
  ADVANCED_PARALLEL_DEFAULTS,
  applyParallelEditorModeDefaults,
  getParallelComponent,
  getParallelLineStyle,
} from 'lib/echarts/options/parallel';
import { type PanelOptions } from 'types';

describe('getParallelComponent', () => {
  it('omits the layout at the horizontal default', () => {
    expect(getParallelComponent('horizontal')).toEqual({});
    expect(getParallelComponent(undefined)).toEqual({});
  });

  it('emits the vertical layout when selected', () => {
    expect(getParallelComponent('vertical')).toEqual({ layout: 'vertical' });
  });
});

describe('getParallelLineStyle', () => {
  it('returns undefined when neither width nor opacity is set (ECharts default stroke)', () => {
    expect(getParallelLineStyle(undefined, undefined)).toBeUndefined();
    expect(getParallelLineStyle(0, undefined)).toBeUndefined();
  });

  it('sets the width for a positive value', () => {
    expect(getParallelLineStyle(3, undefined)).toEqual({ width: 3 });
  });

  it('scales opacity from 0–100 to ECharts 0–1', () => {
    expect(getParallelLineStyle(undefined, 50)).toEqual({ opacity: 0.5 });
  });

  it('combines width and opacity', () => {
    expect(getParallelLineStyle(2, 100)).toEqual({ width: 2, opacity: 1 });
  });
});

describe('applyParallelEditorModeDefaults', () => {
  const withMode = (editorMode: PanelOptions['editorMode'], extra: Partial<PanelOptions> = {}): PanelOptions =>
    ({ editorMode, ...extra }) as PanelOptions;

  it('forces advanced options back to their defaults in Default mode', () => {
    const resolved = applyParallelEditorModeDefaults(
      withMode('default', { parallelLayout: 'vertical', parallelLineWidth: 4 })
    );
    expect(resolved.parallelLayout).toBe(ADVANCED_PARALLEL_DEFAULTS.parallelLayout);
    expect(resolved.parallelLineWidth).toBe(ADVANCED_PARALLEL_DEFAULTS.parallelLineWidth);
  });

  it('resets the shared animation option in Default mode', () => {
    const resolved = applyParallelEditorModeDefaults(withMode('default', { animation: { enabled: false } }));
    expect(resolved.animation).toEqual({ enabled: true });
  });

  it('keeps the Default-tier smooth (never reset)', () => {
    const resolved = applyParallelEditorModeDefaults(withMode('default', { parallelSmooth: true }));
    expect(resolved.parallelSmooth).toBe(true);
  });

  it('passes stored advanced values through untouched in Advanced mode', () => {
    const options = withMode('advanced', { parallelLayout: 'vertical', parallelLineOpacity: 30 });
    expect(applyParallelEditorModeDefaults(options)).toBe(options);
  });
});
