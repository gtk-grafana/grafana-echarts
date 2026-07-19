import { type PanelOptionsEditorBuilder } from '@grafana/data';
import {
  PIE_START_ANGLE_DEFAULT,
  pieEndAnglePath,
  pieStartAnglePath,
  pieTypeCategoryName,
} from 'editor/constants';
import { isAdvancedEditorMode } from 'lib/grafana/editor/common/editor-mode';
import { type PanelOptions } from 'types';

/**
 * Register the Advanced-only pie "Start angle" / "End angle" number inputs
 * (degrees) in the "Pie" shape category. They set the ECharts
 * `series.startAngle` / `series.endAngle` (see `getPieAngles`), enabling half-pie
 * and semicircle-donut layouts. Both are gated behind Advanced editor mode
 * (`showIf: isAdvancedEditorMode`) since they extend beyond core Grafana parity;
 * mirrors `addPieTypeOptions` / `addStandardDataReduceOptions`'s `addNumberInput`.
 */
export function addPieAngleOptions(builder: PanelOptionsEditorBuilder<PanelOptions>) {
  builder.addNumberInput({
    path: pieStartAnglePath,
    name: 'Start angle',
    category: [pieTypeCategoryName],
    description: 'Angle (degrees) where the arc begins. 90 = top; e.g. start 180 / end 360 = half-pie',
    defaultValue: PIE_START_ANGLE_DEFAULT,
    settings: {
      min: 0,
      max: 360,
    },
    showIf: isAdvancedEditorMode,
  });

  builder.addNumberInput({
    path: pieEndAnglePath,
    name: 'End angle',
    category: [pieTypeCategoryName],
    description: 'Angle (degrees) where the arc ends. Unset sweeps a full 360°; e.g. start 180 / end 360 = half-pie',
    settings: {
      min: 0,
      max: 360,
    },
    showIf: isAdvancedEditorMode,
  });
}
