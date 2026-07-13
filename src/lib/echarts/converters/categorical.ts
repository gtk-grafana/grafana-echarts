import { type GrafanaTheme2 } from '@grafana/data';
import { type EChartsFieldConfig } from 'editor/types';
import { findCategoricalFrame, mapNumericFields, resolveCategories } from 'lib/echarts/converters/frames';
import { type FieldTypedDataFrame } from 'lib/grafana/types';

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
export function frameToCategorical(
  series: Array<FieldTypedDataFrame<number, EChartsFieldConfig>>,
  theme: GrafanaTheme2
) {
  const frame = findCategoricalFrame(series);

  if (!frame) {
    return null;
  }

  const categories = resolveCategories(frame);
  const categoricalSeries = mapNumericFields(frame, series, theme).map(({ field, name, color }) => ({
    name,
    values: field.values,
    color,
  }));

  return { categories, series: categoricalSeries };
}
