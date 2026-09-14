import {
  type RelationsGraphLayout,
  type RelationsLabelOverflow,
  type RelationsLinkColor,
  type RelationsSankeyNodeAlign,
  type RelationsSankeyOrient,
} from 'editor/relations/types';

/**
 * The relations family's slice of the panel option bag, mixed into `PanelOptions` with
 * `extends` so nothing downstream changes: every consumer still imports `PanelOptions`
 * and sees one flat interface.
 *
 * Its own interface so the family's ~36 keys are declared beside the rest of its editor
 * surface rather than inline in a 900-line shared file, and so
 * `options/advancedDefaults.ts` can type its three sets `Partial<RelationsPanelOptions>`
 * — a narrower claim than `Partial<PanelOptions>`, and one that keeps `src/types.ts` off
 * the family's import graph entirely.
 */
export interface RelationsPanelOptions {
  /**
   * Relations graph layout (Default tier; ECharts `series.graph.layout`): `force`,
   * `circular`, or `none`. Unset resolves to `force`, except when every node
   * carries `fixedx`/`fixedy`, where `none` is used so server-provided positions
   * are honored. See `getGraphLayout`.
   */
  relationsLayout?: RelationsGraphLayout;

  /**
   * Relations node labels (Default tier; ECharts `series.graph.label.show`): draw
   * each node's name beside it. Defaults to on — an unlabelled topology is hard to
   * read. See `getGraphLabel`.
   */
  relationsShowNodeLabels?: boolean;

  /**
   * Relations node values (Default tier; ECharts `series.*.label.formatter`): append
   * each node's stat to its label, on a second line. Off by default, since it
   * doubles the height of every label. Shares one formatter across all three render
   * variants — see `getRelationsNodeLabelFormatter`.
   */
  relationsShowNodeValues?: boolean;

  /**
   * Relations node size in px (Default tier; ECharts `series.graph.symbolSize`).
   * Only applies to nodes with no `noderadius` value, which always wins. Unset uses
   * `RELATIONS_NODE_SIZE_DEFAULT`. See `getGraphNodeSize`.
   */
  relationsNodeSize?: number;

  /**
   * Relations zoom & pan, the **superseded** single switch (Advanced; ECharts
   * `series.graph.roam`). Split into {@link relationsZoom} and {@link relationsPan}
   * because the two answer different questions — "may the view scale" and "may the
   * view be dragged" — and because zoom is driven by the panel's own buttons now
   * rather than by the scroll wheel, which a dashboard cannot scroll past.
   *
   * Still read, so a dashboard saved with the old switch keeps both behaviours:
   * `resolveRelationsZoom` / `resolveRelationsPan` fall back to it. Never written.
   *
   * @deprecated Use `relationsZoom` / `relationsPan`.
   */
  relationsRoam?: boolean;

  /**
   * Relations zoom (Advanced). Shows the panel's zoom in / out / reset buttons and
   * lets them scale the view; **not** ECharts' scroll-to-zoom, which is deliberately
   * never enabled — a wheel event over a panel belongs to the dashboard's scroll.
   * Off by default. See `getRelationsZoomAction` and `ChartZoomControls`.
   */
  relationsZoom?: boolean;

  /**
   * Relations pan (Advanced; ECharts `series.graph.roam: 'move'`): drag the view
   * within the panel. Off by default. See `resolveRelationsRoam`.
   */
  relationsPan?: boolean;

  /**
   * Relations draggable nodes (Advanced; ECharts `series.graph.draggable`). Only
   * meaningful under the force layout. Off by default. See `buildGraphOption`.
   */
  relationsDraggable?: boolean;

  /**
   * Relations force-layout repulsion (Advanced; ECharts
   * `series.graph.force.repulsion`). Higher values spread nodes further apart.
   * Unset uses `RELATIONS_REPULSION_DEFAULT`, which is far above ECharts' own — see
   * there. Force layout only. See `getGraphForce`.
   */
  relationsRepulsion?: number;

  /**
   * Relations force-layout edge length in px (Advanced; ECharts
   * `series.graph.force.edgeLength`). Unset uses `RELATIONS_EDGE_LENGTH_DEFAULT`,
   * again well above ECharts' own. Force layout only. See `getGraphForce`.
   */
  relationsEdgeLength?: number;

  /**
   * Relations force-layout animation (Advanced; ECharts
   * `series.graph.force.layoutAnimation`): draw every simulation step, so the graph
   * visibly settles. **Off by default**, unlike ECharts — the settling reads as the
   * nodes jiggling on every data refresh. Force layout only. See `getGraphForce`.
   */
  relationsLayoutAnimation?: boolean;

  /**
   * Relations force-layout gravity (Advanced; ECharts `series.graph.force.gravity`),
   * the pull toward the centre. Unset uses ECharts' default; force layout only. See
   * `getGraphForce`.
   */
  relationsGravity?: number;

  /**
   * Relations edge arrows (Advanced; ECharts `series.graph.edgeSymbol`). Draws an
   * arrowhead at the target end. **On by default**: an edge is directed by contract,
   * and the arrowhead is the only thing that says so on a force layout, where the
   * source-to-target gradient cannot be built. See `getGraphEdgeSymbol`.
   */
  relationsEdgeArrows?: boolean;

  /**
   * Relations edge values (Advanced; ECharts `series.*.edgeLabel`): draw each edge's
   * weight on the link itself. Off by default — one number per edge is a lot of ink
   * on anything but a small graph. Graph and sankey only: `ChordEdge` draws no label
   * element, so the option is hidden there. See `getRelationsEdgeLabel`.
   */
  relationsShowEdgeValues?: boolean;

  /**
   * Relations link curveness 0–1 (Advanced; ECharts
   * `series.graph.lineStyle.curveness`). Curving links separates the two directions
   * of a bidirectional pair. `0` (default) draws straight links and omits the key.
   * See `getGraphLinkStyle`.
   */
  relationsCurveness?: number;

  /**
   * Relations hover emphasis (Default tier; ECharts `series.*.emphasis.focus`):
   * hovering a node fades everything except it and its neighbours (`'adjacency'`).
   * **On by default** — reading one node's neighbourhood out of a dense topology is
   * the main thing a relations panel is hovered for. See `getGraphEmphasis`.
   */
  relationsFocusAdjacency?: boolean;

  /**
   * Relations label overlap handling (Default tier; ECharts `series.labelLayout`):
   * drop a node label that would collide with one already drawn. On by default —
   * overlapping labels are the first thing that goes wrong on a graph with more than
   * a handful of nodes. See `getRelationsLabelLayout`.
   */
  relationsHideOverlappingLabels?: boolean;

  /**
   * Relations label overflow (Advanced; ECharts `series.*.label.overflow`): how a
   * long node name is handled at `relationsLabelWidth`. Defaults to
   * `RELATIONS_LABEL_OVERFLOW_DEFAULT` (`truncate`); `none` writes no key.
   * See `getRelationsLabelStyle`.
   */
  relationsLabelOverflow?: RelationsLabelOverflow;

  /**
   * Relations label width in px (Advanced; ECharts `series.*.label.width`) — the
   * width at which `relationsLabelOverflow` applies. Defaults to
   * `RELATIONS_LABEL_WIDTH_DEFAULT`. See `getRelationsLabelStyle`.
   */
  relationsLabelWidth?: number;

  /**
   * Read every mark at **one timestamp** instead of reducing its rows to a stat
   * (Default tier; no ECharts key — it changes what the converter reads). Draws an in-panel
   * slider and hides the "Calculation" picker, which has nothing to reduce at one row. Off
   * by default; see `RELATIONS_TIME_SLIDER_DEFAULT`, `graphWideTimeline` and
   * `ChartTimeSlider`.
   *
   * Inert on an instant response, so the control is **hidden** there unless already on
   * (`hasGraphTimeline`), and a panel that has it on says so through a notice rather than
   * drawing a one-position slider.
   *
   * The *selection* is transient panel state, never a saved option. With it on, a mark's
   * tooltip labels the main row `Value` rather than naming a reducer that did not run.
   */
  relationsTimeSlider?: boolean;

  /**
   * Relations link color mode (Advanced; ECharts `series.*.lineStyle.color`
   * keywords): inherit the `source` node's color, the `target`'s, or a `gradient`
   * between them. An explicit per-edge `color` field always wins. Unset uses
   * `RELATIONS_LINK_COLOR_DEFAULT` (`gradient`). See `resolveRelationsLinkColor`.
   */
  relationsLinkColor?: RelationsLinkColor;

  /**
   * Remember the panned/zoomed view across reloads (Advanced), by writing
   * {@link relationsViewZoom} / {@link relationsViewCenter} back into the panel's
   * saved options as the user roams.
   *
   * Opt-in and off by default, because the cost is not the render: every pan marks the
   * dashboard as having unsaved changes, which for a panel somebody is only *reading*
   * is noise. On, the view is part of how the panel is configured. See
   * `useRelationsPersistence`.
   */
  relationsRememberView?: boolean;

  /**
   * The remembered view scale (ECharts `series.*.zoom`). Written by the panel rather
   * than by the editor, and only while {@link relationsRememberView} is on.
   */
  relationsViewZoom?: number;

  /**
   * The remembered view centre (ECharts `series.*.center`), in the series' own
   * coordinate space. Written alongside {@link relationsViewZoom}.
   */
  relationsViewCenter?: [number, number];

  /**
   * Sankey flow direction (ECharts `series.sankey.orient`): node columns run
   * left-to-right (`horizontal`) or top-to-bottom (`vertical`). Default-tier;
   * omitted at the horizontal default. See `getSankeyOrient`.
   */
  relationsSankeyOrient?: RelationsSankeyOrient;

  /**
   * Sankey column placement for nodes that could sit in more than one (ECharts
   * `series.sankey.nodeAlign`). Default-tier; omitted at the `justify` default.
   * See `getSankeyNodeAlign`.
   */
  relationsSankeyNodeAlign?: RelationsSankeyNodeAlign;

  /**
   * Sankey node thickness in px (Advanced; ECharts `series.sankey.nodeWidth`).
   * Omitted at ECharts' default of 20. See `getSankeySeries`.
   */
  relationsSankeyNodeWidth?: number;

  /**
   * Gap in px between adjacent sankey nodes in the same column (Advanced; ECharts
   * `series.sankey.nodeGap`). Omitted at ECharts' default of 8. See `getSankeySeries`.
   */
  relationsSankeyNodeGap?: number;

  /**
   * Sankey ribbon curvature 0–1 (Advanced; ECharts
   * `series.sankey.lineStyle.curveness`). Separate from `relationsCurveness`
   * because the ECharts defaults differ — 0.5 for sankey, 0 for graph — so one
   * shared option could not omit its key at both. See `getSankeyLinkStyle`.
   */
  relationsSankeyCurveness?: number;

  /**
   * Sankey ribbon translucency 0–1 (Advanced; ECharts
   * `series.sankey.lineStyle.opacity`). Overlapping ribbons are normal in a sankey,
   * so this is the main legibility lever. Omitted at ECharts' default of 0.2.
   * See `getSankeyLinkStyle`.
   */
  relationsSankeyLinkOpacity?: number;

  /**
   * Sankey layout relaxation passes (Advanced; ECharts
   * `series.sankey.layoutIterations`) — how many times node positions are refined to
   * reduce ribbon crossings. Omitted at ECharts' default of 32. Inert when any node
   * has zero flow, since ECharts then skips iteration entirely.
   * See `getSankeySeries`.
   */
  relationsSankeyLayoutIterations?: number;

  /**
   * Chord ring start angle in degrees (Advanced; ECharts
   * `series.chord.startAngle`). Omitted at ECharts' default of 90 (twelve o'clock).
   * See `getChordSeries`.
   */
  relationsChordStartAngle?: number;

  /**
   * Chord arc layout direction (Advanced; ECharts `series.chord.clockwise`).
   * Omitted at ECharts' default of `true`; only `false` is emitted.
   * See `getChordSeries`.
   */
  relationsChordClockwise?: boolean;

  /**
   * Angular gap in degrees between adjacent chord node arcs (Advanced; ECharts
   * `series.chord.padAngle`). This is the chord analogue of a node gap — and it is
   * angular, because `series.chord` has **no** `nodeWidth`/`nodeGap` at all (those
   * are sankey keys). Omitted at ECharts' default of 3. See `getChordSeries`.
   */
  relationsChordPadAngle?: number;

  /**
   * Minimum chord arc angle in degrees (Advanced; ECharts `series.chord.minAngle`),
   * keeping a low-flow node visible instead of collapsing to nothing. Omitted at
   * ECharts' default of 0. See `getChordSeries`.
   */
  relationsChordMinAngle?: number;

  /**
   * Chord ribbon translucency 0–1 (Advanced; ECharts
   * `series.chord.lineStyle.opacity`). A chord is dense by nature, so this is its
   * main legibility lever. Omitted at ECharts' default of 0.2.
   * See `getChordLinkStyle`.
   */
  relationsChordLinkOpacity?: number;
}
