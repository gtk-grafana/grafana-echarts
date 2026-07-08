import {
  type DataFrame,
  type Field,
  fieldReducers,
  FieldType,
  getDisplayProcessor,
  getFieldDisplayName,
  type GrafanaTheme2,
  reduceField,
} from '@grafana/data';
import { type VizLegendItem } from '@grafana/ui';
import type { CartesianMultiValueSeriesType } from 'editor/types';
import { findCategoricalFrame, forEachTimeSeriesField, resolveCategories } from 'lib/echarts/converters/frames';
import { multiValueCartesianToEChartsOption, } from 'lib/echarts/converters/multiValueCartesian';
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
  timeZone?: string
): VizLegendItem[] {
  const items: VizLegendItem[] = [];

  forEachTimeSeriesField(series, ({ frame, frameIndex, field, fieldIndex }) => {
    const label = getFieldDisplayName(field, frame, series);
    items.push({
      label,
      fieldName: label,
      color: getSeriesColor(field, theme),
      yAxis: 1,
      getItemKey: () => `${frameIndex}-${fieldIndex}`,
      getDisplayValues: () => getCalcDisplayValues(calcs, field, theme, timeZone),
    });
  });

  return items;
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
  timeZone?: string
): VizLegendItem[] {
  const frame = findCategoricalFrame(series);
  if (!frame) {
    return [];
  }

  const items: VizLegendItem[] = [];
  frame.fields.forEach((field, fieldIndex) => {
    if (field.type !== FieldType.number) {
      return;
    }

    const label = getFieldDisplayName(field, frame, series);
    items.push({
      label,
      fieldName: label,
      color: getSeriesColor(field, theme),
      yAxis: 1,
      getItemKey: () => `series-${fieldIndex}`,
      getDisplayValues: () => getCalcDisplayValues(calcs, field, theme, timeZone),
    });
  });

  return items;
}

/**
 * Legend items for a multi-value cartesian chart (candlestick/boxplot). The
 * converter emits a single series per source frame, so this yields one legend
 * entry mirroring it. Table calc columns are omitted: each item is a
 * multi-dimensional array (OHLC / five-number summary), so a single reduced
 * value would be misleading.
 */
export function buildMultiValueCartesianLegendItems(
  series: DataFrame[],
  theme: GrafanaTheme2,
  chartType: CartesianMultiValueSeriesType
): VizLegendItem[] {
  const data = multiValueCartesianToEChartsOption(series, chartType, theme);
  if (!data) {
    return [];
  }

  return data.series.map((chartSeries, index) => ({
    label: chartSeries.name,
    fieldName: chartSeries.name,
    color: chartSeries.itemStyle.color,
    yAxis: 1,
    getItemKey: () => `multiValue-${index}`,
    getDisplayValues: () => [],
  }));
}

export function buildRadarLegendItems(
  series: DataFrame[],
  theme: GrafanaTheme2,
  calcs: string[],
  timeZone?: string
): VizLegendItem[] {
  const frame = findCategoricalFrame(series);
  if (!frame) {
    return [];
  }

  const items: VizLegendItem[] = [];
  frame.fields.forEach((field, fieldIndex) => {
    if (field.type !== FieldType.number) {
      return;
    }

    items.push({
      label: getFieldDisplayName(field, frame, series),
      fieldName: getFieldDisplayName(field, frame, series),
      color: getSeriesColor(field, theme),
      yAxis: 1,
      getItemKey: () => `polygon-${fieldIndex}`,
      getDisplayValues: () => getCalcDisplayValues(calcs, field, theme, timeZone),
    });
  });

  return items;
}

export function buildPieLegendItems(
  series: DataFrame[],
  theme: GrafanaTheme2,
  calcs: string[],
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

  const categories = resolveCategories(frame);
  const items: VizLegendItem[] = [];

  for (let row = 0; row < frame.length; row++) {
    const sliceField: Field = { ...valueField, values: [valueField.values[row] ?? null], state: undefined };

    items.push({
      label: categories[row] ?? String(row),
      fieldName: categories[row] ?? String(row),
      color: getPaletteColorByIndex(row, theme),
      yAxis: 1,
      getItemKey: () => `slice-${row}`,
      getDisplayValues: () => getCalcDisplayValues(calcs, sliceField, theme, timeZone),
    });
  }

  return items;
}
