import { type PanelOptionsEditorBuilder } from '@grafana/data';
import { commonOptionsBuilder } from '@grafana/ui';
import { TOOLTIP_DEFAULT_OPTIONS } from 'editor/constants';
import { type PanelOptions } from 'types';

/**
 * Register the standard Grafana "Legend" + "Tooltip" option pair shared by the
 * cartesian, radar, pie, and heatmap families: `addLegendOptions` followed by
 * `addTooltipOptions(..., TOOLTIP_DEFAULT_OPTIONS)` (the defaults opt every
 * family into the full common-tooltip control set, incl. "Hide zeros").
 *
 * `includeLegendCalcs` (default `true`) toggles the legend's reducer "Values"
 * stats-picker: the pie passes `false` because an arbitrary reducer over a
 * single-value slice is meaningless (its own Percent / Value control replaces
 * it). Callers that need to drop an individual control (e.g. the pie's
 * `tooltip.sort`) call `removeOption` after this.
 */
export function addCommonLegendAndTooltip(
  builder: PanelOptionsEditorBuilder<PanelOptions>,
  { includeLegendCalcs = true }: { includeLegendCalcs?: boolean } = {}
): void {
  commonOptionsBuilder.addLegendOptions(builder, includeLegendCalcs);
  commonOptionsBuilder.addTooltipOptions(builder, false, false, TOOLTIP_DEFAULT_OPTIONS);
}
