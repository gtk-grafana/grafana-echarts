import { css } from '@emotion/css';
import { formattedValueToString, type GrafanaTheme2, type ValueFormatter } from '@grafana/data';
import { SortOrder } from '@grafana/schema';
import { type CallbackDataParams, type TopLevelFormatterParams } from 'echarts/types/dist/shared';

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

/**
 * Emotion styles mirroring Grafana's `VizTooltip` content: a bodySmall column
 * with a bold header and a CSS-table of color-indicator/label/value rows.
 * See @grafana/ui `VizTooltipWrapper` and `SeriesTable`.
 */
const getTemplateStyles = (theme: GrafanaTheme2) => ({
  root: css({
    display: 'flex',
    flexDirection: 'column',
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.bodySmall.fontSize,
    color: theme.colors.text.primary,
  }),
  header: css({
    fontWeight: theme.typography.fontWeightBold,
    marginBottom: theme.spacing(0.5),
  }),
  table: css({
    display: 'table',
  }),
  row: css({
    display: 'table-row',
    fontWeight: theme.typography.fontWeightLight,
  }),
  iconCell: css({
    display: 'table-cell',
    paddingRight: theme.spacing(1),
    verticalAlign: 'middle',
  }),
  labelCell: css({
    display: 'table-cell',
    verticalAlign: 'middle',
    wordBreak: 'break-all',
  }),
  valueCell: css({
    display: 'table-cell',
    verticalAlign: 'middle',
    paddingLeft: theme.spacing(2),
    textAlign: 'right',
    fontWeight: theme.typography.fontWeightMedium,
  }),
  // Small line swatch, matching @grafana/ui `SeriesIcon`.
  marker: css({
    display: 'inline-block',
    width: '14px',
    height: '4px',
    borderRadius: theme.shape.radius.pill,
  }),
});

/** A single series/value line rendered inside the tooltip. */
export interface TooltipRow {
  /** CSS color for the leading swatch; omitted rows render no swatch. */
  color?: string;
  label: string;
  value: string;
  /** Render the row bold to highlight it (e.g. the hovered slice in a pie "All" tooltip). */
  emphasis?: boolean;
}

/**
 * A reusable tooltip container that builds Grafana-styled DOM with the safe DOM
 * APIs (`createElement`/`textContent`, no `innerHTML`). Chart-specific
 * formatters share this so every tooltip renders identically.
 */
export interface TooltipShell {
  /** The root element to hand back to ECharts' `formatter`. */
  root: HTMLDivElement;
  appendHeader(text: string): void;
  appendRow(row: TooltipRow): void;
}

export function buildTooltipShell(theme: GrafanaTheme2): TooltipShell {
  const styles = getTemplateStyles(theme);
  const root = document.createElement('div');
  root.className = styles.root;

  // The rows live in a CSS table so values align in a right-hand column; created
  // lazily so a header-only tooltip stays clean.
  let table: HTMLDivElement | null = null;
  const ensureTable = (): HTMLDivElement => {
    if (!table) {
      table = document.createElement('div');
      table.className = styles.table;
      root.appendChild(table);
    }
    return table;
  };

  return {
    root,
    appendHeader(text) {
      const header = document.createElement('div');
      header.className = styles.header;
      header.textContent = text;
      root.appendChild(header);
    },
    // @todo can we find a more maintainable way to use html templates to hand off to eCharts? i.e. converting an html template without losing potential interactability?
    // @todo we probably need react overlay to support click to pin functionality anyway, so I guess this is fine as a temporary measure
    appendRow({ color, label, value, emphasis }) {
      const row = document.createElement('div');
      row.className = styles.row;
      // Bold the whole row (cascades to its cells) to highlight the hovered slice.
      if (emphasis) {
        // @todo direct style manipulation?
        row.style.fontWeight = String(theme.typography.fontWeightBold);
        row.style.color = String(theme.colors.text.maxContrast);
      }

      const iconCell = document.createElement('div');
      iconCell.className = styles.iconCell;
      if (color) {
        const marker = document.createElement('span');
        marker.className = styles.marker;
        marker.style.background = color;
        iconCell.appendChild(marker);
      }
      row.appendChild(iconCell);

      const labelCell = document.createElement('div');
      labelCell.className = styles.labelCell;
      labelCell.textContent = label;
      row.appendChild(labelCell);

      const valueCell = document.createElement('div');
      valueCell.className = styles.valueCell;
      valueCell.textContent = value;
      row.appendChild(valueCell);

      ensureTable().appendChild(row);
    },
  };
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
 * Generic VizTooltip-style content for cartesian, pie, and radar charts. Returns
 * a detached DOM element for ECharts' `tooltip.formatter`.
 * https://echarts.apache.org/en/option.html#tooltip.formatter
 */
export function buildTooltipContent(
  params: TopLevelFormatterParams,
  resolveValueFormatter: TooltipValueFormatterResolver,
  theme: GrafanaTheme2,
  rowOptions?: TooltipRowOptions
): HTMLElement {
  const items = Array.isArray(params) ? params : [params];
  const shell = buildTooltipShell(theme);

  // Header is the shared axis label, invariant across rows, so derive it before
  // any hide/sort reshaping.
  const header = getHeader(items);
  if (header) {
    shell.appendHeader(header);
  }

  const rows = rowOptions ? applyTooltipRowOptions(items, (item) => tooltipNumeric(item.value), rowOptions) : items;

  for (const item of rows) {
    // Each row formats with its own field's formatter so per-field unit/decimals
    // overrides are respected.
    const valueFormatter = resolveValueFormatter({ seriesIndex: item.seriesIndex, dataIndex: item.dataIndex });
    let value = formatTooltipValue(item.value, valueFormatter);
    // Slice charts (pie) expose the share of the whole as a percentage.
    if (typeof item.percent === 'number') {
      value = `${value} (${item.percent}%)`;
    }

    shell.appendRow({
      color: typeof item.color === 'string' ? item.color : undefined,
      label: getLabel(item, header),
      value,
    });
  }

  return shell.root;
}
