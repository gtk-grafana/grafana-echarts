import { type BarStyleConfig } from 'editor/types';

/** ECharts bar `itemStyle`: series color plus optional per-series styling. */
export interface BarItemStyle {
  color: string;
  borderWidth?: number;
  borderType?: string;
  borderRadius?: number;
  opacity?: number;
}

/**
 * Bar series properties layered on top of the base series (`itemStyle` plus the
 * top-level bar sizing/background/gap keys). Only defined keys are emitted so
 * ECharts' own defaults are preserved for anything the user left unset.
 */
export interface BarSeriesExtras {
  itemStyle: BarItemStyle;
  barWidth?: number;
  barMaxWidth?: number;
  barMinHeight?: number;
  barGap?: string;
  barCategoryGap?: string;
  showBackground?: boolean;
  backgroundStyle?: { color?: string };
}

/** Assign `value` to `target[key]` only when `value` is defined. */
function assignIfSet<T, K extends keyof T>(target: T, key: K, value: T[K] | undefined): void {
  if (value !== undefined) {
    target[key] = value;
  }
}

/**
 * Build the ECharts bar-series props for one series.
 *
 * Per-series properties (width/border/opacity/background) merge with the field
 * override winning over the panel default. The coordinate-system-global gaps
 * come only from the panel config; `barGap` is dropped when the series is
 * stacked (series overlap, so the inter-series gap is meaningless).
 */
export function buildBarStyle(
  panelBar: BarStyleConfig | undefined,
  fieldBar: BarStyleConfig | undefined,
  color: string,
  stacked: boolean
): BarSeriesExtras {
  const pick = <K extends keyof BarStyleConfig>(key: K): BarStyleConfig[K] => fieldBar?.[key] ?? panelBar?.[key];

  const itemStyle: BarItemStyle = { color };
  assignIfSet(itemStyle, 'borderWidth', pick('borderWidth'));
  assignIfSet(itemStyle, 'borderType', pick('borderType'));
  assignIfSet(itemStyle, 'borderRadius', pick('borderRadius'));
  assignIfSet(itemStyle, 'opacity', pick('opacity'));

  const extras: BarSeriesExtras = { itemStyle };
  assignIfSet(extras, 'barWidth', pick('width'));
  assignIfSet(extras, 'barMaxWidth', pick('maxWidth'));
  assignIfSet(extras, 'barMinHeight', pick('minHeight'));

  // Gaps are shared across the coordinate system, so only the panel config
  // contributes them; barGap is irrelevant once series are stacked.
  if (!stacked) {
    assignIfSet(extras, 'barGap', panelBar?.gap);
  }
  assignIfSet(extras, 'barCategoryGap', panelBar?.categoryGap);

  const showBackground = pick('showBackground');
  if (showBackground) {
    extras.showBackground = true;
    const backgroundColor = pick('backgroundColor');
    if (backgroundColor !== undefined) {
      extras.backgroundStyle = { color: backgroundColor };
    }
  }

  return extras;
}
