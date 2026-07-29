import { type PanelOptionsEditorBuilder } from '@grafana/data';
import { barWidthPath, CARTESIAN_BAR_WIDTH_DEFAULT } from 'editor/cartesian';
import { addAdvancedNumberInput } from 'lib/grafana/editor/common/advanced-options';
import { type PanelOptions } from 'types';

/**
 * Register the Advanced cartesian "Bar width" input (percentage of the category
 * band; ECharts `series.barWidth`). Only affects `bar` series; empty uses
 * ECharts' auto width. Rendered by `getBarWidth`.
 */
export function addCartesianBarWidthOptions(builder: PanelOptionsEditorBuilder<PanelOptions>) {
  addAdvancedNumberInput(builder, {
    path: barWidthPath,
    name: 'Bar width',
    description: 'Bar width as a percentage of the category band (bar series). Empty uses auto width.',
    defaultValue: CARTESIAN_BAR_WIDTH_DEFAULT,
    settings: { min: 1, max: 100, integer: true },
  });
}
