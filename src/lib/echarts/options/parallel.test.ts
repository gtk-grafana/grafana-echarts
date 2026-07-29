import { createTheme } from '@grafana/data';
import { type VizLegendOptions } from '@grafana/schema';
import {
  ADVANCED_PARALLEL_DEFAULTS,
  applyParallelEditorModeDefaults,
  getParallelComponent,
  getParallelLineStyle,
} from 'lib/echarts/options/parallel';
import { type PanelOptions } from 'types';

const theme = createTheme();

describe('getParallelComponent', () => {
  it('omits the layout at the horizontal default', () => {
    expect(getParallelComponent('horizontal', theme).layout).toBeUndefined();
    expect(getParallelComponent(undefined, theme).layout).toBeUndefined();
  });

  it('emits the vertical layout when selected', () => {
    expect(getParallelComponent('vertical', theme).layout).toBe('vertical');
  });

  // `parallel` has no `containLabel`, so the box is the only thing keeping the
  // chart off ECharts' 80/80/60/60 defaults — which spent well over half a
  // panel on padding.
  it('reserves a tight layout box instead of ECharts defaults', () => {
    const component = getParallelComponent('horizontal', theme);
    // `top` = nameGap + half a line, because the axis names sit a gap above the
    // axes; names also overhang the outer axes, hence the wider sides.
    expect(component).toMatchObject({ top: 31, bottom: 16, left: 40, right: 40 });
  });

  it('gives the vertical layout a right-hand name column', () => {
    // Axes are horizontal now and ECharts draws each name past the *right* end
    // of its axis, left-aligned — so this side is a name column, not padding.
    // Too small and the names render off the canvas entirely. `top` owes only
    // half a line here: the name is centred on the axis, not offset above it.
    expect(getParallelComponent('vertical', theme)).toMatchObject({ top: 16, bottom: 24, left: 16, right: 80 });
  });

  // Regression: the first cut of these boxes sized the name row from jsdom
  // anchor positions plus a guessed glyph height, and clipped the top of the
  // axis names in a real browser. The name row has to clear a whole gap *and*
  // half a line of text.
  it('leaves the horizontal name row taller than the gap alone', () => {
    const { top } = getParallelComponent('horizontal', theme);
    expect(top).toBeGreaterThan(getParallelComponent('vertical', theme).top as number);
    expect(top).toBeGreaterThanOrEqual(15 + 16);
  });

  it('reserves extra room only for a native ECharts legend', () => {
    const bottom = getParallelComponent('horizontal', theme, { placement: 'bottom' } as VizLegendOptions);
    const right = getParallelComponent('horizontal', theme, { placement: 'right' } as VizLegendOptions);
    expect(bottom.bottom).toBe(16 + 12);
    expect(right.right).toBe(40 + 12);
    // A Grafana DOM legend is laid out before the canvas exists, so it passes
    // no legend and gets no reservation.
    expect(getParallelComponent('horizontal', theme).bottom).toBe(16);
  });

  // The reported mismatch: ECharts' own axis label color is a muted grey that
  // reads dimmer than every other panel's ticks.
  it('styles axis labels and names from the theme', () => {
    const axisDefault = getParallelComponent('horizontal', theme).parallelAxisDefault;
    expect(axisDefault?.axisLabel).toMatchObject({
      color: theme.colors.text.primary,
      fontFamily: theme.typography.fontFamily,
      fontSize: 12,
    });
    expect(axisDefault?.nameTextStyle).toMatchObject({ color: theme.colors.text.primary });
    // The spine stays drawn — on parallel it carries the axis, unlike cartesian
    // where the split lines do that job.
    expect(axisDefault?.axisLine).toMatchObject({ show: true });
    expect(axisDefault?.splitLine).toBeUndefined();
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

  // Asserted against the default rather than a literal: animation is off by
  // default for every family, so the point is that Default mode *resets* the
  // stored value, whichever way the default points. Mirrors the pie's test.
  it('resets the shared animation option in Default mode', () => {
    const resolved = applyParallelEditorModeDefaults(withMode('default', { animation: { enabled: true } }));
    expect(resolved.animation).toEqual(ADVANCED_PARALLEL_DEFAULTS.animation);
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
