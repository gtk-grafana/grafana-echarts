import { type DataFrame, type GrafanaTheme2 } from '@grafana/data';
import { frameToCategorical } from 'lib/echarts/converters/categorical';
import { getPaletteColorByIndex } from 'lib/echarts/style';

/**
 * A single pie slice: a named category and its numeric value.
 *
 * `itemStyle.color` is taken from Grafana's classic palette by slice index,
 * mirroring how Core's pie panel colors slices by category.
 *
 * See https://echarts.apache.org/en/option.html#series-pie.data
 */
export interface PieSlice {
  name: string;
  value: number | null;
  itemStyle: { color: string };
}

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
 */
export function pieToEChartsOption(series: DataFrame[], theme: GrafanaTheme2): PieSlice[] | null {
  const categorical = frameToCategorical(series, theme);

  if (!categorical) {
    return null;
  }

  const [firstSeries] = categorical.series;

  return categorical.categories.map((name, row) => ({
    name,
    value: firstSeries.values[row],
    itemStyle: { color: getPaletteColorByIndex(row, theme) },
  }));
}
