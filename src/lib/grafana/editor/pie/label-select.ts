import { type PanelOptionsEditorBuilder, type SelectFieldConfigSettings } from '@grafana/data';
import { PIE_LABELS_DEFAULT, pieLabelOptions, pieLabelsCategoryName, pieLabelsPath } from 'editor/pie';
import { type PieLabel } from 'editor/types';
import { type PanelOptions } from 'types';

/**
 * Register the pie "Labels" multi-select (Name / Value / Percent) — Grafana Pie
 * chart parity for slice-label content. Adapted from core's piechart module.
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
