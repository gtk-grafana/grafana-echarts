import { type FieldConfigSource, type GrafanaTheme2 } from '@grafana/data';
import { type EChartsFieldConfig } from 'editor/types';
import type { EChartPieDataItem } from 'lib/echarts/charts/types';
import { frameToCategorical } from 'lib/echarts/converters/categorical';
import { getHiddenSeriesNames, getSeriesColorOverride } from 'lib/grafana/fields/seriesConfig';
import { getPaletteColorByIndex } from 'lib/echarts/style';
import { type FieldTypedDataFrame } from 'lib/grafana/types';

/**
 * Convert Grafana data frames into ECharts pie slices.
 *
 * This is a thin adapter over the shared categorical model
 * (see echarts/converters/categorical.ts): each category becomes a slice, and
 * the slice value comes from the FIRST numeric series.
 *
 * Design trade-offs and risks:
 * - A pie shows a single series, so only the first numeric field is used; any
 *   additional numeric fields are ignored. (ECharts supports multiple nested pie
 *   rings, but that is intentionally out of scope here.)
 * - Inherits the categorical model's trade-offs (single frame, time fields
 *   ignored, positional alignment).
 * - Negative or null values do not render as meaningful slices; nulls are passed
 *   through and effectively contribute nothing to the pie.
 *
 * Returns `null` when no usable categorical data can be derived.
 *
 * Slices are rows of a single field, so per-slice legend interactions cannot use
 * Grafana's field-override engine: hidden slices are read from `fieldConfig` by
 * category name and dropped, and a per-slice color override wins over the
 * palette (see `lib/grafana/fields/seriesConfig.ts`).
 */
export function pieToEChartsOption(
  series: Array<FieldTypedDataFrame<number, EChartsFieldConfig>>,
  theme: GrafanaTheme2,
  fieldConfig: FieldConfigSource
): EChartPieDataItem[] | null {
  const categorical = frameToCategorical(series, theme);

  if (!categorical) {
    return null;
  }

  const [firstSeries] = categorical.series;
  const hidden = getHiddenSeriesNames(fieldConfig);

  const slices: EChartPieDataItem[] = [];
  categorical.categories.forEach((name, row) => {
    if (hidden.has(name)) {
      return;
    }
    slices.push({
      name,
      // ECharts pie values are numeric-only; map Grafana nulls to undefined so
      // missing points render as empty slices instead of failing the type.
      value: firstSeries.values[row] ?? undefined,
      // Palette color is keyed by the original row so visible slices keep stable
      // colors when others are hidden; a fixed-color override wins.
      itemStyle: { color: getSeriesColorOverride(fieldConfig, name) ?? getPaletteColorByIndex(row, theme) },
    });
  });

  return slices;
}
