import { type PanelOptionsEditorBuilder } from '@grafana/data';
import {
  FUNNEL_LABEL_POSITION_DEFAULT,
  funnelLabelPositionOptions,
  funnelLabelPositionPath,
  isFunnelVariant,
} from 'editor/funnel';
import { addAdvancedRadio } from 'lib/grafana/editor/common/advanced-options';
import { type PanelOptions } from 'types';

/**
 * Register the funnel "Label position" radio (Inside / Left / Right / Top /
 * Bottom) — an ECharts-only option in the "Advanced" category, shown only when
 * the funnel variant is selected. Maps to `label.position`; the label content
 * (Name / Value / Percent) comes from the shared "Labels" option. See
 * `getFunnelLabel`.
 */
export function addFunnelLabelPositionOptions(builder: PanelOptionsEditorBuilder<PanelOptions>) {
  addAdvancedRadio(builder, {
    path: funnelLabelPositionPath,
    name: 'Funnel label position',
    description: 'Where slice labels render: inside the segment, or outside to a side',
    defaultValue: FUNNEL_LABEL_POSITION_DEFAULT,
    settings: { options: funnelLabelPositionOptions },
    showIf: isFunnelVariant,
  });
}
