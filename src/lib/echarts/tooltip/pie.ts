import { type GrafanaTheme2 } from '@grafana/data';
import { TooltipDisplayMode } from '@grafana/schema';
import { type CallbackDataParams, type TopLevelFormatterParams } from 'echarts/types/dist/shared';
import { formatPieShare, getPieSliceFormatters, getPieSliceTotal } from 'lib/echarts/converters/pie';
import { type PieSliceModel } from 'lib/echarts/converters/types';
import { formatTooltipValue, type TooltipModel, type TooltipRow } from 'lib/echarts/tooltip/model';

/**
 * Build the pie's `series.tooltip.formatter` content model, modeled on the
 * hierarchy tooltip and rendered by the React overlay (`EChartsTooltip`) with
 * Grafana's `VizTooltip`. Content mirrors core Grafana's pie tooltip:
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
export function buildPieTooltipModel(
  slices: PieSliceModel[],
  mode: TooltipDisplayMode,
  theme: GrafanaTheme2,
  timeZone?: string,
  hideZeros = false
): (params: TopLevelFormatterParams) => TooltipModel {
  // Precompute per-slice formatters and the whole once; the formatter closure is
  // reused on every hover.
  const formatters = getPieSliceFormatters(slices, theme, timeZone);
  const total = getPieSliceTotal(slices);

  const rowValue = (index: number): string => {
    const slice = slices[index];
    const value = formatTooltipValue(slice.value ?? null, formatters[index]);
    return `${value} (${formatPieShare(slice.value, total, slice.field.config.decimals)})`;
  };

  // Per-slice footer sources: pie slice fields carry a single value, so the row
  // index is always 0.
  const sliceSource = (index: number) => ({ field: slices[index].field, rowIndex: 0 });

  return (params) => {
    const param = Array.isArray(params) ? params[0] : params;
    const hoveredIndex = resolveHoveredIndex(param, slices);
    // Item chart: the hovered slice's name is the header label (core pie shows
    // the name on the left; time-style headers put the value on the right).
    const header = { label: hoveredIndex >= 0 ? slices[hoveredIndex].name : String(param?.name ?? ''), value: '' };
    const source = hoveredIndex >= 0 ? sliceSource(hoveredIndex) : undefined;

    if (mode === TooltipDisplayMode.Multi) {
      const rows: TooltipRow[] = [];
      slices.forEach((slice, index) => {
        // Skip zero-value slices when hiding zeros; nulls ("No value") are kept.
        // Iterate by original index so `rowValue`/formatters and emphasis stay aligned.
        if (hideZeros && slice.value === 0) {
          return;
        }
        rows.push({
          color: slice.color,
          label: slice.name,
          value: rowValue(index),
          emphasis: index === hoveredIndex,
          source: sliceSource(index),
        });
      });
      return { header, rows, source };
    }

    // Single: only the hovered slice. Header already shows its name, so the row
    // itself carries just the swatch and value + share (no repeated label).
    if (hoveredIndex >= 0) {
      return {
        header,
        rows: [{ color: slices[hoveredIndex].color, label: '', value: rowValue(hoveredIndex), source }],
        source,
      };
    }
    return { header, rows: [] };
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
