import { type ValueFormatter } from '@grafana/data';
import { SortOrder } from '@grafana/schema';
import { type CallbackDataParams, type TopLevelFormatterParams } from 'echarts/types/dist/shared';
import { formatEChartsValue, unwrapEChartsValue } from 'lib/echarts/style';
import {
  type TooltipFieldResolver,
  type TooltipModel,
  type TooltipModelOptions,
  type TooltipRow,
  type TooltipRowOptions,
  type TooltipSink,
  type TooltipValueFormatterResolver,
} from 'lib/echarts/tooltip/types';

/**
 * A sink that discards its model. Used as a fallback where no React overlay is
 * wired (e.g. chart-module unit tests that call `buildOption` directly), so the
 * per-series `formatter` can be attached unconditionally.
 */
export const NOOP_TOOLTIP_SINK: TooltipSink = () => undefined;

/**
 * Axis-trigger tooltip params, which carry axis fields ECharts omits from
 * `CallbackDataParams`.
 *
 * ECharts declares this exact shape as `TooltipCallbackDataParams`
 * (`echarts/types/src/component/tooltip/TooltipView.d.ts:32`) but never exports
 * it, so importing it fails with TS2614 and it has to be restated here — same
 * constraint as `BrushAreaParam` in `lib/echarts/timeBrush.ts`.
 * https://echarts.apache.org/en/option.html#tooltip.formatter
 */
type TooltipParam = CallbackDataParams & {
  axisValueLabel?: string;
  axisValue?: number | string;
};

/**
 * The row swatch colour, when ECharts gives a plain CSS colour.
 *
 * `CallbackDataParams['color']` is a `ZRColor`, which also covers gradient and
 * pattern objects. Those have no CSS-string equivalent the swatch could render,
 * so they resolve to no swatch rather than to a stringified object.
 */
function tooltipColor(color: CallbackDataParams['color']): string | undefined {
  return typeof color === 'string' ? color : undefined;
}

/**
 * Build a resolver that indexes into an ordered list of per-series formatters by
 * the given key, falling back when the index is missing or out of range.
 */
export function indexedFormatterResolver(
  formatters: ValueFormatter[],
  fallback: ValueFormatter,
  key: 'seriesIndex' | 'dataIndex'
): TooltipValueFormatterResolver {
  return (item) => {
    const index = item[key];
    return (index != null ? formatters[index] : undefined) ?? fallback;
  };
}

/** The numeric magnitude of a tooltip item, or `undefined` for non-numeric/empty values. */
function tooltipNumeric(eChartValue: CallbackDataParams['value']): number | undefined {
  const numeric = unwrapEChartsValue(eChartValue);
  return typeof numeric === 'number' ? numeric : undefined;
}

/**
 * Apply `hideZeros`/`sort` to an ordered list of tooltip rows. `getValue` reads
 * the numeric magnitude used for both the zero test and the sort comparison.
 * Rows without a numeric value (nulls/"No value") are never hidden and sort to
 * the end. A new array is returned; input order is preserved when `sort` is
 * `None`/undefined (and the sort is stable for equal values).
 */
export function applyTooltipRowOptions<T>(
  rows: T[],
  getValue: (row: T) => number | undefined,
  { sort, hideZeros }: TooltipRowOptions = {}
): T[] {
  let result = hideZeros ? rows.filter((row) => getValue(row) !== 0) : rows;

  if (sort === SortOrder.Ascending || sort === SortOrder.Descending) {
    const direction = sort === SortOrder.Ascending ? 1 : -1;
    result = result
      .map((row, index) => ({ row, index, value: getValue(row) }))
      .sort((a, b) => {
        // Missing numerics sink to the end regardless of direction; equal values
        // keep their original order (stable).
        if (a.value == null || b.value == null) {
          return (a.value == null ? 1 : 0) - (b.value == null ? 1 : 0) || a.index - b.index;
        }
        return a.value === b.value ? a.index - b.index : (a.value - b.value) * direction;
      })
      .map((entry) => entry.row);
  }

  return result;
}

/**
 * Header text: the hovered x value. Axis triggers carry it as `axisValueLabel`;
 * item triggers (Single mode) don't, so `formatHeaderValue` (supplied for time
 * axes) recovers it from the item's `[x, value]` tuple with Grafana's time
 * formatting. Falls back to the single item's `name` (category charts).
 */
function getHeaderText(items: TooltipParam[], formatHeaderValue?: (item: TooltipParam) => string | undefined): string {
  const [first] = items;
  if (first == null) {
    return '';
  }
  const formatted = formatHeaderValue?.(first);
  if (formatted != null) {
    return formatted;
  }
  if (first.axisValueLabel != null) {
    return first.axisValueLabel;
  }
  if (items.length === 1 && first.name != null) {
    return String(first.name);
  }
  return '';
}

/**
 * One row per packed dimension of a multi-value item (candlestick / boxplot).
 *
 * ECharts prefixes these items' `value` with the data index, so the dimensions
 * start at offset 1 — verified against a live chart: candlestick reports
 * `[dataIndex, open, close, low, high]` and boxplot
 * `[dataIndex, min, q1, median, q3, max]`.
 *
 * Each dimension comes from its own Grafana field, so each row resolves its own
 * `source` (by `dimensionIndex`) and the footer surfaces the links of whichever
 * of those fields define them.
 */
function expandMultiValueRows(
  item: TooltipParam,
  dimensions: string[],
  valueFormatter: ValueFormatter,
  color: string | undefined,
  resolveField: TooltipFieldResolver | undefined
): TooltipRow[] {
  const packed = Array.isArray(item.value) ? item.value : [];
  return dimensions.map((label, dimension) => ({
    color,
    label,
    value: formatEChartsValue(packed[dimension + 1] ?? null, valueFormatter),
    seriesIndex: item.seriesIndex,
    source: resolveField?.({ seriesIndex: item.seriesIndex, dataIndex: item.dataIndex, dimensionIndex: dimension }),
  }));
}

/**
 * ECharts' placeholder name for a series the option left unnamed: an internal
 * `series\0<index>` marker, deliberately containing a NUL so it cannot collide
 * with a user-supplied name. It is not meant to be displayed. Radar draws every
 * polygon as data items of one unnamed series, so without this its rows would
 * read "series 0" instead of the polygon's own name.
 * https://github.com/apache/echarts/blob/master/src/util/model.ts
 */
const DUMMY_SERIES_NAME_PREFIX = 'series\0';

/** Row label for an item: prefer the series name, falling back to its name. */
function getLabel(item: TooltipParam, headerText: string): string {
  if (item.seriesName != null && item.seriesName !== '' && !item.seriesName.startsWith(DUMMY_SERIES_NAME_PREFIX)) {
    return item.seriesName;
  }
  const name = item.name != null ? String(item.name) : '';
  // Avoid repeating the header (used as the item name) as the row label.
  return name === headerText ? '' : name;
}

/**
 * Generic VizTooltip content model for cartesian, pie, and radar charts. Consumes
 * ECharts' `tooltip.formatter` params (a single item, or an array in axis mode)
 * and returns a {@link TooltipModel}. The header mirrors core Grafana's
 * `TimeSeriesTooltip`: the x/time value goes in `header.value` (label empty).
 * https://echarts.apache.org/en/option.html#tooltip.formatter
 */
export function buildTooltipModel(
  params: TopLevelFormatterParams,
  resolveValueFormatter: TooltipValueFormatterResolver,
  { rowOptions, resolveField, formatHeaderValue, multiValueDimensions }: TooltipModelOptions = {}
): TooltipModel {
  const items = Array.isArray(params) ? params : [params];

  // Header is the shared axis label, invariant across rows, so derive it before
  // any hide/sort reshaping.
  const headerText = getHeaderText(items, formatHeaderValue);

  const ordered = rowOptions ? applyTooltipRowOptions(items, (item) => tooltipNumeric(item.value), rowOptions) : items;

  if (multiValueDimensions != null) {
    // Sorting/hiding by "the" value is meaningless when an item carries several,
    // so multi-value items expand in their natural dimension order.
    const rows = items.flatMap((item) =>
      expandMultiValueRows(
        item,
        multiValueDimensions,
        resolveValueFormatter({ seriesIndex: item.seriesIndex, dataIndex: item.dataIndex }),
        tooltipColor(item.color),
        resolveField
      )
    );
    return { header: { label: '', value: headerText }, rows };
  }

  const rows: TooltipRow[] = ordered.map((item) => {
    // Each row formats with its own field's formatter so per-field unit/decimals
    // overrides are respected.
    const valueFormatter = resolveValueFormatter({ seriesIndex: item.seriesIndex, dataIndex: item.dataIndex });
    let value = formatEChartsValue(item.value, valueFormatter);
    // Slice charts (pie) expose the share of the whole as a percentage.
    if (typeof item.percent === 'number') {
      value = `${value} (${item.percent}%)`;
    }

    return {
      color: tooltipColor(item.color),
      label: getLabel(item, headerText),
      value,
      seriesIndex: item.seriesIndex,
      // Every row carries its own source so the overlay can surface the clicked
      // row's data links / ad-hoc filters, mirroring core's hovered-series footer.
      source: resolveField?.({ seriesIndex: item.seriesIndex, dataIndex: item.dataIndex }),
    };
  });

  // Model-level source only when a single item is focused (Single mode, or one
  // hovered slice). A multi-row axis tooltip has no single focused field, so it
  // stays unset and the overlay falls back to the clicked row's own `source`.
  const source = items.length === 1 ? resolveField?.(items[0]) : undefined;

  return { header: { label: '', value: headerText }, rows, source };
}

/**
 * Adapt a {@link TooltipModel} producer into an ECharts `tooltip.formatter`. The
 * returned formatter pushes the model to the React overlay via `sink` and returns
 * an empty string so ECharts renders nothing (the box is styled invisible; see
 * `getSilentTooltipOption`). This is the single bridge between the ECharts option
 * layer and the React tooltip.
 * https://echarts.apache.org/en/option.html#tooltip.formatter
 */
export function toEmittingFormatter(
  produce: (params: TopLevelFormatterParams) => TooltipModel,
  sink: TooltipSink
): (params: TopLevelFormatterParams) => string {
  return (params) => {
    sink(produce(params));
    return '';
  };
}
