import { type PanelOptionsEditorBuilder } from '@grafana/data';
import { PIE_ROSE_TYPE_DEFAULT, pieRoseTypeOptions, pieRoseTypePath, pieTypeCategoryName } from 'editor/constants';
import { addAdvancedSelect } from 'lib/grafana/editor/common/advanced-options';
import { type PanelOptions } from 'types';

/**
 * Register the pie "Rose type" select (None / Radius / Area) — an ECharts-only
 * shape option (no core Pie chart equivalent), gated behind Advanced mode and
 * placed in the plugin-owned "Pie" category. Encodes each slice's value as its
 * radius or area (Nightingale/rose chart); `None` keeps a plain pie. Rendered by
 * `getPieRoseType`.
 */
export function addPieRoseTypeOptions(builder: PanelOptionsEditorBuilder<PanelOptions>) {
  addAdvancedSelect(builder, {
    path: pieRoseTypePath,
    name: 'Rose type',
    category: pieTypeCategoryName,
    description: 'Encode slice value as radius or area (Nightingale/rose chart)',
    defaultValue: PIE_ROSE_TYPE_DEFAULT,
    settings: { options: pieRoseTypeOptions },
  });
}
