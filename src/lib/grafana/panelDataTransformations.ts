import { type CustomTransformOperator, type DataFrame, type DataTransformerConfig } from '@grafana/data';

/**
 * Registration shim for `PanelPlugin.setDataTransformations`, the panel-registered
 * transformations API proposed in grafana/grafana#129992.
 *
 * The host splices what a plugin registers here ahead of the user's own transformation list,
 * in the panel's single `SceneDataTransformer`:
 *
 *     SceneQueryRunner -> SceneDataTransformer [registered, then user]
 *                      -> VizPanel.applyFieldConfig
 *
 * So they run **before** field overrides, which is the entire reason this plugin wants
 * them: a legacy node-graph frame converted here produces one field per node and per
 * edge *before* the override pass, so each mark becomes an ordinary `byName` override
 * target and appears in the override editor's field picker. Converting inside the panel
 * cannot achieve that — it is downstream of `applyFieldOverrides`.
 *
 * Being a **prefix** is the one thing to design around: registered transformations see the
 * query result and nothing else, so a response that only becomes a graph after the user's
 * transformations cannot be claimed at all, and a frame this prefix emits can be dropped by a
 * user transformation downstream (`joinByField` discards any frame without the join field).
 * `deriveNodes` is the pass that feels both — see `converters/deriveNodes.ts` and
 * ../../../docs/relations-derived-nodes.md.
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
export type SystemTransformationsSupplier = (ctx: {
  series: DataFrame[];
}) => Array<DataTransformerConfig | CustomTransformOperator> | undefined;

interface PluginWithSystemTransformations {
  setSystemTransformations: (supplier: SystemTransformationsSupplier) => unknown;
}

function supportsSystemTransformations(plugin: unknown): plugin is PluginWithSystemTransformations {
  // Feature detection rather than a version check: the method is absent from
  // `@grafana/data` 13.1.1's types *and* from any host built without the PR.
  return (
    typeof plugin === 'object' &&
    plugin !== null &&
    'setSystemTransformations' in plugin &&
    typeof plugin.setSystemTransformations === 'function'
  );
}

/**
 * Register `supplier` when the host supports panel-registered transformations.
 *
 * Returns the plugin unchanged so it stays chainable, and reports whether registration
 * happened so callers can assert on it in tests.
 */
export function setSystemTransformations<T>(plugin: T, supplier: SystemTransformationsSupplier): T {
  if (supportsSystemTransformations(plugin)) {
    plugin.setSystemTransformations(supplier);
  }
  return plugin;
}

/** True when the running host exposes the API. Exported for diagnostics and tests. */
export function hostSupportsDataTransformations(plugin: unknown): boolean {
  return supportsSystemTransformations(plugin);
}
