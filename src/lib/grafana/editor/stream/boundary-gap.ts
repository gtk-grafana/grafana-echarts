import { type PanelOptionsEditorBuilder } from '@grafana/data';
import { STREAM_BOUNDARY_GAP_PERCENT_DEFAULT, streamBoundaryGapPath } from 'editor/stream';
import { addAdvancedNumberInput } from 'lib/grafana/editor/common/advanced-options';
import { type PanelOptions } from 'types';

/**
 * Register the Advanced stream "Boundary gap" input (0–40%; ECharts
 * `series.boundaryGap`): the orthogonal padding above and below the stacked
 * ribbons, as a share of the single axis' cross extent. Lowering it lets the river
 * fill more of the panel; raising it pulls the bands clear of the axis line. Capped
 * below 50 because the two sides share the value and would otherwise meet.
 * Rendered by `getStreamBoundaryGap`, which omits the key at ECharts' own 10%.
 */
export function addStreamBoundaryGapOptions(builder: PanelOptionsEditorBuilder<PanelOptions>) {
  addAdvancedNumberInput(builder, {
    path: streamBoundaryGapPath,
    name: 'Boundary gap',
    description: 'Padding above and below the ribbons, as a percentage of the plot height',
    defaultValue: STREAM_BOUNDARY_GAP_PERCENT_DEFAULT,
    settings: { min: 0, max: 40, integer: true },
  });
}
