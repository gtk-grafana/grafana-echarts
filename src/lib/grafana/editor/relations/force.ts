import { type PanelOptionsEditorBuilder } from '@grafana/data';
import { isGraphVariant } from 'editor/sankey';
import { addAdvancedNumberInput } from 'lib/grafana/editor/common/advanced-options';
import { type PanelOptions } from 'types';

/**
 * Force-layout tuning (Advanced). Each is omitted from the series when unset, so
 * ECharts' own defaults apply; all three are inert under the circular/fixed
 * layouts and so are hidden there.
 * https://echarts.apache.org/en/option.html#series-graph.force
 */
// Also requires the graph variant: `relationsLayout` persists across a variant
// switch, so a panel saved as a force graph would otherwise keep showing force
// tuning after switching to sankey, where there is no simulation at all.
const isForceLayout = (options: PanelOptions) =>
  isGraphVariant(options) && (options.relationsLayout ?? 'force') === 'force';

export function addRelationsForceOptions(builder: PanelOptionsEditorBuilder<PanelOptions>): void {
  addAdvancedNumberInput(builder, {
    path: 'relationsRepulsion',
    name: 'Repulsion',
    description: 'How strongly nodes push each other apart. Higher spreads the graph out',
    showIf: isForceLayout,
    settings: { min: 0, step: 10 },
  });

  addAdvancedNumberInput(builder, {
    path: 'relationsEdgeLength',
    name: 'Edge length',
    description: 'Target link length in px',
    showIf: isForceLayout,
    settings: { min: 0, step: 5 },
  });

  addAdvancedNumberInput(builder, {
    path: 'relationsGravity',
    name: 'Gravity',
    description: 'Pull toward the centre. Higher keeps the graph compact',
    showIf: isForceLayout,
    settings: { min: 0, max: 1, step: 0.01 },
  });
}
