import { type PanelOptionsEditorBuilder } from '@grafana/data';
import { isGraphVariant, isSankeyVariant } from 'editor/sankey';
import { addAdvancedBooleanSwitch } from 'lib/grafana/editor/common/advanced-options';
import { type PanelOptions } from 'types';

/**
 * Interaction options (Advanced): pan/zoom, node dragging, and adjacency
 * highlighting. All off by default, keeping the panel static like the other
 * families — including on the sankey variant, whose ECharts default is
 * `draggable: true` (pinned back off in `getSankeySeries`).
 *
 * All three apply to both render variants; only the dragging control's *usefulness*
 * differs, so it carries a per-variant gate.
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
    description: 'Let nodes be dragged to reposition them',
    // On a graph, dragging feeds the force simulation, so it is inert under
    // circular/fixed. A sankey re-lays out around a dragged node, so it always
    // applies there.
    showIf: (options) =>
      isSankeyVariant(options) || (isGraphVariant(options) && (options.relationsLayout ?? 'force') === 'force'),
  });

  addAdvancedBooleanSwitch(builder, {
    path: 'relationsFocusAdjacency',
    name: 'Highlight adjacency',
    description: 'On hover, fade everything except the node and its neighbours',
  });
}
