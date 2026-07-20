import {
  type DataFrame,
  type Field,
  type FieldConfigSource,
  type FieldDisplay,
  FieldType,
  getFieldDisplayValues,
  type GrafanaTheme2,
  type InterpolateFunction,
  type ReduceDataOptions,
} from '@grafana/data';
import { SortOrder } from '@grafana/schema';
import { PIE_CALC_DEFAULT } from 'editor/constants';
import { getPaletteColorByIndex } from 'lib/echarts/style';
import { getHiddenSeriesNames, getSeriesColorOverride } from 'lib/grafana/fields/seriesConfig';
import { getNumericValues, isNumericStringField } from 'lib/grafana/narrowing';

/**
 * One resolved pie slice, shared by the chart, DOM legend, and tooltip so all
 * three agree on the same slice set, values, colors, and hidden state (rather
 * than each re-deriving the selection and drifting).
 */
export interface PieSliceModel {
  /** Slice label: the reduced field's display name (Calculate) or a row name (All values). */
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
 * driven by the standard `reduceOptions`. Grafana owns the reduction, multi-frame
 * handling, display name, color, and unit/decimals formatting, so a multi-series
 * response (e.g. one frame per Prometheus series) yields one slice per series:
 *
 * - **Calculate** (`values: false`): each numeric field across every frame becomes
 *   one slice, reduced to a single value by `reduceOptions.calcs[0]`.
 * - **All values** (`values: true`): each row becomes a slice, capped by
 *   `reduceOptions.limit`.
 *
 * Numeric-text value fields are pre-coerced to numbers (see `isNumericStringField`
 * / `getNumericValues`) because `getFieldDisplayValues`' default matcher is
 * numeric-only and would otherwise skip them. Hidden slices are read by name from
 * `fieldConfig` (pie slices are not Grafana fields, so the override engine cannot
 * target them) and a per-slice fixed-color override always wins.
 *
 * The full slice set (including hidden slices) is ordered by `sort` (Grafana Pie
 * chart "Slice sorting"): `desc` largest-first, `asc` smallest-first, `none` data
 * order; non-finite values sort to the end. Sorting the shared model keeps the
 * chart, legend, and tooltip in the same order. Defaults to `none` here; the panel
 * passes its own default (`desc`) via `PIE_SORT_DEFAULT`.
 *
 * Returns an empty array when no frame yields a numeric slice (`getFieldDisplayValues`
 * emits a "No data" placeholder in that case, which is filtered out).
 */
export function resolvePieSlices(
  series: DataFrame[],
  theme: GrafanaTheme2,
  fieldConfig: FieldConfigSource,
  reduceOptions: ReduceDataOptions | undefined,
  replaceVariables: InterpolateFunction,
  timeZone?: string,
  sort: SortOrder = SortOrder.None
): PieSliceModel[] {
  const data = series.map(coerceNumericStringFields);

  const displays = getFieldDisplayValues({
    data,
    reduceOptions: normalizePieReduceOptions(reduceOptions),
    fieldConfig,
    replaceVariables,
    theme,
    timeZone,
  })
    // Drop the synthetic "No data" placeholder core emits when nothing matched
    // (it carries no source column index).
    .filter((display) => display.colIndex !== undefined);

  const names = displays.map((display) => display.display.title ?? '');
  const hidden = getHiddenSeriesNames(fieldConfig, names);

  const slices = displays.map((display, index) => {
    const name = names[index];
    const numeric = display.display.numeric;
    const value = typeof numeric === 'number' && Number.isFinite(numeric) ? numeric : undefined;
    return {
      name,
      value,
      // A fixed-color override always wins; otherwise the display processor's
      // color (the field's Color scheme / palette), falling back to the classic
      // palette by slice position so slices stay distinct and stable.
      color:
        getSeriesColorOverride(fieldConfig, name) ?? (display.display.color || getPaletteColorByIndex(index, theme)),
      hidden: hidden.has(name),
      field: toSliceField(display, name, value),
    };
  });

  // Order the whole set (hidden included, matching core) by value. `Array.sort` is
  // stable, so `none` keeps data order and equal values keep their relative order.
  return slices.sort(comparePieSlicesByValue(sort));
}

/**
 * Comparator ordering pie slices by value for the `sort` option, mirroring core
 * Grafana (`comparePieChartItemsByValue`): non-finite (`undefined`) values sort to
 * the end regardless of direction; then `desc` is largest-first, `asc` is
 * smallest-first, and `none` leaves finite values in their original (stable) order.
 */
function comparePieSlicesByValue(sort: SortOrder): (a: PieSliceModel, b: PieSliceModel) => number {
  return (a, b) => {
    if (a.value === undefined) {
      return 1;
    }
    if (b.value === undefined) {
      return -1;
    }
    if (sort === SortOrder.Descending) {
      return b.value - a.value;
    }
    if (sort === SortOrder.Ascending) {
      return a.value - b.value;
    }
    return 0;
  };
}

/**
 * Coerce numeric-text fields (e.g. a value column that arrived as `"12.5"`) to
 * real number fields so `getFieldDisplayValues`' numeric-only matcher picks them
 * up. Only touched frames are copied; the coerced field's cached display/calcs are
 * cleared so the reducer runs against the fresh numeric values. Genuine label
 * fields (including year-like strings mixed with words) are left untouched.
 */
function coerceNumericStringFields(frame: DataFrame): DataFrame {
  if (!frame.fields.some(isNumericStringField)) {
    return frame;
  }
  return {
    ...frame,
    fields: frame.fields.map((field) =>
      isNumericStringField(field)
        ? {
            ...field,
            type: FieldType.number,
            values: getNumericValues(field),
            display: undefined,
            state: field.state ? { ...field.state, calcs: undefined } : field.state,
          }
        : field
    ),
  };
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
 * A single-value numeric field carrying `value` and the source field's config
 * (`FieldDisplay.field`, which holds unit/decimals), so the legend's calc columns
 * render the slice value under any reducer. `state` is cleared so no stale calc
 * cache leaks through.
 */
function toSliceField(display: FieldDisplay, name: string, value: number | undefined): Field {
  return { name, type: FieldType.number, config: display.field, values: [value ?? null], state: undefined };
}
