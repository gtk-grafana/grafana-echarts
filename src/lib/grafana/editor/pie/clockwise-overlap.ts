import { type PanelOptionsEditorBuilder } from '@grafana/data';
import {
  PIE_AVOID_LABEL_OVERLAP_DEFAULT,
  PIE_CLOCKWISE_DEFAULT,
  pieAvoidLabelOverlapPath,
  pieClockwisePath,
} from 'editor/pie';
import { addAdvancedBooleanSwitch, type ExtraShowIf } from 'lib/grafana/editor/common/advanced-options';
import { type PanelOptions } from 'types';

/**
 * Register the Advanced "Clockwise / avoid overlap" pie options in the "Advanced" category: the ECharts `series.clockwise` (slice layout direction) and
 * `series.avoidLabelOverlap` (nudge labels apart). Defaults match ECharts
 * (`true`); only the `false` override is emitted by `getPieOrientation`.
 */
export function addPieClockwiseOverlapOptions(builder: PanelOptionsEditorBuilder<PanelOptions>, showIf?: ExtraShowIf) {
  addAdvancedBooleanSwitch(builder, {
    path: pieClockwisePath,
    name: 'Clockwise',
    description: 'Lay slices out clockwise (off = counter-clockwise)',
    defaultValue: PIE_CLOCKWISE_DEFAULT,
    showIf,
  });

  addAdvancedBooleanSwitch(builder, {
    path: pieAvoidLabelOverlapPath,
    name: 'Avoid label overlap',
    description: 'Adjust label positions to keep them from overlapping',
    defaultValue: PIE_AVOID_LABEL_OVERLAP_DEFAULT,
    showIf,
  });
}
