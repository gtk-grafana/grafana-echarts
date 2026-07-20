import { type PanelOptionsEditorBuilder } from '@grafana/data';
import { PIE_SORT_DEFAULT, pieSortOptions, pieSortPath, pieTypeCategoryName } from 'editor/constants';
import { type PanelOptions } from 'types';

/**
 * Register the pie "Slice sorting" select (Descending / Ascending / None) —
 * Grafana Pie chart parity. Adapted from core's piechart module (`public/app/
 * plugins/panel/piechart/module.tsx`), placed in the plugin-owned "Pie" category
 * alongside the chart type. The value orders the shared slice model by value; see
 * `resolvePieSlices`.
 */
export function addPieSortOptions(builder: PanelOptionsEditorBuilder<PanelOptions>) {
  builder.addSelect({
    path: pieSortPath,
    name: 'Slice sorting',
    category: [pieTypeCategoryName],
    description: 'Select how to sort the pie slices',
    defaultValue: PIE_SORT_DEFAULT,
    settings: {
      options: pieSortOptions,
    },
  });
}
