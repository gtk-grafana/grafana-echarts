import { AppPlugin } from '@grafana/data';
import { initPluginTranslations } from '@grafana/i18n';

// This repository is a Grafana app plugin whose sole purpose (for now) is to
// bundle the nested ECharts panel plugins found under `src/<family>/`. Each
// nested folder has its own `plugin.json` + `module.ts` and is discovered by
// Grafana from the built bundle; the app itself has no pages.
// https://grafana.com/developers/plugin-tools/how-to-guides/app-plugins/work-with-nested-plugins
initPluginTranslations('grafana-echarts-app');

export const plugin = new AppPlugin<{}>();
