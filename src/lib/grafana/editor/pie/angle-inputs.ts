import { type PanelOptionsEditorBuilder } from '@grafana/data';
import { PIE_START_ANGLE_DEFAULT, pieEndAnglePath, pieStartAnglePath } from 'editor/pie';
import { addAdvancedNumberInput, type ExtraShowIf } from 'lib/grafana/editor/common/advanced-options';
import { type PanelOptions } from 'types';

/**
 * Register the pie "Start angle" / "End angle" number inputs (degrees) in the
 * "Advanced" category. They set the ECharts `series.startAngle` / `series.endAngle`
 * (see `getPieAngles`), enabling half-pie and semicircle-donut layouts. Both are
 * ECharts-only extras, gated behind Advanced mode.
 */
export function addPieAngleOptions(builder: PanelOptionsEditorBuilder<PanelOptions>, showIf?: ExtraShowIf) {
  addAdvancedNumberInput(builder, {
    path: pieStartAnglePath,
    name: 'Start angle',
    description: 'Angle (degrees) where the arc begins. 90 = top; e.g. start 180 / end 360 = half-pie',
    defaultValue: PIE_START_ANGLE_DEFAULT,
    settings: { min: 0, max: 360 },
    showIf,
  });

  addAdvancedNumberInput(builder, {
    path: pieEndAnglePath,
    name: 'End angle',
    description: 'Angle (degrees) where the arc ends. Unset sweeps a full 360°; e.g. start 180 / end 360 = half-pie',
    settings: { min: 0, max: 360 },
    showIf,
  });
}
