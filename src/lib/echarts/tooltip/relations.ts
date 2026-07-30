import { type TopLevelFormatterParams } from 'echarts/types/dist/shared';
import { formatEChartsValue } from 'lib/echarts/style';
import {
  type RelationsLinkItem,
  type RelationsNodeItem,
  type RelationsTooltipContext,
  type TooltipModel,
  type TooltipRow,
  type TooltipSource,
} from 'lib/echarts/tooltip/types';

/**
 * A `graph` series emits both node and link hovers through one formatter, so the
 * model has to tell them apart. ECharts sets `dataType` to `'node'` or `'edge'` on
 * the callback params for graph-like series, which is the documented discriminator.
 * https://echarts.apache.org/en/option.html#series-graph.tooltip
 */
function isLinkItem(value: unknown): value is RelationsLinkItem {
  return typeof value === 'object' && value !== null && 'source' in value && 'target' in value;
}

function isNodeItem(value: unknown): value is RelationsNodeItem {
  return typeof value === 'object' && value !== null && 'id' in value && !isLinkItem(value);
}

/**
 * Tooltip content model for the relations (`graph`) series, rendered by the React
 * overlay (`EChartsTooltip`).
 *
 * A relations hover is always a single node or a single link — there is no shared
 * axis pointer — so this is built in the series formatter rather than via an
 * axis-triggered tooltip, matching the hierarchy and pie families.
 *
 * - **Node**: name as header; `mainstat` as the `Value` row, plus `Subtitle` and
 *   `secondarystat` rows when present.
 * - **Link**: `source → target` as header; the resolved weight as `Value`.
 */
export function buildRelationsTooltipModel(
  ctx: RelationsTooltipContext
): (params: TopLevelFormatterParams) => TooltipModel {
  return (params) => {
    const param = Array.isArray(params) ? params[0] : params;
    const data: unknown = param?.data;
    const color = typeof param?.color === 'string' ? param.color : undefined;

    if (isLinkItem(data)) {
      // A link's stats come from the edges frame, so its footer resolves against
      // that frame's `mainstat` rather than the node one.
      const source: TooltipSource | undefined =
        ctx.linkValueField != null && data.sourceRowIndex != null
          ? { field: ctx.linkValueField, rowIndex: data.sourceRowIndex }
          : undefined;
      const rows: TooltipRow[] = [
        {
          color,
          label: 'Value',
          value: formatEChartsValue(data.value ?? null, ctx.formatValue),
          source,
        },
      ];
      return { header: { label: `${data.source} → ${data.target}`, value: '' }, rows, source };
    }

    const node = isNodeItem(data) ? data : undefined;
    // A node built from a nodes-frame row resolves that row's data links. Nodes
    // *derived* from the edges frame carry no row, so they render no footer.
    const source: TooltipSource | undefined =
      ctx.valueField != null && node?.sourceRowIndex != null
        ? { field: ctx.valueField, rowIndex: node.sourceRowIndex }
        : undefined;

    const rows: TooltipRow[] = [
      {
        color,
        label: 'Value',
        // `stat` first: the sankey variant carries `mainstat` there rather than in
        // `value`, which it leaves to ECharts' flow computation. See `RelationsNodeItem`.
        value: formatEChartsValue(node?.stat ?? node?.value ?? null, ctx.formatValue),
        source,
      },
    ];
    if (node?.subtitle != null) {
      rows.push({ label: 'Subtitle', value: node.subtitle });
    }
    if (node?.secondary != null) {
      // `secondarystat` may be a string, in which case it is shown as-is (the
      // node-graph spec: "A string is shown as-is; a number also shows its unit").
      rows.push({
        label: 'Secondary',
        value:
          typeof node.secondary === 'number'
            ? formatEChartsValue(node.secondary, ctx.formatValue)
            : String(node.secondary),
      });
    }

    return { header: { label: node?.name ?? String(param?.name ?? ''), value: '' }, rows, source };
  };
}
