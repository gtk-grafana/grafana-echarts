// Lazy boundary for the shared ECharts panel.
//
// Each nested panel plugin's `module.tsx` registers THIS wrapper instead of the
// `Panel` directly. React.lazy defers the `import('./Panel')` until first
// render, so the heavy Panel + ECharts code is emitted as async chunks
// (de-duplicated across the nested panels by the splitChunks groups in
// webpack.config.ts) rather than being bundled into every panel's
// render-blocking `module.js` entry. This is the officially recommended split
// path: React.lazy + Suspense at the plugin entry boundary.
// https://react.dev/reference/react/lazy
//
// Side-effect import: rewrite the async-chunk publicPath before React.lazy
// triggers any import(). Runs eagerly because `module.tsx` imports this file
// statically. See lib/publicPath.
import 'lib/publicPath';
import { type PanelProps } from '@grafana/data';
import { LoadingPlaceholder } from '@grafana/ui';
import React, { lazy, Suspense } from 'react';
import { type PanelOptions } from 'types';

// `.then` re-maps the named `Panel` export to the `default` that React.lazy expects.
const Panel = lazy(() => import('lib/components/Panel').then((m) => ({ default: m.Panel })));

export const LazyPanel = (props: PanelProps<PanelOptions>) => (
  <Suspense fallback={<LoadingPlaceholder text="" />}>
    <Panel {...props} />
  </Suspense>
);
