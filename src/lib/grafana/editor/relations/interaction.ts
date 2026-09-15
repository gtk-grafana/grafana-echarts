import { type PanelOptionsEditorBuilder } from '@grafana/data';

import { addAdvancedBooleanSwitch } from 'lib/grafana/editor/common/advanced-options';
import { type PanelOptions } from 'types';

import { RELATIONS_FOCUS_ADJACENCY_DEFAULT, relationsInteractionCategoryName } from 'editor/relations/constants';
import { isChordVariant, isGraphVariant, isSankeyVariant } from 'editor/relations/variants';
/**
 * Configure chart interaction.
 * https://echarts.apache.org/en/option.html#series-graph.roam
 * https://echarts.apache.org/en/option.html#series-graph.draggable
 * https://echarts.apache.org/en/option.html#series-graph.emphasis
 */
const interactionCategory = [relationsInteractionCategoryName];

/** Every variant but chord, which has no view coordinate system at all. */
const hasView = (options: PanelOptions) => !isChordVariant(options);

export function addRelationsInteractionOptions(builder: PanelOptionsEditorBuilder<PanelOptions>): void {
  builder.addBooleanSwitch({
    path: 'relationsZoom',
    name: 'Zoom',
    description: 'Show zoom in / out / reset buttons in the panel corner',
    category: interactionCategory,
    showIf: hasView,
  });

  builder.addBooleanSwitch({
    path: 'relationsPan',
    name: 'Pan',
    description: 'Allow drag-to-pan within the panel',
    category: interactionCategory,
    showIf: hasView,
  });

  builder.addBooleanSwitch({
    path: 'relationsRememberView',
    name: 'Remember view',
    description: 'Save the panned and zoomed view into the panel, so it survives a reload',
    category: interactionCategory,
    showIf: hasView,
  });

  addAdvancedBooleanSwitch(builder, {
    path: 'relationsDraggable',
    name: 'Draggable nodes',
    description: 'Let nodes be dragged. The new position is saved as a field override',
    category: interactionCategory,
    showIf: (options) => isSankeyVariant(options) || (isGraphVariant(options) && options.relationsLayout === 'none'),
  });

  builder.addBooleanSwitch({
    path: 'relationsFocusAdjacency',
    name: 'Highlight adjacency',
    description: 'On hover, fade everything except the node and its neighbours',
    category: interactionCategory,
    defaultValue: RELATIONS_FOCUS_ADJACENCY_DEFAULT,
  });
}
