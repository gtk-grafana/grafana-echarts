import {
  type DataFrame,
  type Field,
  type FieldConfigSource,
  FieldType,
  getFieldDisplayName,
  type GrafanaTheme2,
  reduceField,
} from '@grafana/data';
import { type PieFormat } from 'editor/types';
import { resolveCategoriesFromField } from 'lib/echarts/converters/frames';
import { getPaletteColorByIndex, getSeriesColor } from 'lib/echarts/style';
import { getHiddenSeriesNames, getSeriesColorOverride } from 'lib/grafana/fields/seriesConfig';
import { getNumericValues, isNumberField, isNumericLikeField, isStringField } from 'lib/grafana/narrowing';

/**
 * One resolved pie slice, shared by the chart, DOM legend, and tooltip so all
 * three agree on the same slice set, values, colors, and hidden state (rather
 * than each re-deriving the selection and drifting).
 */
export interface PieSliceModel {
  /** Slice label: the field display name (wide) or the category value (long). */
  name: string;
  /** Reduced slice value; `undefined` when the reduction is non-finite (empty/all-null). */
  value: number | undefined;
  /** Resolved slice/swatch color (a fixed-color override always wins). */
  color: string;
  /** Hidden via the legend visibility toggle; kept in the model so the legend can grey it. */
  hidden: boolean;
  /**
   * A single-value numeric field carrying this slice's value plus the source
   * field's unit/decimals config, for the legend's calc columns
   * (`getCalcDisplayValues`) — a slice is one value, so any reducer resolves to it.
   */
  field: Field;
}

/**
 * Resolve every pie slice (visible and hidden) from Grafana frames, branching on
 * the panel's `pieFormat`:
 *
 * - **wide** (Grafana's core pie default): each numeric-like field becomes one
 *   slice, reduced to a single value by `calc`. Color comes from the field's own
 *   Color scheme (like "one numeric field = one series").
 * - **long**: the first string field is the category and the first other
 *   numeric-like field holds the values; rows sharing a category are aggregated
 *   into one slice by `calc`, in first-seen order. Color comes from the classic
 *   palette by slice position.
 *
 * Numeric-text value fields are coerced without a `convertFieldType` transform
 * (see `isNumericLikeField` / `getNumericValues`). Hidden slices are read by name
 * from `fieldConfig` (pie slices are not Grafana fields, so the override engine
 * cannot target them) and a per-slice fixed-color override always wins.
 *
 * Returns an empty array when no frame has a numeric-like field.
 */
export function resolvePieSlices(
  series: DataFrame[],
  theme: GrafanaTheme2,
  fieldConfig: FieldConfigSource,
  format: PieFormat,
  calc: string
): PieSliceModel[] {
  const frame = findPieFrame(series);
  if (!frame) {
    return [];
  }

  return format === 'long'
    ? resolveLongSlices(frame, theme, fieldConfig, calc)
    : resolveWideSlices(frame, series, theme, fieldConfig, calc);
}

/** First frame with a numeric-like field (number or numeric string) — the pie source. */
function findPieFrame(series: DataFrame[]): DataFrame | undefined {
  return series.find((frame) => frame.fields.some(isNumericLikeField));
}

/** Wide: one slice per numeric-like field, each reduced to a single value by `calc`. */
function resolveWideSlices(
  frame: DataFrame,
  series: DataFrame[],
  theme: GrafanaTheme2,
  fieldConfig: FieldConfigSource,
  calc: string
): PieSliceModel[] {
  const fields = frame.fields.filter(isNumericLikeField);
  const names = fields.map((field) => getFieldDisplayName(field, frame, series));
  const hidden = getHiddenSeriesNames(fieldConfig, names);

  return fields.map((field, index) => {
    const name = names[index];
    const value = reduceSliceValue(toNumericField(field), calc);
    return {
      name,
      value,
      // A fixed-color override wins; otherwise the field's own Color scheme, which
      // Grafana keys by the field's series index (matching the cartesian legend).
      color: getSeriesColorOverride(fieldConfig, name) ?? getSeriesColor(field, theme),
      hidden: hidden.has(name),
      field: toSliceField(field, value),
    };
  });
}

/** Long: group rows by category (first-seen order), reducing each group by `calc`. */
function resolveLongSlices(
  frame: DataFrame,
  theme: GrafanaTheme2,
  fieldConfig: FieldConfigSource,
  calc: string
): PieSliceModel[] {
  // Category = the first string field (even when its values look numeric, e.g.
  // years); value = the first numeric-like field that is not the category, so a
  // year-string category is never mistaken for the value column.
  const categoryField = frame.fields.find(isStringField);
  const valueField = frame.fields.find((field) => field !== categoryField && isNumericLikeField(field));
  if (!valueField) {
    return [];
  }

  const categories = resolveCategoriesFromField(categoryField, frame.length);
  const numericValues = getNumericValues(valueField);

  // Group values by category in first-seen order so duplicate rows aggregate into
  // a single slice instead of emitting colliding slices.
  const order: string[] = [];
  const groups = new Map<string, Array<number | null>>();
  for (let row = 0; row < frame.length; row++) {
    const name = categories[row] ?? String(row);
    let group = groups.get(name);
    if (!group) {
      group = [];
      groups.set(name, group);
      order.push(name);
    }
    group.push(numericValues[row]);
  }

  const hidden = getHiddenSeriesNames(fieldConfig, order);

  return order.map((name, index) => {
    const groupField: Field = {
      ...valueField,
      type: FieldType.number,
      values: groups.get(name) ?? [],
      state: undefined,
    };
    const value = reduceSliceValue(groupField, calc);
    return {
      name,
      value,
      // Palette color is keyed by slice position so slices keep stable colors as
      // others are hidden; a fixed-color override wins.
      color: getSeriesColorOverride(fieldConfig, name) ?? getPaletteColorByIndex(index, theme),
      hidden: hidden.has(name),
      field: toSliceField(valueField, value),
    };
  });
}

/** Reduce a field to a single slice value; a non-finite result becomes `undefined`. */
function reduceSliceValue(field: Field, calc: string): number | undefined {
  // `reduceField` is typed as `Record<string, any>`; narrow through `unknown`.
  const result: unknown = reduceField({ field, reducers: [calc] })[calc];
  return typeof result === 'number' && Number.isFinite(result) ? result : undefined;
}

/** A numeric view of a field, coercing numeric-string values so reducers can sum them. */
function toNumericField(field: Field): Field {
  if (isNumberField(field)) {
    return field;
  }
  return { ...field, type: FieldType.number, values: getNumericValues(field) };
}

/**
 * A single-value numeric field carrying `value` and the source field's config, so
 * the legend's calc columns render the slice value (with its unit/decimals) under
 * any reducer. `state` is cleared so no stale calc cache leaks through.
 */
function toSliceField(sourceField: Field, value: number | undefined): Field {
  return { ...sourceField, type: FieldType.number, values: [value ?? null], state: undefined };
}
