import { type PanelOptionsEditorBuilder } from '@grafana/data';
import { PIE_TYPE_DEFAULT, pieTypeCategoryName, pieTypeOptions, pieTypePath } from 'editor/constants';
import { type PanelOptions } from 'types';

/**
 * Register the pie "Pie chart type" radio (Pie / Donut) — Grafana Pie chart
 * parity. Adapted from core's piechart module (`public/app/plugins/panel/
 * piechart/module.tsx`), but placed in a plugin-owned "Pie" category (not core's
 * "Pie chart") so future ECharts-specific shape options can join it. The value
 * drives the ECharts series radius; see `getPieRadius`.
 */
export function addPieTypeOptions(builder: PanelOptionsEditorBuilder<PanelOptions>) {
  builder.addRadio({
    path: pieTypePath,
    name: 'Pie chart type',
    category: [pieTypeCategoryName],
    description: 'How the slices are laid out: a full pie or a donut (a pie with a hole)',
    defaultValue: PIE_TYPE_DEFAULT,
    settings: {
      options: pieTypeOptions,
    },
  });
}
