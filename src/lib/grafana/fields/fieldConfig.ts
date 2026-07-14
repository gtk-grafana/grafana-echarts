import { type Field, type FieldConfig } from '@grafana/data';
import type { EChartsFieldConfig } from 'editor/types';
import { sampleByStride } from 'lib/grafana/sampling';
import { type ConfigTypedField } from 'lib/grafana/types';

export function getFieldConfigFromField<V>(
  field: ConfigTypedField<V, EChartsFieldConfig>
): FieldConfig<EChartsFieldConfig> {
  return field.config;
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
