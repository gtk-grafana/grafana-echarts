import { type CustomTransformOperator, type DataFrame, type DataTransformerConfig } from '@grafana/data';

/**
 * Registration shim for `PanelPlugin.setDataTransformations`, the panel-registered
 * transformations API proposed in grafana/grafana#129992.
 *
 * Transformations a plugin registers this way run in their own `SceneDataTransformer`,
 * nested between the query runner and the user's transformer:
 *
 *     SceneQueryRunner -> PanelPluginDataTransformer -> SceneDataTransformer (user)
 *                                                    -> VizPanel.applyFieldConfig
 *
 * So they run **before** field overrides, which is the entire reason this plugin wants
 * them: a legacy node-graph frame converted here produces one field per node and per
 * edge *before* the override pass, so each mark becomes an ordinary `byName` override
 * target and appears in the override editor's field picker. Converting inside the panel
 * cannot achieve that — it is downstream of `applyFieldOverrides`.
 *
 * The API is unreleased, so it is absent from `@grafana/data` 13.1.1's types and from
 * any host that has not built the PR. Both are handled by feature-detection rather than
 * a version check, so the plugin still *loads* on an older host — but a family that
 * depends on a registered transformation to reshape its input cannot draw there, and
 * says so rather than rendering nothing (see `frameToRelationsGraph`). The host
 * additionally gates execution behind `grafana.panelPluginTransformations`, off by
 * default, so registering unconditionally here is safe.
 */

/** The supplier signature from the PR: evaluated on every data update. */
export type PanelDataTransformationsSupplier = (ctx: {
  series: DataFrame[];
}) => Array<DataTransformerConfig | CustomTransformOperator> | undefined;

interface PluginWithDataTransformations {
  setDataTransformations: (supplier: PanelDataTransformationsSupplier) => unknown;
}

function supportsDataTransformations(plugin: unknown): plugin is PluginWithDataTransformations {
  // Feature detection rather than a version check: the method is absent from
  // `@grafana/data` 13.1.1's types *and* from any host built without the PR.
  return (
    typeof plugin === 'object' &&
    plugin !== null &&
    'setDataTransformations' in plugin &&
    typeof plugin.setDataTransformations === 'function'
  );
}

/**
 * Register `supplier` when the host supports panel-registered transformations.
 *
 * Returns the plugin unchanged so it stays chainable, and reports whether registration
 * happened so callers can assert on it in tests.
 */
export function setDataTransformations<T>(plugin: T, supplier: PanelDataTransformationsSupplier): T {
  if (supportsDataTransformations(plugin)) {
    plugin.setDataTransformations(supplier);
  }
  return plugin;
}

/** True when the running host exposes the API. Exported for diagnostics and tests. */
export function hostSupportsDataTransformations(plugin: unknown): boolean {
  return supportsDataTransformations(plugin);
}
