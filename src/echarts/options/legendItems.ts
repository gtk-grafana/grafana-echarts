import {
  DataFrame,
  Field,
  FieldType,
  fieldReducers,
  getDisplayProcessor,
  getFieldDisplayName,
  GrafanaTheme2,
  reduceField,
} from '@grafana/data';
import { VizLegendItem } from '@grafana/ui';
import { findCategoricalFrame, forEachTimeSeriesField, resolveCategories } from 'echarts/converters/frames';
import { getPaletteColorByIndex, getSeriesColor } from 'echarts/style';

/**
 * Reduce a field down to per-series calc columns for the table legend.
 */
export function getCalcDisplayValues(
  calcs: string[],
  field: Field,
  theme: GrafanaTheme2,
  timeZone?: string
) {
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
    items.push({
      label: getFieldDisplayName(field, frame, series),
      color: getSeriesColor(field, theme),
      yAxis: 1,
      getItemKey: () => `${frameIndex}-${fieldIndex}`,
      getDisplayValues: () => getCalcDisplayValues(calcs, field, theme, timeZone),
    });
  });

  return items;
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
      color: getPaletteColorByIndex(row, theme),
      yAxis: 1,
      getItemKey: () => `slice-${row}`,
      getDisplayValues: () => getCalcDisplayValues(calcs, sliceField, theme, timeZone),
    });
  }

  return items;
}
