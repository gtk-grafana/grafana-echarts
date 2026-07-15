import {
  type DataFrame,
  type Field,
  type FieldConfigSource,
  fieldReducers,
  FieldType,
  getDisplayProcessor,
  getFieldDisplayName,
  type GrafanaTheme2,
  reduceField,
} from '@grafana/data';
import { type VizLegendItem } from '@grafana/ui';
import type { MultiValueSeriesType } from 'editor/types';
import { type ChartContext } from 'lib/echarts/charts/types';
import {
  findCategoricalFrame,
  forEachTimeSeriesField,
  resolveCategoriesFromFrame,
} from 'lib/echarts/converters/frames';
import { multiValueCartesianToEChartsOption } from 'lib/echarts/converters/multiValueCartesian';
import { getHiddenSeriesNames, getSeriesColorOverride } from 'lib/grafana/fields/seriesConfig';
import { getPaletteColorByIndex, getSeriesColor } from 'lib/echarts/style';

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

export function buildPieLegendItems(
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

  const valueField = frame.fields.find((field) => field.type === FieldType.number);
  if (!valueField) {
    return [];
  }

  // Slices are rows of one field, so hidden/color state is read by name from the
  // panel field config (not from Grafana's field-override engine); the legend
  // keeps every slice so a hidden one can be toggled back.
  const categories = resolveCategoriesFromFrame(frame);
  const hidden = getHiddenSeriesNames(fieldConfig, categories);
  const items: VizLegendItem[] = [];

  for (let row = 0; row < frame.length; row++) {
    const sliceField: Field = { ...valueField, values: [valueField.values[row] ?? null], state: undefined };
    const label = categories[row] ?? String(row);

    items.push({
      label,
      fieldName: label,
      color: getSeriesColorOverride(fieldConfig, label) ?? getPaletteColorByIndex(row, theme),
      yAxis: 1,
      disabled: hidden.has(label),
      getItemKey: () => `slice-${row}`,
      getDisplayValues: () => getCalcDisplayValues(calcs, sliceField, theme, timeZone),
    });
  }

  return items;
}
