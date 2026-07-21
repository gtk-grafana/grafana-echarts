import { type PanelOptionsEditorBuilder } from '@grafana/data';
import { pieCenterXPath, pieCenterYPath, pieInnerRadiusPath, pieOuterRadiusPath } from 'editor/constants';
import { addAdvancedNumberInput } from 'lib/grafana/editor/common/advanced-options';
import { type PanelOptions } from 'types';

/**
 * Register the Advanced pie "Custom radius / center" number inputs in the "Advanced" category: outer and inner radius plus center X/Y, all as percentages of the
 * panel. They override the `getPieRadius` defaults and drive `series.center` via
 * `getPieCenter`; unset values keep the pie/donut defaults (and centered position).
 */
export function addPieRadiusCenterOptions(builder: PanelOptionsEditorBuilder<PanelOptions>) {
  const settings = { min: 0, max: 100, integer: true };

  addAdvancedNumberInput(builder, {
    path: pieOuterRadiusPath,
    name: 'Outer radius',
    description: 'Outer radius as a percentage of the panel. Leave empty for the default.',
    settings,
  });

  addAdvancedNumberInput(builder, {
    path: pieInnerRadiusPath,
    name: 'Inner radius',
    description: 'Inner (hole) radius as a percentage of the panel. Leave empty for the default.',
    settings,
  });

  addAdvancedNumberInput(builder, {
    path: pieCenterXPath,
    name: 'Center X',
    description: 'Horizontal center as a percentage of the panel width. Leave empty to keep centered.',
    settings,
  });

  addAdvancedNumberInput(builder, {
    path: pieCenterYPath,
    name: 'Center Y',
    description: 'Vertical center as a percentage of the panel height. Leave empty to keep centered.',
    settings,
  });
}
