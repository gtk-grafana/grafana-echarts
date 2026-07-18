import { type VizLegendItem } from '@grafana/ui';
import { frameToHierarchy, getHierarchyValueField } from 'lib/echarts/converters/hierarchy';
import {
  getSunburstSeries,
  getTreemapSeries,
  hierarchyDefaultOptions,
  type HierarchySeriesContext,
  makeHierarchyColorResolver,
} from 'lib/echarts/options/hierarchy';
import { DEFAULT_CHART_LEGEND } from 'lib/echarts/options/legend';
import {
  type ChartModule,
  type EChartSunburstSeriesOption,
  type EChartTreemapSeriesOption,
  type HierarchyChartContext,
} from './types';

/**
 * Hierarchy chart family: treemap and sunburst built from a value-weighted tree.
 *
 * The tree is reconstructed from either a flame-graph nested-set frame or a flat
 * categorical frame (see echarts/converters/hierarchy.ts). Both render variants
 * share the same model; `ctx.seriesType` selects treemap vs sunburst.
 */
export const hierarchyChartModule: ChartModule = {
  legend: DEFAULT_CHART_LEGEND,

  getTooltipValueFormatter(ctx) {
    // A single value dimension sizes every node, so all items share the panel's
    // formatter. The per-series tooltip (see options/hierarchy.ts) overrides the
    // content anyway; this is the fallback for the generic tooltip path.
    return () => ctx.formatValue;
  },

  buildOption(ctx: HierarchyChartContext, _base): EChartTreemapSeriesOption | EChartSunburstSeriesOption | null {
    const data = frameToHierarchy(ctx.frames, ctx.theme);
    if (!data) {
      return null;
    }

    const seriesCtx: HierarchySeriesContext = {
      ...ctx,
      valueField: getHierarchyValueField(ctx.frames),
    };

    if (ctx.seriesType === 'sunburst') {
      return { ...hierarchyDefaultOptions, series: [getSunburstSeries(data, seriesCtx)] };
    }
    return { ...hierarchyDefaultOptions, series: [getTreemapSeries(data, seriesCtx)] };
  },

  buildLegendItems(ctx): VizLegendItem[] {
    const data = frameToHierarchy(ctx.frames, ctx.theme);
    if (!data) {
      return [];
    }

    // Only top-level nodes are listed; deeper nodes inherit derived shades and
    // would overwhelm a flat legend. Swatch color mirrors the chart via the shared
    // resolver: a fixed-color override wins, then the field's by-value color
    // scheme, then the classic palette by position.
    const resolveColor = makeHierarchyColorResolver(ctx.theme, ctx.fieldConfig, getHierarchyValueField(ctx.frames));
    return data.roots.map((root, index) => ({
      label: root.name,
      fieldName: root.name,
      color: resolveColor(root.name, root.value, index, 0),
      yAxis: 1,
      getItemKey: () => `hierarchy-${index}`,
      getDisplayValues: () => [],
    }));
  },
};
