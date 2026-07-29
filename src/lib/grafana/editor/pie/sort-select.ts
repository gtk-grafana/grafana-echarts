import { type PanelOptionsEditorBuilder } from '@grafana/data';
import { PIE_SORT_DEFAULT, pieSortOptions, pieSortPath } from 'editor/pie';
import { type PanelOptions } from 'types';

/**
 * Register the pie "Slice sorting" select (Descending / Ascending / None) —
 * Grafana Pie chart parity. Adapted from core's piechart module (`public/app/
 * plugins/panel/piechart/module.tsx`). Registered with no `category`, so it sits in
 * the editor's default (top) section rather than under a chart-shape category, and
 * with no `showIf`, so it stays visible in every editor mode. The value orders the
 * shared slice model by value; see `resolvePieSlices`.
 */
export function addPieSortOptions(builder: PanelOptionsEditorBuilder<PanelOptions>) {
  builder.addSelect({
    path: pieSortPath,
    name: 'Slice sorting',
    description: 'Select how to sort the pie slices',
    defaultValue: PIE_SORT_DEFAULT,
    settings: {
      options: pieSortOptions,
    },
  });
}
