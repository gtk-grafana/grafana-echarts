import { type DataFrame } from '@grafana/data';
import { type SeriesType, type SeriesTypeOption } from 'editor/types';
import { resolveMultiValueSeriesType } from 'lib/echarts/converters/multiValueCartesian';

/**
 * A nested ECharts panel family. Each nested plugin registers exactly one, fixed
 * by the plugin's identity (see each `modules/<family>/module.tsx`).
 */
export type ChartFamily = 'cartesian' | 'heatmap' | 'part-to-whole' | 'multivariate' | 'hierarchy';

/**
 * Resolve `'Auto'` (or an unset series type) to a concrete `SeriesType`, scoped
 * to the panel's `family`.
 *
 * Auto is family-scoped on purpose: because every nested panel fixes its family,
 * Auto must never pick a type another family owns. A heatmap panel viewing an
 * untagged matrix frame stays `'heatmap'` instead of falling through to radar —
 * and since the heatmap/pie/radar families are single-render there is no other
 * type Auto could (or should) choose for them.
 *
 * Only the cartesian family has intra-family frame ambiguity: a multi-value
 * frame (candlestick OHLC / boxplot five-number summary, detected by field-name
 * convention) renders differently from a plain line/bar frame. The other
 * families are single-render and resolve to their one type.
 */
export function resolveAutoSeriesType(family: ChartFamily, frames: DataFrame[]): SeriesType {
  switch (family) {
    case 'cartesian':
      return resolveMultiValueSeriesType(frames) ?? 'line';
    case 'heatmap':
      return 'heatmap';
    case 'part-to-whole':
      return 'pie';
    case 'multivariate':
      return 'radar';
    case 'hierarchy':
      return 'treemap';
  }
}

/**
 * Normalize a series-type selection to a concrete `SeriesType`. Concrete values
 * pass through unchanged; the `'Auto'` sentinel — and a missing value, as on a
 * freshly added panel — is resolved from the data within the panel's `family`.
 */
export function resolveSeriesType(
  seriesType: SeriesTypeOption | undefined,
  frames: DataFrame[],
  family: ChartFamily
): SeriesType {
  if (seriesType == null || seriesType === 'Auto') {
    return resolveAutoSeriesType(family, frames);
  }
  return seriesType;
}
