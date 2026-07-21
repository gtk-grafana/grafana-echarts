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
  const indicator: RadarIndicator[] = [
    { name: 'Speed', max: 80 },
    { name: 'Power', max: 90 },
  ];

  it('keeps the indicators and omits shape/splitNumber at their defaults', () => {
    expect(getRadarComponent(indicator, 'polygon', undefined)).toEqual({ indicator });
    expect(getRadarComponent(indicator, undefined, 0)).toEqual({ indicator });
  });

  it('emits circle shape when selected', () => {
    expect(getRadarComponent(indicator, 'circle', undefined)).toEqual({ indicator, shape: 'circle' });
  });

  it('emits the ring count when set', () => {
    expect(getRadarComponent(indicator, 'polygon', 8)).toEqual({ indicator, splitNumber: 8 });
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

  it('resets the shared animation option in Default mode', () => {
    const resolved = applyRadarEditorModeDefaults(withMode('default', { animation: { enabled: false } }));
    expect(resolved.animation).toEqual({ enabled: true });
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
