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

  /**
   * Dragging, and — under the two layouts that can remember one — where the node stays.
   *
   * Offered on **fixed** as well as force, which it was not. Under force a drag only
   * nudges the simulation, and the node is wherever the physics leaves it on the next
   * refresh; under `Fixed` the position *is* the layout, so a drag is an edit and the
   * panel writes it back as a `custom.fixedX`/`fixedY` override on that node — the same
   * store the legend's colour picker uses. A sankey re-lays out around a dragged node
   * and remembers it the same way, in its own 0-1 `localX`/`localY` space.
   * See `useRelationsPersistence`.
   */
  addAdvancedBooleanSwitch(builder, {
    path: 'relationsDraggable',
    name: 'Draggable nodes',
    description: 'Let nodes be dragged. Under Fixed layout the new position is saved as a field override',
    showIf: (options) =>
      isSankeyVariant(options) || (isGraphVariant(options) && (options.relationsLayout ?? 'force') !== 'circular'),
  });

  /**
   * Whether the panned/zoomed view is part of the panel's saved configuration.
   *
   * Opt-in, and off by default, because of what writing it costs rather than what it
   * costs to draw: `onOptionsChange` marks the dashboard as having unsaved changes, so
   * a reader who merely drags the graph aside to see behind it would be prompted to
   * save on the way out. On, the view is a setting like any other. Chord is excluded
   * for the same reason it has no zoom buttons: it has no view to save.
   */
  addAdvancedBooleanSwitch(builder, {
    path: 'relationsRememberView',
    name: 'Remember view',
    description: 'Save the panned and zoomed view into the panel, so it survives a reload',
    showIf: (options) => !isChordVariant(options),
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
