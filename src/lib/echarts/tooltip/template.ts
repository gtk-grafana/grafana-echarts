import { css } from '@emotion/css';
import { formattedValueToString, type GrafanaTheme2, type ValueFormatter } from '@grafana/data';
import { type CallbackDataParams, type TopLevelFormatterParams } from 'echarts/types/dist/shared';
import { type OptionDataValue } from 'echarts/types/src/util/types';

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
 * Format a raw ECharts tooltip value with Grafana's field formatter. 
 * See https://echarts.apache.org/en/option.html#tooltip.valueFormatter
 */
export function formatTooltipValue(
  eChartValue: OptionDataValue | OptionDataValue[],
  grafanaFormatValue: ValueFormatter
): string {
  const numeric = Array.isArray(eChartValue) ? eChartValue[eChartValue.length - 1] : eChartValue;
  if (typeof numeric === 'number') {
    return formattedValueToString(grafanaFormatValue(numeric));
  }

  // @todo better defaults
  return eChartValue != null ? eChartValue.toString() : 'N/A';
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
    appendRow({ color, label, value }) {
      const row = document.createElement('div');
      row.className = styles.row;

      const iconCell = document.createElement('div');
      iconCell.className = styles.iconCell;
      if (color) {
        const marker = document.createElement('span');
        marker.className = styles.marker;
        // Color is only ever a CSS value, never markup.
        marker.style.background = String(color);
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
  valueFormatter: ValueFormatter,
  theme: GrafanaTheme2
): HTMLElement {
  const items = (Array.isArray(params) ? params : [params]) as TooltipParam[];
  const shell = buildTooltipShell(theme);

  const header = getHeader(items);
  if (header) {
    shell.appendHeader(header);
  }

  for (const item of items) {
    let value = formatTooltipValue(item.value as OptionDataValue | OptionDataValue[], valueFormatter);
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
