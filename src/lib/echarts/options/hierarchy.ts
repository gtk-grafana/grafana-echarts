import {
  type Field,
  type FieldConfigSource,
  getDisplayProcessor,
  getFieldColorModeForField,
  type GrafanaTheme2,
} from '@grafana/data';
import { type SunburstSeriesOption, type TreemapSeriesOption } from 'echarts';
import { type ECBasicOption } from 'echarts/types/dist/shared';
import { type HierarchyChartContext } from 'lib/echarts/charts/types';
import { type HierarchyData, type HierarchyNode } from 'lib/echarts/converters/hierarchy';
import { createBaseOptions } from 'lib/echarts/options/base';
import { getPaletteColorByIndex } from 'lib/echarts/style';
import { buildHierarchyTooltipModel } from 'lib/echarts/tooltip/hierarchy';
import { seriesTooltip } from 'lib/echarts/tooltip/option';
import { type HierarchyTreeItem } from 'lib/echarts/tooltip/types';
import { getSeriesColorOverride } from 'lib/grafana/fields/seriesConfig';

/**
 * Base option for hierarchy charts. Series data is merged at render time. The
 * native ECharts legend is omitted: treemap/sunburst nodes are surfaced through
 * the Grafana DOM legend (see charts/hierarchy.ts `buildLegendItems`).
 */
export const hierarchyDefaultOptions: ECBasicOption = {
  ...createBaseOptions(),
};

/** Context needed to build a hierarchy series (colors + tooltip formatting). */
export interface HierarchySeriesContext extends HierarchyChartContext {
  // The numeric field sizing the nodes (see `getHierarchyValueField`). Its Color
  // scheme drives node colors for by-value modes; `undefined` falls back to the
  // classic palette.
  valueField?: Field;
}

/** Resolves the color for a single node; `undefined` leaves it to ECharts. */
export type HierarchyColorResolver = (
  name: string,
  value: number | null,
  index: number,
  depth: number
) => string | undefined;

/**
 * Build a node color resolver honoring the value field's Color scheme:
 * - a fixed-color override (legend color picker) always wins, matched by node name;
 * - a by-value scheme (continuous / thresholds / fixed) colors *every* node from
 *   its value via the field's display processor, so the scheme is visible on the
 *   whole tree;
 * - the classic/by-series palette colors each top-level node by position, leaving
 *   deeper nodes to inherit ECharts' derived shades (the categorical default).
 *
 * See https://grafana.com/docs/grafana/latest/panels-visualizations/configure-standard-options/#color-scheme
 */
export function makeHierarchyColorResolver(
  theme: GrafanaTheme2,
  fieldConfig: FieldConfigSource,
  valueField?: Field
): HierarchyColorResolver {
  // Only an explicitly-configured by-value scheme colors by value. With no color
  // config set, Grafana's default mode is by-value (thresholds), but the panel's
  // registered default is the classic palette — so treat "unset" as classic to
  // keep the distinct-per-node categorical default.
  const byValue =
    valueField != null &&
    valueField.config.color?.mode != null &&
    getFieldColorModeForField(valueField).isByValue === true;
  const display =
    byValue && valueField ? (valueField.display ?? getDisplayProcessor({ field: valueField, theme })) : undefined;

  return (name, value, index, depth) => {
    const override = getSeriesColorOverride(fieldConfig, name);
    if (override) {
      return override;
    }
    if (display) {
      return (value != null ? display(value).color : undefined) ?? getPaletteColorByIndex(index, theme);
    }
    return depth === 0 ? getPaletteColorByIndex(index, theme) : undefined;
  };
}

/**
 * Map the chart-agnostic tree to ECharts tree data, coloring nodes via
 * `resolveColor` (see `makeHierarchyColorResolver`). A node with no resolved
 * color is left for ECharts to shade.
 */
function toTreeData(nodes: HierarchyNode[], resolveColor: HierarchyColorResolver, depth = 0): HierarchyTreeItem[] {
  return nodes.map((node, index) => {
    const item: HierarchyTreeItem = {
      name: node.name,
      // ECharts sizes tiles/arcs by `value`; map Grafana nulls to undefined.
      value: node.value ?? undefined,
    };
    if (node.self != null) {
      item.self = node.self;
    }
    if (node.sourceRowIndex != null) {
      item.sourceRowIndex = node.sourceRowIndex;
    }
    const color = resolveColor(node.name, node.value, index, depth);
    if (color != null) {
      item.itemStyle = { color };
    }
    if (node.children && node.children.length > 0) {
      item.children = toTreeData(node.children, resolveColor, depth + 1);
    }
    return item;
  });
}

/**
 * Treemap series: nested rectangles sized by `value`. `zlevel` places the series
 * on its own canvas layer (see the panel's `zLevel.series`) so layered canvas
 * capture can isolate it, matching the other families.
 * https://echarts.apache.org/en/option.html#series-treemap
 */
export function getTreemapSeries(data: HierarchyData, ctx: HierarchySeriesContext): TreemapSeriesOption {
  return {
    type: 'treemap',
    // Off: keep the panel static like the other families (no click-to-zoom
    // breadcrumb navigation). `nodeClick` must stay off for the tooltip too —
    // ECharts' zoom-to-node consumes the click that pins the tooltip, so with it
    // on a node's data links are unreachable.
    roam: false,
    leafDepth: 5,
    nodeClick: false,
    // @todo not working without nodeClick: 'zoomToNode'
    breadcrumb: { show: ctx.options.legend.isVisible, width: ctx.options.legend.width },
    zlevel: ctx.options.zLevel?.series,
    data: toTreeData(data.roots, makeHierarchyColorResolver(ctx.theme, ctx.fieldConfig, ctx.valueField)),
    tooltip: seriesTooltip(buildHierarchyTooltipModel(ctx), ctx.tooltipSink),
  };
}

/**
 * Sunburst series: radial rings sized by `value` (an "icicle" laid out in polar
 * coordinates). `zlevel` places the series on its own canvas layer (see the
 * panel's `zLevel.series`), matching the other families.
 * https://echarts.apache.org/en/option.html#series-sunburst
 */
export function getSunburstSeries(data: HierarchyData, ctx: HierarchySeriesContext): SunburstSeriesOption {
  return {
    type: 'sunburst',
    radius: [0, '95%'],
    nodeClick: false,
    zlevel: ctx.options.zLevel?.series,
    data: toTreeData(data.roots, makeHierarchyColorResolver(ctx.theme, ctx.fieldConfig, ctx.valueField)),
    tooltip: seriesTooltip(buildHierarchyTooltipModel(ctx), ctx.tooltipSink),
  };
}
