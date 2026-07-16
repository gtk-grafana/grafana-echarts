import { type GrafanaTheme2, type ValueFormatter } from '@grafana/data';
import { type SunburstSeriesOption, type TreemapSeriesOption } from 'echarts';
import { type ECBasicOption, type TopLevelFormatterParams } from 'echarts/types/dist/shared';
import { type HierarchyData, type HierarchyNode } from 'lib/echarts/converters/hierarchy';
import { createBaseOptions } from 'lib/echarts/options/base';
import { getPaletteColorByIndex } from 'lib/echarts/style';
import { buildTooltipShell, formatTooltipValue } from 'lib/echarts/tooltip/template';

/**
 * Base option for hierarchy charts. Series data is merged at render time. The
 * native ECharts legend is omitted: treemap/sunburst nodes are surfaced through
 * the Grafana DOM legend (see charts/hierarchy.ts `buildLegendItems`).
 */
export const hierarchyDefaultOptions: ECBasicOption = {
  ...createBaseOptions(),
};

/**
 * ECharts tree data item shared by the treemap and sunburst series (both accept
 * `{ name, value, children, itemStyle }`). `self` is carried through as an extra
 * field so the tooltip can surface it; ECharts preserves unknown data props.
 */
interface HierarchyTreeItem {
  name: string;
  value?: number;
  self?: number;
  itemStyle?: { color: string };
  children?: HierarchyTreeItem[];
}

/** Type guard so tooltip params (`data`) narrow without a type assertion. */
function isHierarchyTreeItem(value: unknown): value is HierarchyTreeItem {
  return typeof value === 'object' && value !== null && 'name' in value;
}

/** Context needed to build a hierarchy series (colors + tooltip formatting). */
export interface HierarchySeriesContext {
  theme: GrafanaTheme2;
  formatValue: ValueFormatter;
}

/**
 * Map the chart-agnostic tree to ECharts tree data. Top-level nodes are colored
 * from Grafana's classic palette; deeper nodes inherit ECharts' derived shades.
 */
function toTreeData(nodes: HierarchyNode[], theme: GrafanaTheme2, depth = 0): HierarchyTreeItem[] {
  return nodes.map((node, index) => {
    const item: HierarchyTreeItem = {
      name: node.name,
      // ECharts sizes tiles/arcs by `value`; map Grafana nulls to undefined.
      value: node.value ?? undefined,
    };
    if (node.self != null) {
      item.self = node.self;
    }
    if (depth === 0) {
      item.itemStyle = { color: getPaletteColorByIndex(index, theme) };
    }
    if (node.children && node.children.length > 0) {
      item.children = toTreeData(node.children, theme, depth + 1);
    }
    return item;
  });
}

/**
 * Per-item tooltip for hierarchy series: the node name as header, its cumulative
 * `value`, and (when present) its `self` value. Returns safe DOM (no innerHTML)
 * via the shared tooltip shell.
 * https://echarts.apache.org/en/option.html#series-treemap.tooltip
 */
function buildHierarchyTooltip(ctx: HierarchySeriesContext): (params: TopLevelFormatterParams) => HTMLElement {
  return (params) => {
    const param = Array.isArray(params) ? params[0] : params;
    const data = isHierarchyTreeItem(param?.data) ? param.data : undefined;

    const shell = buildTooltipShell(ctx.theme);
    shell.appendHeader(data?.name ?? String(param?.name ?? ''));
    shell.appendRow({
      color: typeof param?.color === 'string' ? param.color : undefined,
      label: 'Value',
      value: formatTooltipValue(data?.value ?? null, ctx.formatValue),
    });
    if (data?.self != null) {
      shell.appendRow({ label: 'Self', value: formatTooltipValue(data.self, ctx.formatValue) });
    }
    return shell.root;
  };
}

/**
 * Treemap series: nested rectangles sized by `value`.
 * https://echarts.apache.org/en/option.html#series-treemap
 */
export function getTreemapSeries(data: HierarchyData, ctx: HierarchySeriesContext): TreemapSeriesOption {
  return {
    type: 'treemap',
    // Off by default: keep the panel static like the other families (no
    // click-to-zoom breadcrumb navigation).
    roam: false,
    nodeClick: false,
    breadcrumb: { show: false },
    data: toTreeData(data.roots, ctx.theme),
    tooltip: { formatter: buildHierarchyTooltip(ctx) },
  };
}

/**
 * Sunburst series: radial rings sized by `value` (an "icicle" laid out in polar
 * coordinates). https://echarts.apache.org/en/option.html#series-sunburst
 */
export function getSunburstSeries(data: HierarchyData, ctx: HierarchySeriesContext): SunburstSeriesOption {
  return {
    type: 'sunburst',
    radius: [0, '95%'],
    nodeClick: false,
    data: toTreeData(data.roots, ctx.theme),
    tooltip: { formatter: buildHierarchyTooltip(ctx) },
  };
}
