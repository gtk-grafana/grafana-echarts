import { type PanelOptionsEditorBuilder, type SelectFieldConfigSettings } from '@grafana/data';
import { PIE_LABELS_DEFAULT, pieLabelOptions, pieLabelsCategoryName, pieLabelsPath } from 'editor/constants';
import { type PieLabel } from 'editor/types';
import { type PanelOptions } from 'types';

/**
 * Register the pie "Labels" multi-select (Name / Value / Percent) — Grafana Pie
 * chart parity for slice-label content. Adapted from core's piechart module
 * (`public/app/plugins/panel/piechart/module.tsx`), but placed in a plugin-owned
 * "Labels" category (not core's "Pie chart") so future ECharts-specific label
 * options can join it. The selected set drives `getPieContentLabel`; the default
 * is the slice name (`PIE_LABELS_DEFAULT`).
 *
 * The generic is pinned to the single-option type `PieLabel`: `addMultiSelect`
 * types `defaultValue` and `settings.options` with the *same* type, so an array
 * default (`PieLabel[]`) is cast through here rather than mis-inferring the option
 * type off it.
 */
export function addPieLabelOptions(builder: PanelOptionsEditorBuilder<PanelOptions>) {
  builder.addMultiSelect<PieLabel, SelectFieldConfigSettings<PieLabel>>({
    path: pieLabelsPath,
    name: 'Labels',
    category: [pieLabelsCategoryName],
    description: 'Select the labels to be displayed on the pie slices',
    defaultValue: PIE_LABELS_DEFAULT,
    settings: {
      options: pieLabelOptions,
    },
  });
}
