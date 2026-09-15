import { type PanelOptions } from 'types';

/**
 * Resolve the ECharts pan mode.
 * https://echarts.apache.org/en/option.html#series-graph.roam
 */
export function resolveRelationsRoam(options: PanelOptions): 'move' | false {
  return resolveRelationsPan(options) ? 'move' : false;
}

/** Check whether drag-to-pan is enabled. */
export function resolveRelationsPan(options: PanelOptions): boolean {
  return options.relationsPan === true;
}

/** Check whether the panel shows zoom buttons. */
export function resolveRelationsZoom(options: PanelOptions): boolean {
  return options.relationsZoom === true;
}

/** Saved ECharts view state. */
export interface RelationsViewState {
  zoom?: number;
  center?: [number, number];
}

/**
 * The saved pan/zoom, for the two variants that have a view to save.
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
