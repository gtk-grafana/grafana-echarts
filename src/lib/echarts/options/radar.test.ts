import { createTheme } from '@grafana/data';
import { type VizLegendOptions } from '@grafana/schema';
import { RADAR_FILL_AREA_OPACITY } from 'editor/radar';
import { type RadarIndicator } from 'lib/echarts/converters/radar';
import {
  ADVANCED_RADAR_DEFAULTS,
  applyRadarEditorModeDefaults,
  getRadarAreaStyle,
  getRadarComponent,
  getRadarLineStyle,
  getRadarSymbol,
} from 'lib/echarts/options/radar';
import { type PanelOptions } from 'types';

describe('getRadarAreaStyle', () => {
  it('fills with a uniform opacity when enabled', () => {
    expect(getRadarAreaStyle(true)).toEqual({ opacity: RADAR_FILL_AREA_OPACITY });
  });

  it('returns undefined when off/unset (outlines only)', () => {
    expect(getRadarAreaStyle(false)).toBeUndefined();
    expect(getRadarAreaStyle(undefined)).toBeUndefined();
  });
});

describe('getRadarLineStyle', () => {
  it('sets the width for a positive value', () => {
    expect(getRadarLineStyle(4)).toEqual({ width: 4 });
  });

  it('returns undefined at unset/≤0 (ECharts default stroke)', () => {
    expect(getRadarLineStyle(0)).toBeUndefined();
    expect(getRadarLineStyle(undefined)).toBeUndefined();
  });
});

describe('getRadarSymbol', () => {
  it('returns {} for unset (ECharts default marker)', () => {
    expect(getRadarSymbol(undefined)).toEqual({});
  });

  it('hides the markers at 0', () => {
    expect(getRadarSymbol(0)).toEqual({ symbol: 'none' });
  });

  it('sets the symbol size for a positive value', () => {
    expect(getRadarSymbol(10)).toEqual({ symbolSize: 10 });
  });
});

describe('getRadarComponent', () => {
  const theme = createTheme();
  const indicator: RadarIndicator[] = [
    { name: 'Speed', max: 80 },
    { name: 'Power', max: 90 },
  ];

  it('keeps the indicators and omits shape/splitNumber at their defaults', () => {
    expect(getRadarComponent(indicator, 'polygon', undefined, theme)).not.toHaveProperty('shape');
    expect(getRadarComponent(indicator, undefined, 0, theme)).not.toHaveProperty('splitNumber');
    expect(getRadarComponent(indicator, 'polygon', undefined, theme).indicator).toBe(indicator);
  });

  it('emits circle shape when selected', () => {
    expect(getRadarComponent(indicator, 'circle', undefined, theme).shape).toBe('circle');
  });

  it('emits the ring count when set', () => {
    expect(getRadarComponent(indicator, 'polygon', 8, theme).splitNumber).toBe(8);
  });

  // ECharts' own 50% is a quarter of the panel's smaller dimension, which left
  // the web small in the middle of an otherwise empty canvas.
  it('grows the web well past the ECharts default', () => {
    expect(getRadarComponent(indicator, 'polygon', undefined, theme).radius).toBe('75%');
  });

  // Radar cannot reserve space via a layout box (`RadarModel` has no
  // `layoutMode`), so it shrinks to make room for a native legend instead.
  it('shrinks the web for a native ECharts legend only', () => {
    const bottom = { placement: 'bottom' } as VizLegendOptions;
    const right = { placement: 'right' } as VizLegendOptions;
    expect(getRadarComponent(indicator, 'polygon', undefined, theme, bottom).radius).toBe('62%');
    expect(getRadarComponent(indicator, 'polygon', undefined, theme, right).radius).toBe('62%');
    // A Grafana DOM legend passes nothing — `VizLayout` already shrank the canvas.
    expect(getRadarComponent(indicator, 'polygon', undefined, theme, undefined).radius).toBe('75%');
  });

  // Same mismatch the parallel axis labels had: ECharts' own indicator-name
  // color is a muted grey, dimmer than every other panel's labels.
  it('themes the indicator names', () => {
    expect(getRadarComponent(indicator, 'polygon', undefined, theme).axisName).toMatchObject({
      color: theme.colors.text.primary,
      fontFamily: theme.typography.fontFamily,
      fontSize: 12,
    });
  });
});

describe('applyRadarEditorModeDefaults', () => {
  const withMode = (editorMode: PanelOptions['editorMode'], extra: Partial<PanelOptions> = {}): PanelOptions =>
    ({ editorMode, ...extra }) as PanelOptions;

  it('forces advanced options back to their defaults in Default mode', () => {
    const resolved = applyRadarEditorModeDefaults(withMode('default', { radarShape: 'circle', radarLineWidth: 4 }));
    expect(resolved.radarShape).toBe(ADVANCED_RADAR_DEFAULTS.radarShape);
    expect(resolved.radarLineWidth).toBe(ADVANCED_RADAR_DEFAULTS.radarLineWidth);
  });

  // Asserted against the default rather than a literal: animation is off by
  // default for every family, so the point is that Default mode *resets* the
  // stored value, whichever way the default points. Mirrors the pie's test.
  it('resets the shared animation option in Default mode', () => {
    const resolved = applyRadarEditorModeDefaults(withMode('default', { animation: { enabled: true } }));
    expect(resolved.animation).toEqual(ADVANCED_RADAR_DEFAULTS.animation);
  });

  it('keeps the Default-tier fill area (never reset)', () => {
    const resolved = applyRadarEditorModeDefaults(withMode('default', { radarFillArea: true }));
    expect(resolved.radarFillArea).toBe(true);
  });

  it('passes stored advanced values through untouched in Advanced mode', () => {
    const options = withMode('advanced', { radarShape: 'circle', radarSplitNumber: 8 });
    expect(applyRadarEditorModeDefaults(options)).toBe(options);
  });
});
