// Single entry point for the ECharts runtime surface used by the plugin.
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
// Aliased to avoid the react-hooks lint rule mistaking ECharts' `use()` for the
// React `use` hook.
import { use as registerEChartsModules } from 'echarts/core';
import {
  BarChart,
  CustomChart,
  EffectScatterChart,
  LineChart,
  PieChart,
  RadarChart,
  ScatterChart,
} from 'echarts/charts';
import {
  AxisPointerComponent,
  GridComponent,
  LegendComponent,
  RadarComponent,
  TooltipComponent,
  VisualMapContinuousComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

registerEChartsModules([
  // Series renderers
  LineChart,
  BarChart,
  ScatterChart,
  EffectScatterChart,
  PieChart,
  RadarChart,
  CustomChart, // heatmap cells are drawn as a custom series
  // Components
  GridComponent,
  TooltipComponent,
  LegendComponent,
  AxisPointerComponent,
  RadarComponent, // radar coordinate system
  VisualMapContinuousComponent, // heatmap color gradient
  // Renderer
  CanvasRenderer,
]);

// `graphic` exposes zrender helpers (e.g. clipRectByRect) used by the heatmap
// custom-series renderItem; `init` creates a chart instance.
export { init, graphic } from 'echarts/core';
export type { EChartsType } from 'echarts/core';
