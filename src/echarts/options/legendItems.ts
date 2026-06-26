import {
  DataFrame,
  DisplayValue,
  Field,
  FieldType,
  fieldReducers,
  getDisplayProcessor,
  getFieldDisplayName,
  GrafanaTheme2,
  reduceField,
} from '@grafana/data';
import { VizLegendItem } from '@grafana/ui';
import { getPaletteColorByIndex, getSeriesColor } from 'echarts/style';

/**
 * Pick the frame a categorical chart (pie/radar) renders from: the first frame
 * with a numeric field. Mirrors `frameToCategorical` so the legend rows line up
 * with the slices/polygons the chart actually draws.
 *
 * @todo de-duplicate this against `frameToCategorical`'s frame selection so the
 * legend can't drift from the converter (e.g. share a single "pick frame" util).
 *
 * @todo uplot pie chart currently has custom reducers (percent & value) instead of defaults
 */
function findCategoricalFrame(series: DataFrame[]): DataFrame | undefined {
  return series.find((frame) => frame.fields.some((field) => field.type === FieldType.number));
}

/**
 * Reduce a field down to the per-series `calcs` (min/max/mean/last/…) the table
 * legend shows as columns, formatted through the field's display processor so
 * units/decimals/mappings match the rest of the panel.
 *
 * The returned `DisplayValue.title` is the reducer's human label (e.g. "Mean"),
 * which `VizLegend` uses as the column header.
 *
 * @todo This reimplements `getDisplayValuesForCalcs` from @grafana/ui, which is
 * the exact helper Core's legends use but is only published under the internal
 * entry point (`@grafana/ui` exposes only `.` and `./unstable`, not `./internal`).
 * Investigate getting `getDisplayValuesForCalcs` promoted to the public
 * @grafana/ui API so plugins can reuse it instead of copying this logic.
 */
export function getCalcDisplayValues(
  calcs: string[],
  field: Field,
  theme: GrafanaTheme2,
  timeZone?: string
): DisplayValue[] {
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

/**
 * Build the `VizLegendItem`s for a table legend over time series data.
 *
 * Mirrors `timeSeriesToEChartsOption`: only frames with a time field contribute,
 * and each numeric value field becomes one row, so legend labels/colors line up
 * exactly with the plotted series. Each item lazily computes its `calcs` columns
 * via `getCalcDisplayValues` (the table only asks for them when it renders).
 */
export function buildTimeSeriesLegendItems(
  series: DataFrame[],
  theme: GrafanaTheme2,
  calcs: string[],
  timeZone?: string
): VizLegendItem[] {
  const items: VizLegendItem[] = [];

  series.forEach((frame, frameIndex) => {
    const hasTimeField = frame.fields.some((field) => field.type === FieldType.time);
    if (!hasTimeField) {
      return;
    }

    frame.fields.forEach((field, fieldIndex) => {
      if (field.type !== FieldType.number) {
        return;
      }

      items.push({
        label: getFieldDisplayName(field, frame, series),
        color: getSeriesColor(field, theme),
        yAxis: 1,
        getItemKey: () => `${frameIndex}-${fieldIndex}`,
        getDisplayValues: () => getCalcDisplayValues(calcs, field, theme, timeZone),
      });
    });
  });

  return items;
}

/**
 * Build table-legend rows for a radar chart.
 *
 * Each numeric field is one polygon (and one legend row), matching
 * `radarToEChartsOption`. `calcs` reduce the field across the radar axes, so the
 * columns are meaningful (e.g. the max value across a polygon's axes).
 */
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

/**
 * Build table-legend rows for a pie chart.
 *
 * Each category row of the first numeric field is one slice (and one legend
 * row), matching `pieToEChartsOption` (including the palette-by-index coloring).
 * A slice is a single value, so its `calcs` columns are computed from a synthetic
 * single-value field that inherits the source field's display processor (units /
 * decimals / mappings). With no calcs selected the table shows just labels.
 */
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

  const categoryField = frame.fields.find((field) => field.type === FieldType.string);

  const items: VizLegendItem[] = [];
  for (let row = 0; row < frame.length; row++) {
    const label = categoryField ? String(categoryField.values[row] ?? row) : String(row);
    // A single-value view of the source field so reducers/formatting reuse the
    // real field config; `state` is cleared so reduceField's cache stays isolated.
    const sliceField: Field = { ...valueField, values: [valueField.values[row] ?? null], state: undefined };

    items.push({
      label,
      color: getPaletteColorByIndex(row, theme),
      yAxis: 1,
      getItemKey: () => `slice-${row}`,
      getDisplayValues: () => getCalcDisplayValues(calcs, sliceField, theme, timeZone),
    });
  }

  return items;
}
