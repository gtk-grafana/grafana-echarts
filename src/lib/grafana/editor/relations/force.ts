import { type PanelOptionsEditorBuilder } from '@grafana/data';
import { isGraphVariant } from 'editor/sankey';
import {
  RELATIONS_EDGE_LENGTH_DEFAULT,
  RELATIONS_LAYOUT_ANIMATION_DEFAULT,
  RELATIONS_REPULSION_DEFAULT,
} from 'lib/echarts/options/graph';
import { addAdvancedBooleanSwitch, addAdvancedNumberInput } from 'lib/grafana/editor/common/advanced-options';
import { type PanelOptions } from 'types';

/**
 * Force-layout tuning (Advanced). All four are inert under the circular/fixed layouts
 * and so are hidden there.
 *
 * Repulsion and edge length carry **the family's** defaults rather than ECharts', which
 * are tuned for small gallery graphs and pack a real topology into an unreadable knot;
 * `getGraphForce` always emits them. Gravity is the one control left unset, so ECharts'
 * own default applies.
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
    defaultValue: RELATIONS_REPULSION_DEFAULT,
    showIf: isForceLayout,
    settings: { min: 0, step: 10 },
  });

  addAdvancedNumberInput(builder, {
    path: 'relationsEdgeLength',
    name: 'Edge length',
    description: 'Target link length in px',
    defaultValue: RELATIONS_EDGE_LENGTH_DEFAULT,
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

  // Off by default, against ECharts. On, every simulation step is painted, so the graph
  // visibly settles on each refresh even when the topology has not changed — which
  // reads as the nodes jiggling for no reason. See `RELATIONS_LAYOUT_ANIMATION_DEFAULT`.
  addAdvancedBooleanSwitch(builder, {
    path: 'relationsLayoutAnimation',
    name: 'Animate layout',
    description: 'Draw the force simulation settling. Off draws only the final layout',
    defaultValue: RELATIONS_LAYOUT_ANIMATION_DEFAULT,
    showIf: isForceLayout,
  });
}
