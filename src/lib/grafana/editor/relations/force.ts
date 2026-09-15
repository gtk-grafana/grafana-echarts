import { type PanelOptionsEditorBuilder } from '@grafana/data';

import { addAdvancedBooleanSwitch, addAdvancedNumberInput } from 'lib/grafana/editor/common/advanced-options';
import { type PanelOptions } from 'types';

import {
  RELATIONS_EDGE_LENGTH_DEFAULT,
  RELATIONS_LAYOUT_ANIMATION_DEFAULT,
  RELATIONS_REPULSION_DEFAULT,
  relationsLayoutCategoryName,
} from 'editor/relations/constants';
import { isGraphVariant } from 'editor/relations/variants';
/**
 * Add force-layout settings to the Layout section.
 * https://echarts.apache.org/en/option.html#series-graph.force
 */
// A saved graph layout can remain after the user selects another variant.
const isForceLayout = (options: PanelOptions) =>
  isGraphVariant(options) && (options.relationsLayout ?? 'force') === 'force';

const forceCategory = [relationsLayoutCategoryName];

export function addRelationsForceOptions(builder: PanelOptionsEditorBuilder<PanelOptions>): void {
  addAdvancedNumberInput(builder, {
    path: 'relationsRepulsion',
    name: 'Repulsion',
    description: 'How strongly nodes push each other apart. Higher spreads the graph out',
    defaultValue: RELATIONS_REPULSION_DEFAULT,
    category: forceCategory,
    showIf: isForceLayout,
    settings: { min: 0, step: 10 },
  });

  addAdvancedNumberInput(builder, {
    path: 'relationsEdgeLength',
    name: 'Edge length',
    description: 'Target link length in px',
    defaultValue: RELATIONS_EDGE_LENGTH_DEFAULT,
    category: forceCategory,
    showIf: isForceLayout,
    settings: { min: 0, step: 5 },
  });

  addAdvancedNumberInput(builder, {
    path: 'relationsGravity',
    name: 'Gravity',
    description: 'Pull toward the centre. Higher keeps the graph compact',
    category: forceCategory,
    showIf: isForceLayout,
    settings: { min: 0, max: 1, step: 0.01 },
  });

  // Disable ECharts animation by default to avoid movement on every refresh.
  addAdvancedBooleanSwitch(builder, {
    path: 'relationsLayoutAnimation',
    name: 'Animate layout',
    description: 'Draw the force simulation settling. Off draws only the final layout',
    defaultValue: RELATIONS_LAYOUT_ANIMATION_DEFAULT,
    category: forceCategory,
    showIf: isForceLayout,
  });
}
