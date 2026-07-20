import { type GrafanaTheme2 } from '@grafana/data';
import { TooltipDisplayMode } from '@grafana/schema';
import { type CallbackDataParams, type TopLevelFormatterParams } from 'echarts/types/dist/shared';
import { formatPieShare, getPieSliceFormatters, getPieSliceTotal } from 'lib/echarts/converters/pie';
import { type PieSliceModel } from 'lib/echarts/converters/types';
import { buildTooltipShell, formatTooltipValue } from 'lib/echarts/tooltip/template';

/**
 * Build the ECharts `series.tooltip.formatter` for the pie, modeled on the
 * hierarchy tooltip and rendered with the shared Grafana-styled tooltip shell
 * (safe DOM, no innerHTML). Content mirrors core Grafana's pie tooltip:
 *
 * - **Single**: the hovered slice — its name as the header, then its value and
 *   share of the whole (`value (pct%)`).
 * - **All** (`Multi`): every visible slice listed with a color swatch, value, and
 *   percentage, with the hovered slice emphasized. The header names the hovered
 *   slice.
 *
 * Percentages are computed from the total of the visible slices (the same set the
 * chart draws), so they stay consistent whichever slice is hovered. `slices` are
 * the visible slices in render order; each carries its source field so values
 * format with that field's unit/decimals.
 *
 * `hideZeros` drops zero-value slices from the "All" list (common tooltip parity).
 * Unlike the cartesian tooltip, pie rows are not re-sorted by the tooltip's `sort`
 * option: the pie's own slice `sort` already governs slice/legend/tooltip order.
 */
export function buildPieTooltip(
  slices: PieSliceModel[],
  mode: TooltipDisplayMode,
  theme: GrafanaTheme2,
  timeZone?: string,
  hideZeros = false
): (params: TopLevelFormatterParams) => HTMLElement {
  // Precompute per-slice formatters and the whole once; the formatter closure is
  // reused on every hover.
  const formatters = getPieSliceFormatters(slices, theme, timeZone);
  const total = getPieSliceTotal(slices);

  const rowValue = (index: number): string => {
    const slice = slices[index];
    const value = formatTooltipValue(slice.value ?? null, formatters[index]);
    return `${value} (${formatPieShare(slice.value, total, slice.field.config.decimals)})`;
  };

  return (params) => {
    const param = Array.isArray(params) ? params[0] : params;
    const hoveredIndex = resolveHoveredIndex(param, slices);
    const shell = buildTooltipShell(theme);

    shell.appendHeader(hoveredIndex >= 0 ? slices[hoveredIndex].name : String(param?.name ?? ''));

    if (mode === TooltipDisplayMode.Multi) {
      slices.forEach((slice, index) => {
        // Skip zero-value slices when hiding zeros; nulls ("No value") are kept.
        // Iterate by original index so `rowValue`/formatters and emphasis stay aligned.
        if (hideZeros && slice.value === 0) {
          return;
        }
        shell.appendRow({
          color: slice.color,
          label: slice.name,
          value: rowValue(index),
          emphasis: index === hoveredIndex,
        });
      });
      return shell.root;
    }

    // Single: only the hovered slice. Header already shows its name, so the row
    // itself carries just the swatch and value + share (no repeated label).
    if (hoveredIndex >= 0) {
      shell.appendRow({ color: slices[hoveredIndex].color, label: '', value: rowValue(hoveredIndex) });
    }
    return shell.root;
  };
}

/** Locate the hovered slice by `dataIndex`, falling back to a name match. */
function resolveHoveredIndex(param: CallbackDataParams | undefined, slices: PieSliceModel[]): number {
  if (typeof param?.dataIndex === 'number' && param.dataIndex >= 0 && param.dataIndex < slices.length) {
    return param.dataIndex;
  }
  if (param?.name != null) {
    return slices.findIndex((slice) => slice.name === String(param.name));
  }
  return -1;
}
