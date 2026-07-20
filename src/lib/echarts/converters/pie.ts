import {
  type DataFrame,
  type DecimalCount,
  type Field,
  type FieldConfigSource,
  type FieldDisplay,
  FieldType,
  formattedValueToString,
  getFieldDisplayValues,
  getValueFormat,
  type GrafanaTheme2,
  type InterpolateFunction,
  type ReduceDataOptions,
  type ValueFormatter,
} from '@grafana/data';
import { SortOrder } from '@grafana/schema';
import { PIE_CALC_DEFAULT } from 'editor/constants';
import { type PieSliceModel } from 'lib/echarts/converters/types';
import { getPaletteColorByIndex, getValueFormatter } from 'lib/echarts/style';
import { getHiddenSeriesNames, getSeriesColorOverride } from 'lib/grafana/fields/seriesConfig';

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
 * `getFieldDisplayValues`' default matcher is numeric-only, so value fields that
 * arrive as text (e.g. a datasource emitting `"12.5"`) must be converted to a
 * numeric field upstream with a "Convert field type" transform. Hidden slices are
 * read by name from `fieldConfig` (pie slices are not Grafana fields, so the
 * override engine cannot target them) and a per-slice fixed-color override always
 * wins.
 *
 * The full slice set (including hidden slices) is ordered by `sort` (Grafana Pie
 * chart "Slice sorting"): `desc` largest-first, `asc` smallest-first, `none` data
 * order; non-finite values sort to the end. Sorting the shared model keeps the
 * chart, legend, and tooltip in the same order. Defaults to `none` here; the panel
 * passes its own default (`desc`) via `PIE_SORT_DEFAULT`.
 *
 * Returns an empty array when no frame yields a numeric slice (`getFieldDisplayValues`
 * emits a "No data" placeholder in that case, which is filtered out).
 *
 * The result is memoized per `series` reference (see `sliceModelCache`): the chart
 * option, tooltip, and legend paths all resolve slices with identical inputs in one
 * render, so this runs the underlying `getFieldDisplayValues` reduction just once.
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
  const deps: readonly unknown[] = [theme, fieldConfig, reduceOptions, replaceVariables, timeZone, sort];
  const cached = sliceModelCache.get(series);
  if (cached && cached.deps.every((dep, index) => Object.is(dep, deps[index]))) {
    return cached.slices;
  }
  const slices = computePieSlices(series, theme, fieldConfig, reduceOptions, replaceVariables, timeZone, sort);
  sliceModelCache.set(series, { deps, slices });
  return slices;
}

/**
 * Last resolved slice model per source-frame array. Keyed on `series` via a
 * `WeakMap` so separate panels keep independent entries and stale frames are
 * garbage-collected; the remaining inputs are compared by identity (all are
 * render-stable) to invalidate the entry on any real change.
 */
const sliceModelCache = new WeakMap<DataFrame[], { deps: readonly unknown[]; slices: PieSliceModel[] }>();

function computePieSlices(
  series: DataFrame[],
  theme: GrafanaTheme2,
  fieldConfig: FieldConfigSource,
  reduceOptions: ReduceDataOptions | undefined,
  replaceVariables: InterpolateFunction,
  timeZone: string | undefined,
  sort: SortOrder
): PieSliceModel[] {
  const displays = getFieldDisplayValues({
    data: series,
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

/**
 * Per-slice value formatters in render (dataIndex) order, each honoring its own
 * field's unit/decimals. Shared by the slice labels, the pie tooltip, and the
 * generic tooltip resolver so every surface formats a slice value identically.
 */
export function getPieSliceFormatters(
  slices: PieSliceModel[],
  theme: GrafanaTheme2,
  timeZone?: string
): ValueFormatter[] {
  return slices.map((slice) => getValueFormatter(slice.field, theme, timeZone));
}

/**
 * Sum of the slices' values (non-finite treated as `0`) — the denominator for
 * percentage shares. Callers pass the visible slices so shares are of the drawn
 * total, keeping labels and tooltip in agreement.
 */
export function getPieSliceTotal(slices: PieSliceModel[]): number {
  return slices.reduce((sum, slice) => sum + (slice.value ?? 0), 0);
}

/** Grafana's `percent` value formatter (input already scaled to 0–100). */
const percentValueFormat = getValueFormat('percent');

/**
 * A slice value's share of `total` as a percentage string, rendered through
 * Grafana's `percent` value formatter (like every other value) and the slice
 * field's own `decimals` (defaulting to 0, matching core Grafana's pie). Empty
 * values or a non-positive total render as `0`.
 */
export function formatPieShare(value: number | undefined, total: number, decimals?: DecimalCount): string {
  const percent = value != null && total > 0 ? (value / total) * 100 : 0;
  return formattedValueToString(percentValueFormat(percent, decimals ?? 0));
}
