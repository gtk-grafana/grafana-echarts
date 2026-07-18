import {
  type DataFrame,
  type Field,
  type FieldConfig,
  type FieldConfigSource,
  FieldColorModeId,
  getFieldDisplayName,
  getFieldDisplayValues,
  FieldType,
  type GrafanaTheme2,
  type InterpolateFunction,
  type ReduceDataOptions,
} from '@grafana/data';
import { PIE_CALC_DEFAULT } from 'editor/constants';
import { type PieFormat } from 'editor/types';
import { resolveCategoriesFromField } from 'lib/echarts/converters/frames';
import { getPaletteColorByIndex } from 'lib/echarts/style';
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
 * Resolve every pie slice (visible and hidden) from Grafana frames using
 * Grafana's own `getFieldDisplayValues` (the engine core's pie/stat panels use),
 * driven by the standard `reduceOptions`. This branches on the panel's
 * `pieFormat` only to shape the fields fed in:
 *
 * - **wide** (Grafana's core pie default): each numeric-like field becomes one
 *   slice, reduced to a single value by `reduceOptions.calcs[0]`. Color comes
 *   from the field's own Color scheme (like "one numeric field = one series").
 * - **long**: the first string field is the category and the first other
 *   numeric-like field holds the values; rows sharing a category are collapsed
 *   into one synthesized field (first-seen order) so the reducer aggregates each
 *   group. Color comes from the classic palette by slice position.
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
  reduceOptions: ReduceDataOptions | undefined,
  replaceVariables: InterpolateFunction,
  timeZone?: string
): PieSliceModel[] {
  const frame = findPieFrame(series);
  if (!frame) {
    return [];
  }

  // The numeric fields that become slices, shaped once for either format: wide
  // keeps each numeric-like source field; long collapses rows to one synthesized
  // field per category (so the reducer aggregates each group). One
  // `getFieldDisplayValues` call then reduces each field to a slice value.
  const sliceFields = format === 'long' ? buildLongSliceFields(frame) : buildWideSliceFields(frame, series);
  if (sliceFields.length === 0) {
    return [];
  }

  const displayFrame: DataFrame = {
    ...frame,
    fields: sliceFields,
    length: sliceFields.reduce((max, field) => Math.max(max, field.values.length), 0),
  };

  const displays = getFieldDisplayValues({
    data: [displayFrame],
    reduceOptions: normalizePieReduceOptions(reduceOptions),
    fieldConfig,
    replaceVariables,
    theme,
    timeZone,
  })
    // Drop the synthetic "no data" placeholder (it carries no source column).
    .filter((display) => display.colIndex !== undefined);

  const names = displays.map((display) => display.display.title ?? '');
  const hidden = getHiddenSeriesNames(fieldConfig, names);

  return displays.map((display, index) => {
    const name = names[index];
    const numeric = display.display.numeric;
    const value = typeof numeric === 'number' && Number.isFinite(numeric) ? numeric : undefined;
    return {
      name,
      value,
      // A fixed-color override always wins; otherwise the display processor's
      // color (the field's Color scheme / palette), falling back to the classic
      // palette by slice position so slices stay distinct and stable.
      color: getSeriesColorOverride(fieldConfig, name) ?? (display.display.color || getPaletteColorByIndex(index, theme)),
      hidden: hidden.has(name),
      field: toSliceField(display.field, name, value),
    };
  });
}

/** First frame with a numeric-like field (number or numeric string) — the pie source. */
function findPieFrame(series: DataFrame[]): DataFrame | undefined {
  return series.find((frame) => frame.fields.some(isNumericLikeField));
}

/**
 * Wide: one numeric field per numeric-like source field. Numeric-text fields are
 * coerced to numbers; the display name is precomputed (labels/duplicate handling)
 * and set as `displayName` so `getFieldDisplayValues` titles the slice with it.
 * A default classic-palette Color scheme is applied only when the field has none,
 * so the field's own color (or a by-value scheme) still wins.
 */
function buildWideSliceFields(frame: DataFrame, series: DataFrame[]): Field[] {
  return frame.fields.filter(isNumericLikeField).map((field, index) => {
    const displayName = getFieldDisplayName(field, frame, series);
    const numericField = isNumberField(field)
      ? field
      : { ...field, type: FieldType.number, values: getNumericValues(field), display: undefined };
    return {
      ...numericField,
      config: {
        ...numericField.config,
        displayName,
        color: numericField.config.color ?? { mode: FieldColorModeId.PaletteClassic },
      },
      // Keep Grafana's own series index when set (real panel); otherwise key the
      // palette by field position (tests / no applied overrides).
      state: { ...numericField.state, seriesIndex: numericField.state?.seriesIndex ?? index },
    };
  });
}

/**
 * Long: one synthesized numeric field per distinct category (first-seen order),
 * holding that category's grouped values so the reducer aggregates them into a
 * single slice. Colors are keyed by slice position (classic palette), independent
 * of the value field's own color, so slices stay distinct and stable as others
 * are hidden. Returns an empty array when there is no numeric-like value field.
 */
function buildLongSliceFields(frame: DataFrame): Field[] {
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

  return order.map((name, index) => ({
    name,
    type: FieldType.number,
    values: groups.get(name) ?? [],
    config: {
      ...valueField.config,
      displayName: name,
      // Classic palette by slice position — independent of the value field's own
      // Color scheme — so slices are distinct and keep their color when others hide.
      color: { mode: FieldColorModeId.PaletteClassic },
    },
    state: { seriesIndex: index },
  }));
}

/**
 * Normalize the panel's `reduceOptions` for a pie: a slice is one value, so only
 * the first calc is used (extra calcs would emit duplicate slices), defaulting to
 * Sum (part-to-whole) when unset. `values`/`limit`/`fields` pass through so
 * "All values", the row limit, and the field selector behave like core Grafana.
 */
function normalizePieReduceOptions(reduceOptions: ReduceDataOptions | undefined): ReduceDataOptions {
  return {
    values: reduceOptions?.values ?? false,
    limit: reduceOptions?.limit,
    calcs: [reduceOptions?.calcs?.[0] ?? PIE_CALC_DEFAULT],
    fields: reduceOptions?.fields,
  };
}

/**
 * A single-value numeric field carrying `value` and the source field's config, so
 * the legend's calc columns render the slice value (with its unit/decimals) under
 * any reducer. `state` is cleared so no stale calc cache leaks through.
 */
function toSliceField(config: FieldConfig, name: string, value: number | undefined): Field {
  return { name, type: FieldType.number, config, values: [value ?? null], state: undefined };
}
