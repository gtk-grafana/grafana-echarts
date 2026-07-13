// Single entry point for the ECharts runtime surface used by the plugin.
import {
  BarChart,
  BoxplotChart,
  CandlestickChart,
  CustomChart,
  EffectScatterChart,
  HeatmapChart,
  LineChart,
  PieChart,
  RadarChart,
  ScatterChart,
} from 'echarts/charts';
import {
  AxisPointerComponent,
  BrushComponent,
  GridComponent,
  LegendComponent,
  RadarComponent,
  TooltipComponent,
  VisualMapContinuousComponent,
} from 'echarts/components';
//
// Instead of importing the full `echarts` barrel (which bundles every series
// type and component), we pull in the modular `echarts/core` and register only
// the charts/components the panels actually render. This lets webpack
// tree-shake everything unused and keeps each panel bundle small.
// See https://echarts.apache.org/handbook/en/basics/import (import by parts).
//
// The registered set is the UNION of what the shared `Panel`/`resolveChartModule`
// dispatch can render at runtime (cartesian line/bar/scatter, heatmap cells via
// a custom series, pie, radar). It is intentionally not split per family yet:
// the shared runtime can route any family, so under-registering would break
// rendering. Narrowing this per panel is a follow-up once the registry dispatch
// is collapsed.
//
// `use` is aliased to avoid the react-hooks lint rule mistaking ECharts' `use()`
// for the React `use` hook.
import { use as registerEChartsModules } from 'echarts/core';
// In ECharts 6 `grid.containLabel` is a no-op unless this legacy feature is
// registered; without it axis labels overflow the grid. Registering it restores
// label-aware grid layout for the cartesian charts.
// https://echarts.apache.org/handbook/en/basics/release-note/v6-upgrade-guide/#about-grid-containlabel
import { LegacyGridContainLabel } from 'echarts/features';
import { CanvasRenderer } from 'echarts/renderers';

registerEChartsModules([
  // Series renderers
  LineChart,
  BarChart,
  ScatterChart,
  EffectScatterChart,
  CandlestickChart, // multi-value cartesian: OHLC
  BoxplotChart, // multi-value cartesian: [min, Q1, median, Q3, max]
  PieChart,
  RadarChart,
  CustomChart, // binned heatmap cells are drawn as a custom series
  HeatmapChart, // native series for the matrix heatmap layout (category x category grid)
  // ToolboxComponent,
  // Components
  GridComponent,
  TooltipComponent,
  LegendComponent,
  AxisPointerComponent,
  BrushComponent, // drag-select on the time axis for range zoom
  RadarComponent, // radar coordinate system
  VisualMapContinuousComponent, // heatmap color gradient
  // Features
  LegacyGridContainLabel, // makes `grid.containLabel` work in ECharts 6
  // Renderer
  CanvasRenderer,
]);

// `init` creates a chart instance bound to a DOM node. This module is imported
// statically by Panel.tsx, which is itself React.lazy-loaded (see
// lib/components/LazyPanel), so the registered ECharts bundle becomes a shared
// async chunk across the nested panels rather than being duplicated into each
// panel's entry.
export { init } from 'echarts/core';
export type { EChartsType } from 'echarts/core';

// Recovers the instance bound to a DOM node by `init`. Used by tests to gate on
// instance lifecycle events (e.g. 'finished') without threading the instance out
// of Panel. https://echarts.apache.org/en/api.html#echarts.getInstanceByDom
export { getInstanceByDom } from 'echarts/core';
