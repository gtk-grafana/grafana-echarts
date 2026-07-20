import {
  type DataFrame,
  type DisplayValue,
  type Field,
  type FieldConfigSource,
  fieldReducers,
  FieldType,
  getDisplayProcessor,
  getFieldDisplayName,
  type GrafanaTheme2,
  type InterpolateFunction,
  type ReduceDataOptions,
  reduceField,
} from '@grafana/data';
import { type SortOrder } from '@grafana/schema';
import { type VizLegendItem } from '@grafana/ui';
import type { MultiValueSeriesType, PieLegendValue } from 'editor/types';
import { type ChartContext } from 'lib/echarts/charts/types';
import { findCategoricalFrame, forEachTimeSeriesField } from 'lib/echarts/converters/frames';
import { multiValueCartesianToEChartsOption } from 'lib/echarts/converters/multiValueCartesian';
import { formatPieShare, getPieSliceTotal, resolvePieSlices } from 'lib/echarts/converters/pie';
import { type PieSliceModel } from 'lib/echarts/converters/types';
import { getHiddenSeriesNames } from 'lib/grafana/fields/seriesConfig';
import { getSeriesColor } from 'lib/echarts/style';

/**
 * Reduce a field down to per-series calc columns for the table legend.
 */
export function getCalcDisplayValues(calcs: string[], field: Field, theme: GrafanaTheme2, timeZone?: string) {
  if (calcs.length === 0) {
    return [];
  }

  const display = field.display ?? getDisplayProcessor({ field, theme, timeZone });
  const fieldCalcs = reduceField({ field, reducers: calcs });

  return calcs.map((calc) => ({
    ...display(fieldCalcs[calc]),
    title: fieldReducers.getIfExists(calc)?.name ?? calc,
  }));
}

export function buildTimeSeriesLegendItems(
  series: DataFrame[],
  theme: GrafanaTheme2,
  calcs: string[],
  fieldConfig: FieldConfigSource,
  timeZone?: string
): VizLegendItem[] {
  const refs: Array<{ frame: DataFrame; frameIndex: number; field: Field; fieldIndex: number; label: string }> = [];
  forEachTimeSeriesField(series, ({ frame, frameIndex, field, fieldIndex }) => {
    refs.push({ frame, frameIndex, field, fieldIndex, label: getFieldDisplayName(field, frame, series) });
  });

  // Hidden state comes from `fieldConfig` so legend greys with the chart on toggle. See `getHiddenSeriesNames`.
  const hidden = getHiddenSeriesNames(
    fieldConfig,
    refs.map((ref) => ref.label)
  );

  return refs.map(({ field, frameIndex, fieldIndex, label }) => ({
    label,
    fieldName: label,
    color: getSeriesColor(field, theme),
    yAxis: 1,
    // Kept in the legend when hidden from the viz so it can be toggled back.
    disabled: hidden.has(label),
    getItemKey: () => `${frameIndex}-${fieldIndex}`,
    getDisplayValues: () => getCalcDisplayValues(calcs, field, theme, timeZone),
  }));
}

/**
 * Legend items for a category-axis cartesian chart: one entry per
 * numeric field in the categorical source frame, mirroring the series the
 * category converter emits. The time-series builder above cannot be reused
 * because it keys off a time field, which Numeric (category) frames lack.
 */
export function buildCategoryCartesianLegendItems(
  series: DataFrame[],
  theme: GrafanaTheme2,
  calcs: string[],
  fieldConfig: FieldConfigSource,
  timeZone?: string
): VizLegendItem[] {
  const frame = findCategoricalFrame(series);
  if (!frame) {
    return [];
  }

  const numericFields = frame.fields
    .map((field, fieldIndex) => ({ field, fieldIndex, label: getFieldDisplayName(field, frame, series) }))
    .filter(({ field }) => field.type === FieldType.number);

  // Hidden state from `fieldConfig` keeps the legend in lockstep with the chart.
  const hidden = getHiddenSeriesNames(
    fieldConfig,
    numericFields.map(({ label }) => label)
  );

  return numericFields.map(({ field, fieldIndex, label }) => ({
    label,
    fieldName: label,
    color: getSeriesColor(field, theme),
    yAxis: 1,
    disabled: hidden.has(label),
    getItemKey: () => `series-${fieldIndex}`,
    getDisplayValues: () => getCalcDisplayValues(calcs, field, theme, timeZone),
  }));
}

/**
 * Legend items for a multi-value cartesian chart (candlestick/boxplot). The
 * converter emits a single series per source frame, so this yields one legend
 * entry mirroring it. Table calc columns are omitted: each item is a
 * multi-dimensional array (OHLC / five-number summary), so a single reduced
 * value would be misleading.
 */
export function buildMultiValueCartesianLegendItems(ctx: ChartContext<MultiValueSeriesType>): VizLegendItem[] {
  const data = multiValueCartesianToEChartsOption(ctx);
  if (!data) {
    return [];
  }

  // The series maps to a legend item by name; keep it (greyed) when hidden so it
  // can be toggled back. The converter already applied any color override, so
  // the swatch reflects it.
  const series = Array.isArray(data.series) ? data.series : data.series ? [data.series] : [];
  const seriesNames = series.map((chartSeries) => chartSeries.name?.toString() ?? '');
  const hidden = getHiddenSeriesNames(ctx.fieldConfig, seriesNames);
  return series.map((chartSeries, index) => {
    const label = chartSeries.name?.toString() ?? '';
    return {
      label,
      fieldName: label,
      color: chartSeries.itemStyle?.color?.toString(),
      yAxis: 1,
      disabled: hidden.has(label),
      getItemKey: () => `multiValue-${index}`,
      getDisplayValues: () => [],
    };
  });
}

export function buildRadarLegendItems(
  series: DataFrame[],
  theme: GrafanaTheme2,
  calcs: string[],
  fieldConfig: FieldConfigSource,
  timeZone?: string
): VizLegendItem[] {
  const frame = findCategoricalFrame(series);
  if (!frame) {
    return [];
  }

  const numericFields = frame.fields
    .map((field, fieldIndex) => ({ field, fieldIndex, label: getFieldDisplayName(field, frame, series) }))
    .filter(({ field }) => field.type === FieldType.number);

  // Hidden state from `fieldConfig` keeps the legend in lockstep with the chart.
  const hidden = getHiddenSeriesNames(
    fieldConfig,
    numericFields.map(({ label }) => label)
  );

  return numericFields.map(({ field, fieldIndex, label }) => ({
    label,
    fieldName: label,
    color: getSeriesColor(field, theme),
    yAxis: 1,
    disabled: hidden.has(label),
    getItemKey: () => `polygon-${fieldIndex}`,
    getDisplayValues: () => getCalcDisplayValues(calcs, field, theme, timeZone),
  }));
}

/**
 * The pie legend's value columns for one slice (Grafana Pie chart "Legend values"
 * parity): a Value and/or Percent `DisplayValue`, in that order, matching the
 * selected `values`. The value formats with the slice field's unit/decimals (like
 * the slice labels and tooltip); the percent is the slice's share of the visible
 * total, through the same `formatPieShare` those surfaces use, so all three agree.
 * A hidden slice contributes `0` to the total and shows `-` for its percent. Each
 * column is always titled ("Value" / "Percent") — the table legend renders a `?`
 * header for a title-less column, so titling both is simpler than conditionally
 * dropping them; the list legend ignores the titles.
 */
function getPieLegendDisplayValues(
  slice: PieSliceModel,
  total: number,
  values: PieLegendValue[],
  theme: GrafanaTheme2,
  timeZone?: string
): DisplayValue[] {
  const out: DisplayValue[] = [];

  if (values.includes('value')) {
    const display = slice.field.display ?? getDisplayProcessor({ field: slice.field, theme, timeZone });
    out.push({ ...display(slice.value ?? null), title: 'Value' });
  }

  if (values.includes('percent')) {
    const percent = slice.hidden || total <= 0 ? 0 : ((slice.value ?? 0) / total) * 100;
    out.push({
      numeric: percent,
      text: slice.hidden ? '-' : formatPieShare(slice.value, total, slice.field.config.decimals),
      title: 'Percent',
    });
  }

  return out;
}

/**
 * Legend items for the pie, from the shared slice resolver so the legend matches
 * the rendered slices (same names, colors, hidden state, and `sort` order). Every
 * slice is kept — a hidden one is marked `disabled` (greyed) so it can be toggled
 * back. Each item's value columns show the selected `values` (Percent / Value); an
 * empty selection shows slice names only. Percentages are of the *visible* total
 * (hidden slices excluded), matching the chart and tooltip.
 */
export function buildPieLegendItems(
  series: DataFrame[],
  theme: GrafanaTheme2,
  values: PieLegendValue[],
  fieldConfig: FieldConfigSource,
  reduceOptions: ReduceDataOptions | undefined,
  replaceVariables: InterpolateFunction,
  timeZone?: string,
  sort?: SortOrder
): VizLegendItem[] {
  const slices = resolvePieSlices(series, theme, fieldConfig, reduceOptions, replaceVariables, timeZone, sort);
  const total = getPieSliceTotal(slices.filter((slice) => !slice.hidden));

  return slices.map((slice, index) => ({
    label: slice.name,
    fieldName: slice.name,
    color: slice.color,
    yAxis: 1,
    disabled: slice.hidden,
    getItemKey: () => `slice-${index}`,
    getDisplayValues: () => getPieLegendDisplayValues(slice, total, values, theme, timeZone),
  }));
}
