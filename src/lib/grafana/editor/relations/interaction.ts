import { type PanelOptionsEditorBuilder } from '@grafana/data';
import { isChordVariant } from 'editor/chord';
import { relationsCategoryName } from 'editor/constants';
import { isGraphVariant, isSankeyVariant } from 'editor/sankey';
import { RELATIONS_FOCUS_ADJACENCY_DEFAULT } from 'lib/echarts/options/graph';
import { addAdvancedBooleanSwitch } from 'lib/grafana/editor/common/advanced-options';
import { type PanelOptions } from 'types';

/**
 * Interaction options: view zoom, view pan, node dragging, and adjacency
 * highlighting.
 *
 * "Highlight adjacency" is Default-tier and on; the other three are Advanced and off,
 * keeping the panel static like the other families — including on the sankey variant,
 * whose ECharts default is `draggable: true` (pinned back off in `getSankeySeries`).
 * https://echarts.apache.org/en/option.html#series-graph.roam
 * https://echarts.apache.org/en/option.html#series-graph.draggable
 * https://echarts.apache.org/en/option.html#series-graph.emphasis
 */
export function addRelationsInteractionOptions(builder: PanelOptionsEditorBuilder<PanelOptions>): void {
  /**
   * Zoom and pan were one switch ("Zoom and pan", `relationsRoam`) and are two now,
   * because they are two different decisions and the old pairing forced them together:
   * a dashboard that wants to drag a large topology around does not necessarily want
   * the panel to rescale, and — the reason this matters — a panel that captures the
   * scroll wheel is a panel the dashboard cannot be scrolled past.
   *
   * So zoom does not use ECharts' roam zoom at all. It draws buttons in the panel
   * corner (`ChartZoomControls`) and dispatches the roam *action*, which leaves the
   * wheel alone. `relationsRoam` is still read by both, so a dashboard saved with the
   * old switch keeps behaving the same. See `resolveRelationsRoam`.
   *
   * Chord is excluded from both: `series.chord` has no `roam` and no view coordinate
   * system, so neither the option nor the action reaches it.
   */
  addAdvancedBooleanSwitch(builder, {
    path: 'relationsZoom',
    name: 'Zoom',
    description: 'Show zoom in / out / reset buttons in the panel corner',
    showIf: (options) => !isChordVariant(options),
  });

  addAdvancedBooleanSwitch(builder, {
    path: 'relationsPan',
    name: 'Pan',
    description: 'Allow drag-to-pan within the panel',
    showIf: (options) => !isChordVariant(options),
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

  // Default-tier and on: reading one node's neighbourhood out of a dense topology is
  // the main thing a relations panel is hovered for, so requiring Advanced mode to get
  // it was the wrong tier. See `RELATIONS_FOCUS_ADJACENCY_DEFAULT`.
  builder.addBooleanSwitch({
    path: 'relationsFocusAdjacency',
    name: 'Highlight adjacency',
    description: 'On hover, fade everything except the node and its neighbours',
    category: [relationsCategoryName],
    defaultValue: RELATIONS_FOCUS_ADJACENCY_DEFAULT,
  });
}
