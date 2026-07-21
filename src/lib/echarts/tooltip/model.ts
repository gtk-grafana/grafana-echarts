import { type Field, formattedValueToString, type ValueFormatter } from '@grafana/data';
import { SortOrder } from '@grafana/schema';
import { type CallbackDataParams, type TopLevelFormatterParams } from 'echarts/types/dist/shared';

/**
 * The React-free tooltip content model. Chart formatters convert the hovered
 * ECharts `params` into one of these and hand it to the React overlay
 * (`EChartsTooltip`), which renders it with `@grafana/ui`'s `VizTooltip`. Nothing
 * in this module touches the DOM or React — it is pure data derivation, so it
 * stays testable and keeps the ECharts option layer isolated from the React
 * tooltip (see `lib/components/tooltip`).
 */
export interface TooltipModel {
  /** Header text: the shared axis (x/time) label, or the single hovered item's name. */
  header?: string;
  rows: TooltipRow[];
  /**
   * Source field + row of the single hovered item (present only when one item is
   * focused, i.e. Single mode / a single hovered slice). The React footer reads
   * data links and label-based ad-hoc filters from it. Kept as raw `Field`/row so
   * the ECharts layer stays free of `@grafana/ui` (the footer resolves links
   * there instead).
   */
  source?: TooltipSource;
}

/** The hovered item's source field and its row index within that field's values. */
export interface TooltipSource {
  field: Field;
  rowIndex: number;
}

/**
 * Resolve the source {@link TooltipSource} for a hovered tooltip item so the
 * footer can surface data links and ad-hoc filters. Chart families key the item
 * by `seriesIndex` and/or `dataIndex`; families with no clean field mapping
 * (multi-value cartesian, heatmap cells, hierarchy nodes) omit the resolver.
 */
export type TooltipFieldResolver = (item: { seriesIndex?: number; dataIndex?: number }) => TooltipSource | undefined;

/**
 * Receives the latest tooltip content on each hover. Supplied by the React layer
 * (`useEChartsTooltip`) and threaded into the option builders so the ECharts
 * `formatter` can push content to React instead of rendering DOM itself.
 */
export type TooltipSink = (model: TooltipModel) => void;

/**
 * A sink that discards its model. Used as a fallback where no React overlay is
 * wired (e.g. chart-module unit tests that call `buildOption` directly), so the
 * per-series `formatter` can be attached unconditionally.
 */
export const NOOP_TOOLTIP_SINK: TooltipSink = () => undefined;

/** A single series/value line rendered inside the tooltip. */
export interface TooltipRow {
  /** CSS color for the leading swatch; omitted rows render no swatch. */
  color?: string;
  label: string;
  value: string;
  /** Render the row highlighted (e.g. the hovered slice in a pie "All" tooltip). */
  emphasis?: boolean;
}

/**
 * Axis-trigger tooltip params carry extra axis fields that ECharts adds at
 * runtime but omits from `CallbackDataParams`.
 * https://echarts.apache.org/en/option.html#tooltip.formatter
 */
type TooltipParam = CallbackDataParams & {
  axisValueLabel?: string;
  axisValue?: number | string;
};

/**
 * Resolve the value formatter for a single hovered tooltip item. Chart families
 * lay out series differently (one series per field vs. one series with per-field
 * data items), so each supplies its own resolver keyed by `seriesIndex` and/or
 * `dataIndex`. This is what lets tooltips honor per-field unit/decimals overrides
 * instead of formatting every row with one shared formatter.
 */
export type TooltipValueFormatterResolver = (item: { seriesIndex?: number; dataIndex?: number }) => ValueFormatter;

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

/**
 * Unwrap the value ECharts hands a tooltip item. Array data items (cartesian
 * `[time, value]`, heatmap `[..., value]`) carry the numeric magnitude last;
 * scalar items are their own value.
 */
function unwrapTooltipValue(eChartValue: CallbackDataParams['value']): CallbackDataParams['value'] {
  return Array.isArray(eChartValue) ? eChartValue[eChartValue.length - 1] : eChartValue;
}

/** The numeric magnitude of a tooltip item, or `undefined` for non-numeric/empty values. */
function tooltipNumeric(eChartValue: CallbackDataParams['value']): number | undefined {
  const numeric = unwrapTooltipValue(eChartValue);
  return typeof numeric === 'number' ? numeric : undefined;
}

/**
 * Format a raw ECharts tooltip value with Grafana's field formatter.
 * See https://echarts.apache.org/en/option.html#tooltip.valueFormatter
 */
export function formatTooltipValue(
  eChartValue: CallbackDataParams['value'],
  grafanaFormatValue: ValueFormatter
): string {
  const numeric = unwrapTooltipValue(eChartValue);
  if (typeof numeric === 'number') {
    return formattedValueToString(grafanaFormatValue(numeric));
  }

  // Empty (null/undefined) values route through the field formatter as `NaN`,
  // which it renders as the field's standard "No value" text (see
  // `getValueFormatter`). `NaN` is used because `ValueFormatter` is typed to
  // accept a number, and the formatter treats `NaN` the same as null.
  if (numeric == null) {
    return formattedValueToString(grafanaFormatValue(NaN));
  }

  // A genuine non-null, non-numeric value (e.g. a category label).
  return String(numeric);
}

/**
 * The "All"-mode tooltip options shared with Grafana's common tooltip: hide rows
 * whose value is exactly zero, and order rows by value. Both only apply in Multi
 * mode, mirroring `commonOptionsBuilder.addTooltipOptions`.
 */
export interface TooltipRowOptions {
  sort?: SortOrder;
  hideZeros?: boolean;
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

/** Header text: the shared axis (x/time) label, or the single item's name. */
function getHeader(items: TooltipParam[]): string {
  const [first] = items;
  if (first?.axisValueLabel != null) {
    return first.axisValueLabel;
  }
  if (items.length === 1 && first?.name != null) {
    return String(first.name);
  }
  return '';
}

/** Row label for an item: prefer the series name, falling back to its name. */
function getLabel(item: TooltipParam, header: string): string {
  if (item.seriesName != null && item.seriesName !== '') {
    return item.seriesName;
  }
  const name = item.name != null ? String(item.name) : '';
  // Avoid repeating the header (used as the item name) as the row label.
  return name === header ? '' : name;
}

/**
 * Generic VizTooltip content model for cartesian, pie, and radar charts. Consumes
 * ECharts' `tooltip.formatter` params (a single item, or an array in axis mode)
 * and returns a {@link TooltipModel}.
 * https://echarts.apache.org/en/option.html#tooltip.formatter
 */
export function buildTooltipModel(
  params: TopLevelFormatterParams,
  resolveValueFormatter: TooltipValueFormatterResolver,
  rowOptions?: TooltipRowOptions,
  resolveField?: TooltipFieldResolver
): TooltipModel {
  const items = Array.isArray(params) ? params : [params];

  // Header is the shared axis label, invariant across rows, so derive it before
  // any hide/sort reshaping.
  const header = getHeader(items);

  const ordered = rowOptions ? applyTooltipRowOptions(items, (item) => tooltipNumeric(item.value), rowOptions) : items;

  const rows: TooltipRow[] = ordered.map((item) => {
    // Each row formats with its own field's formatter so per-field unit/decimals
    // overrides are respected.
    const valueFormatter = resolveValueFormatter({ seriesIndex: item.seriesIndex, dataIndex: item.dataIndex });
    let value = formatTooltipValue(item.value, valueFormatter);
    // Slice charts (pie) expose the share of the whole as a percentage.
    if (typeof item.percent === 'number') {
      value = `${value} (${item.percent}%)`;
    }

    return {
      color: typeof item.color === 'string' ? item.color : undefined,
      label: getLabel(item, header),
      value,
    };
  });

  // Footer source only when a single series is focused (Single mode / single
  // item). "All" (axis) tooltips list many series with no single focus, so — like
  // core Grafana — they carry no footer.
  const source = resolveField != null && items.length === 1 ? resolveField(items[0]) : undefined;

  return { header: header || undefined, rows, source };
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
