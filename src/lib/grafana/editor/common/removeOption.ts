import { type PanelOptionsEditorBuilder } from '@grafana/data';

/**
 * Drop a previously-registered option editor from a builder by its `path`.
 *
 * Grafana's shared builders (e.g. `commonOptionsBuilder.addTooltipOptions`) add
 * a fixed bundle of controls with no way to opt out of individual ones. When a
 * panel wants all-but-one of that bundle, this removes the odd control after the
 * fact. `getItems()` returns the builder's live editor array, so splicing it
 * unregisters the option before the registry is built.
 *
 * No-op when the path isn't present. Only the first match is removed.
 */
export function removeOption<T>(builder: PanelOptionsEditorBuilder<T>, path: string): void {
  const items = builder.getItems();
  const index = items.findIndex((item) => item.path === path);
  if (index >= 0) {
    items.splice(index, 1);
  }
}
