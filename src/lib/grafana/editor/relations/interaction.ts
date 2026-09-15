import { type PanelOptionsEditorBuilder } from '@grafana/data';

import { addAdvancedBooleanSwitch } from 'lib/grafana/editor/common/advanced-options';
import { type PanelOptions } from 'types';

import { RELATIONS_FOCUS_ADJACENCY_DEFAULT, relationsInteractionCategoryName } from 'editor/relations/constants';
import { isChordVariant, isGraphVariant, isSankeyVariant } from 'editor/relations/variants';
/**
 * The "Interaction" section: what the reader may do to the view once it is drawn.
 *
 * **Zoom, pan and Remember view are Default-tier**, for a reason specific to this family:
 * a relations panel's problem is not that it has too much detail to take in, it is that a
 * topology of any size does not fit in a panel at all. Zoom and pan are how the rest of
 * the data is reachable, not expert tuning.
 *
 * "Draggable nodes" is Advanced: it is offered on only two of the four layouts, and it
 * writes a field override as a side effect. "Highlight adjacency" is Default and on.
 * https://echarts.apache.org/en/option.html#series-graph.roam
 * https://echarts.apache.org/en/option.html#series-graph.draggable
 * https://echarts.apache.org/en/option.html#series-graph.emphasis
 */
const interactionCategory = [relationsInteractionCategoryName];

/** Every variant but chord, which has no view coordinate system at all. */
const hasView = (options: PanelOptions) => !isChordVariant(options);

export function addRelationsInteractionOptions(builder: PanelOptionsEditorBuilder<PanelOptions>): void {
  /**
   * Zoom and pan are two switches, because they are two decisions: a dashboard that
   * wants to drag a large topology around does not necessarily want the panel to
   * rescale, and a panel that captures the scroll wheel is a panel the dashboard cannot
   * be scrolled past.
   *
   * So zoom does not use ECharts' roam zoom at all. It draws buttons in the panel
   * corner (`ChartZoomControls`) and dispatches the roam *action*, which leaves the
   * wheel alone. See `resolveRelationsRoam`.
   *
   * Chord is excluded from both: `series.chord` has no `roam` and no view coordinate
   * system, so neither the option nor the action reaches it.
   */
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

  /**
   * Whether the panned/zoomed view is part of the panel's saved configuration.
   *
   * Opt-in, and off by default, because of what writing it costs rather than what it
   * costs to draw: `onOptionsChange` marks the dashboard as having unsaved changes, so
   * a reader who merely drags the graph aside to see behind it would be prompted to
   * save on the way out. On, the view is a setting like any other. Chord is excluded
   * for the same reason it has no zoom buttons: it has no view to save.
   *
   * Default-tier alongside Zoom and Pan — it is the answer to "why did my pan not
   * stick", which is the immediate next question once those two are reachable.
   */
  builder.addBooleanSwitch({
    path: 'relationsRememberView',
    name: 'Remember view',
    description: 'Save the panned and zoomed view into the panel, so it survives a reload',
    category: interactionCategory,
    showIf: hasView,
  });

  /**
   * Dragging, and where the node stays. **Advanced**, unlike the three above: it is
   * offered on only two of the layouts, and a drag writes a field override.
   *
   * Offered on the **sankey** variant and on a graph under `Fixed` — the two layouts where a
   * dragged position is a position. There the drag is an edit, and the panel writes it back
   * as a `custom.fixedX`/`fixedY` override on that node, the same store the legend's colour
   * picker uses; the sankey keeps its own 0-1 `localX`/`localY` space.
   * See `useRelationsPersistence`.
   *
   * **Force and circular are excluded, not merely unsaved.** Both re-solve on every render,
   * so a drag could never be kept — but they are worse than that in practice. A circular drag
   * re-solves the ring from the drop point, and a force drag re-runs the whole simulation per
   * pointer move: `force.layoutAnimation` is off by default here (so a refresh does not
   * jiggle), and with it off ECharts iterates to convergence synchronously inside the `drag`
   * handler, so every mouse move visibly rearranges the graph. Offering a switch for that is
   * offering a broken interaction. `getGraphSeries` refuses it as well as hiding it, so a
   * dashboard that saved the pair keeps a working panel rather than an unreachable setting.
   */
  addAdvancedBooleanSwitch(builder, {
    path: 'relationsDraggable',
    name: 'Draggable nodes',
    description: 'Let nodes be dragged. The new position is saved as a field override',
    category: interactionCategory,
    showIf: (options) => isSankeyVariant(options) || (isGraphVariant(options) && options.relationsLayout === 'none'),
  });

  // Default-tier and on: reading one node's neighbourhood out of a dense topology is
  // the main thing a relations panel is hovered for. See `RELATIONS_FOCUS_ADJACENCY_DEFAULT`.
  builder.addBooleanSwitch({
    path: 'relationsFocusAdjacency',
    name: 'Highlight adjacency',
    description: 'On hover, fade everything except the node and its neighbours',
    category: interactionCategory,
    defaultValue: RELATIONS_FOCUS_ADJACENCY_DEFAULT,
  });
}
