import { DataFrame, GrafanaTheme2 } from '@grafana/data';
import { findCategoricalFrame, mapNumericFields, resolveCategories } from 'lib/echarts/converters/frames';

/**
 * One numeric series projected over the shared category axis.
 *
 * `values` is positional: `values[i]` belongs to `categories[i]`. Missing cells
 * are `null` (a gap) rather than `0`.
 *
 * `color` is resolved from the field's standard Color scheme config so each
 * series matches Grafana.
 */
export interface CategoricalSeries {
  name: string;
  values: Array<number | null>;
  color: string;
}

/**
 * The shared, chart-agnostic shape for "tabular" frames: a single set of
 * categories plus one numeric series per numeric field.
 *
 * This is the common intermediate behind every categorical ECharts type
 * (radar, pie, funnel, category bar/line, parallel). Each chart's converter is
 * a thin adapter that reshapes this into the option that chart expects.
 */
export interface CategoricalData {
  categories: string[];
  series: CategoricalSeries[];
}

/**
 * Extract the categorical model from Grafana data frames.
 *
 * Mapping:
 * - The first string field's row values become the shared categories. With no
 *   string field we fall back to row indices ("0", "1", ...).
 * - Each numeric field becomes one series, whose positional `values` array is
 *   that field's values across the rows.
 *
 * See https://grafana.com/developers/dataplane/
 *
 * Design trade-offs and risks (shared by all categorical charts):
 * - Single frame only: we use the first frame that has at least one numeric
 *   field and ignore the rest. Multi-frame responses (e.g. the time series Multi
 *   format) are NOT merged.
 * - Time fields are ignored; categorical charts are not time-based.
 * - Values are positional and assume every numeric field aligns row-for-row with
 *   the category field. Fields of differing lengths yield `null` on the longer
 *   axes.
 * - No cap on category/series counts; very wide frames can be unreadable.
 *
 * Returns `null` when no frame has a numeric field, so callers can fall back to
 * a no-data view.
 *
 * @todo should be able to select the string field instead of using the first
 */
export function frameToCategorical(series: DataFrame[], theme: GrafanaTheme2): CategoricalData | null {
  const frame = findCategoricalFrame(series);

  if (!frame) {
    return null;
  }

  const categories = resolveCategories(frame);
  const categoricalSeries: CategoricalSeries[] = mapNumericFields(frame, series, theme).map(
    ({ field, name, color }) => ({
      name,
      values: Array.from({ length: frame.length }, (_, row) => field.values[row] ?? null),
      color,
    })
  );

  return { categories, series: categoricalSeries };
}
