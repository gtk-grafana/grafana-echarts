import { type RadarComponentOption, type RadarSeriesOption } from 'echarts';
import { type ECBasicOption } from 'echarts/types/dist/shared';
import {
  RADAR_ANIMATION_ENABLED_DEFAULT,
  RADAR_FILL_AREA_OPACITY,
  RADAR_LINE_WIDTH_DEFAULT,
  RADAR_SHAPE_DEFAULT,
  RADAR_SPLIT_NUMBER_DEFAULT,
  RADAR_SYMBOL_SIZE_DEFAULT,
} from 'editor/radar';
import { type RadarShape } from 'editor/types';
import { type RadarIndicator } from 'lib/echarts/converters/radar';
import { createBaseOptions } from 'lib/echarts/options/base';
import { applyAdvancedDefaults } from 'lib/echarts/options/editorMode';
import { type PanelOptions } from 'types';

/** Base option for radar charts. Indicator and series data are merged at render time. */
export const radarDefaultOptions: ECBasicOption = {
  ...createBaseOptions({ includeLegend: true }),
};

/* --- Radar option builders (parity uplift) -----------------------------------
 * Each helper omits its ECharts key at the default so an untouched radar renders
 * exactly as before, and only opted-in options add keys. */

/**
 * ECharts radar `series.areaStyle` for the Default-tier "Fill area" toggle: a
 * uniform-opacity fill under each polygon. Off/unset returns `undefined` so the
 * polygons are outlined only (unchanged). The per-polygon color is ECharts'
 * default (the series color), so the fill matches each polygon.
 * https://echarts.apache.org/en/option.html#series-radar.areaStyle
 */
export function getRadarAreaStyle(fillArea: boolean | undefined): RadarSeriesOption['areaStyle'] | undefined {
  return fillArea ? { opacity: RADAR_FILL_AREA_OPACITY } : undefined;
}

/**
 * ECharts radar `series.lineStyle` from the Advanced "Line width". Omitted at
 * unset/≤0 so ECharts' default stroke stands.
 * https://echarts.apache.org/en/option.html#series-radar.lineStyle.width
 */
export function getRadarLineStyle(lineWidth: number | undefined): RadarSeriesOption['lineStyle'] | undefined {
  return lineWidth != null && lineWidth > 0 ? { width: lineWidth } : undefined;
}

/**
 * ECharts radar symbol keys from the Advanced "Symbol size": `0` hides the vertex
 * markers (`symbol: 'none'`), a positive value sets `symbolSize`, and unset
 * returns `{}` (ECharts' default marker).
 * https://echarts.apache.org/en/option.html#series-radar.symbolSize
 */
export function getRadarSymbol(symbolSize: number | undefined): { symbol?: 'none'; symbolSize?: number } {
  if (symbolSize == null) {
    return {};
  }
  return symbolSize <= 0 ? { symbol: 'none' } : { symbolSize };
}

/**
 * The ECharts `radar` coordinate component: the data-derived `indicator` axes
 * plus the Advanced "Shape" (`polygon` default / `circle`) and "Rings"
 * (`splitNumber`). Each Advanced key is omitted at its default so the default
 * radar grid is unchanged.
 * https://echarts.apache.org/en/option.html#radar
 */
export function getRadarComponent(
  indicator: RadarIndicator[],
  shape: RadarShape | undefined,
  splitNumber: number | undefined
): RadarComponentOption {
  return {
    indicator,
    ...(shape === 'circle' ? { shape: 'circle' } : {}),
    ...(splitNumber != null && splitNumber > 0 ? { splitNumber } : {}),
  };
}

/**
 * Default values for every Advanced-gated radar option, keyed by its
 * `PanelOptions` path. Spread over the stored options in Default editor mode (see
 * `applyRadarEditorModeDefaults`) so a panel with Advanced values configured and
 * then hidden renders exactly like an untouched radar. The Default-tier
 * `radarFillArea` is intentionally absent (it is never hidden). `animation` is
 * included so Default mode restores animation too. Mirrors `ADVANCED_PIE_DEFAULTS`.
 */
export const ADVANCED_RADAR_DEFAULTS: Partial<PanelOptions> = {
  radarShape: RADAR_SHAPE_DEFAULT,
  radarLineWidth: RADAR_LINE_WIDTH_DEFAULT,
  radarSymbolSize: RADAR_SYMBOL_SIZE_DEFAULT,
  radarSplitNumber: RADAR_SPLIT_NUMBER_DEFAULT,
  animation: { enabled: RADAR_ANIMATION_ENABLED_DEFAULT },
};

/**
 * Normalize a radar panel's options for rendering by editor mode: Default mode
 * spreads `ADVANCED_RADAR_DEFAULTS` over them so hidden Advanced values don't
 * affect the render; Advanced / API mode passes them through. Registered in the
 * `editorMode.ts` dispatch for the multivariate family.
 */
export function applyRadarEditorModeDefaults(options: PanelOptions): PanelOptions {
  return applyAdvancedDefaults(options, ADVANCED_RADAR_DEFAULTS);
}
