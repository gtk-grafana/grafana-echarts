import { type TopLevelFormatterParams } from 'echarts/types/dist/shared';
import { formatEChartsValue } from 'lib/echarts/style';
import {
  type HierarchyTooltipContext,
  type HierarchyTreeItem,
  type TooltipModel,
  type TooltipRow,
} from 'lib/echarts/tooltip/types';

/** Type guard so tooltip params (`data`) narrow without a type assertion. */
function isHierarchyTreeItem(value: unknown): value is HierarchyTreeItem {
  return typeof value === 'object' && value !== null && 'name' in value;
}

/**
 * Tooltip content model for hierarchy series, rendered by the React overlay
 * (`EChartsTooltip`). https://echarts.apache.org/en/option.html#series-treemap.tooltip
 *
 * The hovered node: its name as header, cumulative `value`, and (when present)
 * `self`. Hierarchy always hovers per item (no shared axis pointer), so this is
 * built in the formatter rather than via an axis-triggered tooltip.
 */
export function buildHierarchyTooltipModel(
  ctx: HierarchyTooltipContext
): (params: TopLevelFormatterParams) => TooltipModel {
  return (params) => {
    const param = Array.isArray(params) ? params[0] : params;
    const hovered = isHierarchyTreeItem(param?.data) ? param.data : undefined;
    // A node built from a single source row resolves that row's data links
    // against the value field (see `EChartsTooltip`). Nodes with no backing row
    // (aggregated flame-graph parents) render no footer.
    const source =
      ctx.valueField != null && hovered?.sourceRowIndex != null
        ? { field: ctx.valueField, rowIndex: hovered.sourceRowIndex }
        : undefined;
    const rows: TooltipRow[] = [
      {
        color: typeof param?.color === 'string' ? param.color : undefined,
        label: 'Value',
        value: formatEChartsValue(hovered?.value ?? null, ctx.formatValue),
        source,
      },
    ];
    if (hovered?.self != null) {
      rows.push({ label: 'Self', value: formatEChartsValue(hovered.self, ctx.formatValue) });
    }
    // Item chart: the hovered node's name is the header label.
    return { header: { label: hovered?.name ?? String(param?.name ?? ''), value: '' }, rows, source };
  };
}
