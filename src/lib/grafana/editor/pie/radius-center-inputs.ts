import { type PanelOptionsEditorBuilder } from '@grafana/data';
import {
  pieCenterXPath,
  pieCenterYPath,
  pieInnerRadiusPath,
  pieOuterRadiusPath,
  pieTypeCategoryName,
} from 'editor/constants';
import { isAdvancedEditorMode } from 'lib/grafana/editor/common/editor-mode';
import { type PanelOptions } from 'types';

/**
 * Register the Advanced-only pie "Custom radius / center" number inputs: outer and
 * inner radius plus center X/Y, all as percentages of the panel. They override the
 * hardcoded `getPieRadius` defaults and drive `series.center` via `getPieCenter`.
 * All live in the "Pie" category and are gated behind Advanced; unset values keep
 * the pie/donut defaults (and the centered position).
 */
export function addPieRadiusCenterOptions(builder: PanelOptionsEditorBuilder<PanelOptions>) {
  const radiusSettings = { min: 0, max: 100, integer: true };

  builder.addNumberInput({
    path: pieOuterRadiusPath,
    name: 'Outer radius',
    category: [pieTypeCategoryName],
    description: 'Outer radius as a percentage of the panel. Leave empty for the default.',
    settings: radiusSettings,
    showIf: isAdvancedEditorMode,
  });

  builder.addNumberInput({
    path: pieInnerRadiusPath,
    name: 'Inner radius',
    category: [pieTypeCategoryName],
    description: 'Inner (hole) radius as a percentage of the panel. Leave empty for the default.',
    settings: radiusSettings,
    showIf: isAdvancedEditorMode,
  });

  builder.addNumberInput({
    path: pieCenterXPath,
    name: 'Center X',
    category: [pieTypeCategoryName],
    description: 'Horizontal center as a percentage of the panel width. Leave empty to keep centered.',
    settings: radiusSettings,
    showIf: isAdvancedEditorMode,
  });

  builder.addNumberInput({
    path: pieCenterYPath,
    name: 'Center Y',
    category: [pieTypeCategoryName],
    description: 'Vertical center as a percentage of the panel height. Leave empty to keep centered.',
    settings: radiusSettings,
    showIf: isAdvancedEditorMode,
  });
}
