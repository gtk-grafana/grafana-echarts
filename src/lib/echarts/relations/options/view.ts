import { type PanelOptions } from 'types';

/**
 * The panel's **view**: whether zoom and pan are offered, and the saved zoom/centre a
 * panel restores on load.
 *
 * Separate from `layout.ts` because roam is about the *camera*, not the node positions,
 * and the two are configured independently (a fixed layout is still pannable).
 */

/**
 * `series.*.roam`, which is **pan only** here, ever.
 *
 * Zoom is deliberately not routed through it: ECharts' roam zoom is the scroll wheel,
 * and a wheel event over a panel is the dashboard's to scroll — capturing it means a
 * user scrolling past the panel silently rescales it instead. The panel draws its own
 * zoom buttons and dispatches the roam *action* directly, which needs no `roam` value
 * at all (the action resolves the view coordinate system, not the controller). See
 * `getRelationsZoomAction` and `ChartZoomControls`.
 *
 * https://echarts.apache.org/en/option.html#series-graph.roam
 */
export function resolveRelationsRoam(options: PanelOptions): 'move' | false {
  return resolveRelationsPan(options) ? 'move' : false;
}

/**
 * Whether drag-to-pan is on, falling back to the superseded single `relationsRoam`
 * switch so a dashboard saved before the split keeps panning. These two are the only
 * readers of the deprecated option, which is exactly why they may read it.
 */
export function resolveRelationsPan(options: PanelOptions): boolean {
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- reading it is the migration
  return (options.relationsPan ?? options.relationsRoam) === true;
}

/** Whether the panel's zoom buttons are shown. Same back-compat fallback as pan. */
export function resolveRelationsZoom(options: PanelOptions): boolean {
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- reading it is the migration
  return (options.relationsZoom ?? options.relationsRoam) === true;
}

/** The remembered view, as the keys ECharts keeps a `View`'s roam state in. */
export interface RelationsViewState {
  zoom?: number;
  center?: [number, number];
}

/**
 * The saved pan/zoom, for the two variants that have a view to save.
 *
 * `zoom` and `center` are where ECharts itself keeps the roam state — the roam action
 * syncs them back onto the series model (`viewCoordSysSyncBack`), which is what makes
 * them readable and writable rather than an internal transform. Emitting them is
 * therefore the whole of "restore the view".
 *
 * Empty unless the user asked for it: `relationsRememberView` is off by default, and a
 * stale `zoom` left in a dashboard's JSON must not survive switching the switch back
 * off. See `useRelationsPersistence` for the writing half.
 * https://echarts.apache.org/en/option.html#series-graph.zoom
 */
export function getRelationsViewState(options: PanelOptions): RelationsViewState {
  if (options.relationsRememberView !== true) {
    return {};
  }
  return {
    ...(options.relationsViewZoom != null ? { zoom: options.relationsViewZoom } : {}),
    ...(options.relationsViewCenter != null ? { center: options.relationsViewCenter } : {}),
  };
}
