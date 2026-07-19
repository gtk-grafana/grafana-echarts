import { type PanelOptionsEditorBuilder } from '@grafana/data';
import { PIE_ROSE_TYPE_DEFAULT, pieRoseTypeOptions, pieRoseTypePath, pieTypeCategoryName } from 'editor/constants';
import { isAdvancedEditorMode } from 'lib/grafana/editor/common/editor-mode';
import { type PanelOptions } from 'types';

/**
 * Register the pie "Rose type" select (None / Radius / Area) — an ECharts-only
 * shape option with no core Pie chart equivalent, so it's gated behind Advanced
 * editor mode (`showIf: isAdvancedEditorMode`). Placed in the plugin-owned "Pie"
 * category alongside the chart type. Encodes each slice's value as its radius or
 * area (Nightingale/rose chart); `None` keeps a plain pie. Rendered by
 * `getPieRoseType`, which maps `'none'` to ECharts' `false`.
 */
export function addPieRoseTypeOptions(builder: PanelOptionsEditorBuilder<PanelOptions>) {
  builder.addSelect({
    path: pieRoseTypePath,
    name: 'Rose type',
    category: [pieTypeCategoryName],
    description: 'Encode slice value as radius or area (Nightingale/rose chart)',
    defaultValue: PIE_ROSE_TYPE_DEFAULT,
    settings: {
      options: pieRoseTypeOptions,
    },
    showIf: isAdvancedEditorMode,
  });
}
