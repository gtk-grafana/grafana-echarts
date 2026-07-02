/**
 * Format a numeric bucket bound compactly (integers stay bare, others get 3 sig figs).
 * Infinity uses Prometheus-style +/-Inf labels.
 */
export function formatBucketBound(value: number): string {
  if (!Number.isFinite(value)) {
    return value > 0 ? '+Inf' : '-Inf';
  }
  return Number.isInteger(value) ? String(value) : String(Number(value.toPrecision(3)));
}
