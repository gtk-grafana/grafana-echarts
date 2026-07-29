import { type PanelOptionsEditorBuilder } from '@grafana/data';
import { addAdvancedBooleanSwitch } from 'lib/grafana/editor/common/advanced-options';
import { type PanelOptions } from 'types';

/**
 * Interaction options (Advanced): pan/zoom, node dragging, and adjacency
 * highlighting. All off by default, keeping the panel static like the other
 * families.
 * https://echarts.apache.org/en/option.html#series-graph.roam
 * https://echarts.apache.org/en/option.html#series-graph.draggable
 * https://echarts.apache.org/en/option.html#series-graph.emphasis
 */
export function addRelationsInteractionOptions(builder: PanelOptionsEditorBuilder<PanelOptions>): void {
  addAdvancedBooleanSwitch(builder, {
    path: 'relationsRoam',
    name: 'Zoom and pan',
    description: 'Allow scroll-to-zoom and drag-to-pan within the panel',
  });

  addAdvancedBooleanSwitch(builder, {
    path: 'relationsDraggable',
    name: 'Draggable nodes',
    description: 'Let nodes be dragged. Only meaningful under the Force layout',
    // Dragging feeds the force simulation, so it is inert under circular/fixed.
    showIf: (options) => (options.relationsLayout ?? 'force') === 'force',
  });

  addAdvancedBooleanSwitch(builder, {
    path: 'relationsFocusAdjacency',
    name: 'Highlight adjacency',
    description: 'On hover, fade everything except the node and its neighbours',
  });
}
