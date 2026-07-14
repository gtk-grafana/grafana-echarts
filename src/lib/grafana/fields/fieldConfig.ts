import { type DataFrame, type Field, type FieldConfig } from '@grafana/data';
import type { EChartsFieldConfig } from 'editor/types';
import { sampleByStride } from 'lib/grafana/sampling';
import { isNumberField } from 'lib/grafana/narrowing';
import { type ConfigTypedField } from 'lib/grafana/types';

export function getFieldConfigFromField<V>(
  field: ConfigTypedField<V, EChartsFieldConfig>
): FieldConfig<EChartsFieldConfig> {
  return field.config;
}

/**
 * Whether a field is hidden from the visualization via the standard
 * `custom.hideFrom.viz` field config (the legend visibility toggle writes this
 * as a `byName` override; Grafana applies it before the panel renders). The
 * series is still shown in the legend (greyed) so callers keep the legend item.
 * https://grafana.com/docs/grafana/latest/panels-visualizations/configure-standard-options/
 */
export function isFieldHiddenFromViz(field: Field): boolean {
  return getFieldConfigFromField(field).custom?.hideFrom?.viz === true;
}

/**
 * Drop numeric value fields flagged `hideFrom.viz` so per-field chart families
 * (cartesian, radar, heatmap overlays) skip them consistently across series,
 * axis, and tooltip building. Non-numeric fields (time/category) are retained
 * and frames stay square (whole columns are removed, so row counts are unchanged).
 */
export function stripHiddenValueFields(frames: DataFrame[]): DataFrame[] {
  return frames.map((frame) => ({
    ...frame,
    fields: frame.fields.filter((field) => !(isNumberField(field) && isFieldHiddenFromViz(field))),
  }));
}

/**
 * Explicit axis bounds from the standard Min/Max options (`field.config.min` /
 * `field.config.max`). Only user-set (soft) bounds are returned; an unset side
 * stays `undefined` so callers can let ECharts auto-fit it (`scale: true`).
 *
 * These are independent of the "Field min/max" toggle (`config.fieldMinMax`),
 * which only changes how the *auto-calculated* range is derived (per-field vs.
 * across all fields) for percentage thresholds / by-value color, not the axis.
 * https://grafana.com/docs/grafana/latest/panels-visualizations/configure-standard-options/
 */
export function getFieldMinMax(field: Field): { min?: number; max?: number } {
  // Cleared bounds are saved as `null`; normalize to `undefined` so callers can
  // treat "no bound" uniformly (while keeping a legitimate `0`).
  return { min: field.config.min ?? undefined, max: field.config.max ?? undefined };
}

/**
 * Text to render for empty (null/NaN) values, from the standard "No value"
 * option (`field.config.noValue`), defaulting to Grafana's documented hyphen.
 */
export function getNoValueText(field: Field): string {
  return field.config.noValue ?? '-';
}

// Cap derived precision so short-formatted values stay compact.
const MAX_DECIMALS = 2;

export function getDefaultShortValueFieldConfig(field: Field<number | string>): Field {
  const decimals = getMaxDecimals(field.values, MAX_DECIMALS);
  return { ...field, config: { unit: 'short', decimals, ...field.config } };
}

/**
 * Largest number of decimal places among the sampled numeric values, capped at
 * `max`. Sampling keeps this cheap on large fields and the cap lets us stop early.
 */
function getMaxDecimals(values: Array<string | number>, max: number): number {
  let maxDecimals = 0;
  for (const value of sampleByStride(values)) {
    if (typeof value !== 'number') {
      continue;
    }
    maxDecimals = Math.max(maxDecimals, decimalCount(value));
    if (maxDecimals >= max) {
      return max;
    }
  }
  return maxDecimals;
}

function decimalCount(n: number) {
  if (!Number.isFinite(n)) {
    return 0;
  }
  // Handle exponential notation like 1e-7, which "".split('.') gets wrong
  const s = Math.abs(n).toString();
  if (s.includes('e') || s.includes('E')) {
    const [mantissa, expPart] = s.toLowerCase().split('e');
    const exp = parseInt(expPart, 10);
    const decimals = (mantissa.split('.')[1] || '').length;
    return Math.max(0, decimals - exp);
  }
  return (s.split('.')[1] || '').length;
}
