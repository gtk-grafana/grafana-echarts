import { AppPlugin } from '@grafana/data';
import { ExposedPanelComponent } from 'lib/components/ExposedPanelComponent';

// This repository is a Grafana app plugin whose sole purpose (for now) is to
// bundle the nested ECharts panel plugins found under `src/<family>/`. Each
// nested folder has its own `plugin.json` + `module.ts` and is discovered by
// Grafana from the built bundle; the app itself has no pages.
// https://grafana.com/developers/plugin-tools/how-to-guides/app-plugins/work-with-nested-plugins
export const plugin = new AppPlugin<{}>().exposeComponent({
  id: 'grafana-echarts-app/panel/v1',
  title: 'ECharts panel renderer',
  description:
    'Renders a chart family (cartesian, heatmap, pie, ...) via the shared ECharts core. PoC for cross-plugin asset sharing without nesting: consumers get this component instead of bundling echarts/zrender themselves.',
  component: ExposedPanelComponent,
});
