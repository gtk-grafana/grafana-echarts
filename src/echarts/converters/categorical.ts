import { DataFrame, Field, FieldType, getFieldDisplayName } from '@grafana/data';

/**
 * One numeric series projected over the shared category axis.
 *
 * `values` is positional: `values[i]` belongs to `categories[i]`. Missing cells
 * are `null` (a gap) rather than `0`.
 */
export interface CategoricalSeries {
  name: string;
  values: Array<number | null>;
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
export function frameToCategorical(series: DataFrame[]): CategoricalData | null {
  const frame = series.find((candidate) => candidate.fields.some((field) => field.type === FieldType.number));

  if (!frame) {
    return null;
  }

  const numericFields = frame.fields.filter((field) => field.type === FieldType.number);
  const categoryField = frame.fields.find((field) => field.type === FieldType.string);

  const rowCount = frame.length;
  const categories: string[] = Array.from({ length: rowCount }, (_, row) =>
    categoryField ? String(categoryField.values[row] ?? row) : String(row)
  );

  const categoricalSeries: CategoricalSeries[] = numericFields.map((field: Field) => ({
    name: getFieldDisplayName(field, frame, series),
    // `?? null` coerces missing/undefined cells to a gap while preserving 0.
    values: Array.from({ length: rowCount }, (_, row) => field.values[row] ?? null),
  }));

  return { categories, series: categoricalSeries };
}
