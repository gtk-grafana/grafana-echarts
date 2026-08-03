// Lazy wrapper for the component exposed by the core app via AppPlugin.exposeComponent (see ../../module.ts).
//
// Mirrors LazyPanel's pattern (defer the Panel + ECharts import until first
// render) so the app's own entry (module.ts) stays a thin synchronous bundle.
// Panel/ECharts still only loads once, on demand, when some consuming plugin
// first renders the exposed component, same async-chunk sharing as today,
// just reached through the exposed-component registry instead of a local
// React.lazy import.
import { type PanelProps } from '@grafana/data';
import { LoadingPlaceholder } from '@grafana/ui';
import { type ChartFamily } from 'lib/echarts/charts/autoSeriesType';
import React, { lazy, Suspense } from 'react';
import { type PanelOptions } from 'types';

const Panel = lazy(() => import('lib/components/Panel').then((m) => ({ default: m.Panel })));

export type ExposedPanelProps = PanelProps<PanelOptions> & { family: ChartFamily };

export const ExposedPanelComponent: React.FC<ExposedPanelProps> = (props) => (
  <Suspense fallback={<LoadingPlaceholder text="" />}>
    <Panel {...props} />
  </Suspense>
);
