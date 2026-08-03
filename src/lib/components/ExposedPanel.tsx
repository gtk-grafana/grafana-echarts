// Consumer-side counterpart to lib/components/LazyPanel.tsx.
//
// LazyPanel bundles the shared Panel + ECharts core into the plugin itself
// (React.lazy + local import), which is what lets nested panels share one
// async chunk today (see lib/publicPath). This resolves the same Panel from
// the core app's exposed-component registry at runtime instead, so a
// standalone plugin using this never imports 'echarts' at all and carries
// none of that weight in its own bundle. See src/module.ts for the provider
// side (`AppPlugin.exposeComponent`).
import { type PanelProps } from '@grafana/data';
import { usePluginComponent } from '@grafana/runtime';
import { Alert, LoadingPlaceholder } from '@grafana/ui';
import { type ChartFamily } from 'lib/echarts/charts/autoSeriesType';
import React from 'react';
import { type PanelOptions } from 'types';

const CORE_APP_PANEL_COMPONENT_ID = 'grafana-echarts-app/panel/v1';

type ExposedPanelProps = PanelProps<PanelOptions> & { family: ChartFamily };

/** Build the exposed-component panel entry for a standalone plugin, binding its chart `family`. */
export const makeExposedPanel = (family: ChartFamily) => {
  const ExposedPanel = (props: PanelProps<PanelOptions>) => {
    const { component: Panel, isLoading } = usePluginComponent<ExposedPanelProps>(CORE_APP_PANEL_COMPONENT_ID);

    if (isLoading) {
      return <LoadingPlaceholder text="" />;
    }

    if (!Panel) {
      return (
        <Alert title="ECharts core app unavailable" severity="error">
          This panel renders through the grafana-echarts-app exposed component. Install and enable that app to use
          it.
        </Alert>
      );
    }

    return <Panel {...props} family={family} />;
  };
  return ExposedPanel;
};
