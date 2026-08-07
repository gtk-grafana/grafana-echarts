import { type FieldConfigSource } from '@grafana/data';
import { type ECElementEvent } from 'echarts/core';
import { type ChartContext } from 'lib/echarts/charts/types';
import { type EChartsType } from 'lib/echarts/echarts';
import { type RelationsNodeItem } from 'lib/echarts/tooltip/types';
import { type MarkPosition, setMarkPositionsConfig } from 'lib/grafana/fields/seriesConfig';
import { useEffect, useRef } from 'react';
import { type PanelOptions } from 'types';

/**
 * Write two relations interactions back into the panel's saved configuration: where a
 * node was dragged to, and where the view was panned and zoomed to.
 *
 * **Both are edits, not view state**, which is the whole reason this exists. A drag
 * that a refresh undoes is not a layout, and a pan that a reload forgets is not a
 * choice — the panel had no way to keep either, so `Layout: Fixed` and `Draggable
 * nodes` between them could only ever be set by hand-writing coordinates into an
 * override.
 *
 * Two different stores, because they answer to different things:
 *
 * - a **node position** is per-mark config, so it goes where every other per-mark
 *   choice goes — a `byName` `custom.fixedX`/`fixedY` override, via
 *   `onFieldConfigChange`, exactly as the legend's colour picker writes a fixed
 *   colour. The user can see it and clear it in the override editor afterwards;
 * - the **view** belongs to the panel rather than to any mark, so it is a panel
 *   option, and it is written only when `relationsRememberView` asks for it.
 *
 * Everything here is bound to ECharts' public surface. The sankey drag has a real
 * action behind it (`dragnode`, carrying `localX`/`localY`); the graph drag has none
 * at all, so it is reconstructed from an element `mousedown` — which carries the very
 * item this panel emitted, `id` and pinned coordinates included — plus zrender's
 * `dragend` and a pixel-to-data conversion.
 */

/** How long after the last roam/drag event the write is issued, in ms. */
const PERSIST_DEBOUNCE_MS = 400;

/** The one series a relations panel ever renders. */
const SERIES_INDEX = 0;

interface Options {
  chartContext: ChartContext;
  onFieldConfigChange: (fieldConfig: FieldConfigSource) => void;
  onOptionsChange: (options: PanelOptions) => void;
}

/** A relations node item as it comes back off an ECharts element event. */
function asNodeItem(value: unknown): RelationsNodeItem | undefined {
  return typeof value === 'object' && value !== null && 'id' in value && typeof value.id === 'string'
    ? // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- narrowed above
      (value as RelationsNodeItem)
    : undefined;
}

/** The view state ECharts synced back onto the series after a roam. */
function readViewState(chart: EChartsType): { zoom?: number; center?: [number, number] } | undefined {
  // `getOption()` is the public read of the merged option, and the roam action writes
  // `zoom`/`center` straight onto the series model (`viewCoordSysSyncBack`), so this
  // is where the roamed view legitimately lives rather than an internal transform.
  const series: unknown = chart.getOption()?.series;
  const first: unknown = Array.isArray(series) ? series[SERIES_INDEX] : undefined;
  if (typeof first !== 'object' || first === null) {
    return undefined;
  }
  const zoom: unknown = 'zoom' in first ? first.zoom : undefined;
  const center: unknown = 'center' in first ? first.center : undefined;
  const isPoint = Array.isArray(center) && center.length === 2 && center.every((n) => typeof n === 'number');
  return {
    ...(typeof zoom === 'number' ? { zoom } : {}),
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- checked above
    ...(isPoint ? { center: center as [number, number] } : {}),
  };
}

export function useRelationsPersistence(
  chart: EChartsType | null,
  { chartContext, onFieldConfigChange, onOptionsChange }: Options
): void {
  // The handlers below are bound once per chart instance but read the latest props
  // through this ref, so a data refresh — which rebuilds `chartContext` on every
  // response — does not re-bind them, and cannot do so mid-drag.
  const latest = useRef({ chartContext, onFieldConfigChange, onOptionsChange });
  useEffect(() => {
    latest.current = { chartContext, onFieldConfigChange, onOptionsChange };
  }, [chartContext, onFieldConfigChange, onOptionsChange]);

  useEffect(() => {
    if (!chart) {
      return;
    }
    const zr = chart.getZr();
    let timer: ReturnType<typeof setTimeout> | null = null;
    /** Coalesce a burst of drag/roam events into one write. */
    const debounce = (write: () => void) => {
      if (timer != null) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => {
        timer = null;
        write();
      }, PERSIST_DEBOUNCE_MS);
    };

    const persistPositions = (positions: ReadonlyMap<string, MarkPosition>) => {
      const { chartContext: ctx, onFieldConfigChange: write } = latest.current;
      if (positions.size === 0) {
        return;
      }
      write(setMarkPositionsConfig(ctx.fieldConfig, positions));
    };

    /**
     * The graph drag, reconstructed — because `GraphView` handles it entirely inside
     * zrender and registers no action, so there is no event carrying "node N moved to
     * (x, y)" the way the sankey's `dragnode` does.
     *
     * What there *is*: an element `mousedown` whose `params.data` is the item this
     * panel put in the option, so it carries the mark's `id` and — under the fixed
     * layout, the only one that keeps a position — its pre-drag `x`/`y`. Adding the
     * drag's displacement to that is exact, where reading the drop pointer would be
     * off by wherever inside the node the user grabbed it.
     *
     * The displacement is measured in **data** space, via `convertFromPixel`, because
     * `x`/`y` are data coordinates: the view scales its bounding box onto the panel
     * rect and may be zoomed, so a pixel delta is not a coordinate delta.
     */
    let grabbed: { id: string; from: RelationsNodeItem; pointer: [number, number] } | null = null;

    const onMouseDown = (params: ECElementEvent) => {
      grabbed = null;
      if (latest.current.chartContext.options.relationsDraggable !== true) {
        return;
      }
      const item = params.dataType === 'edge' ? undefined : asNodeItem(params.data);
      // `x`/`y` on the item **is** the gate on "can this position be kept": the option
      // layer emits them only under `layout: 'none'`, which is the only layout that
      // reads a stored coordinate back (`toNodeItems`). A force drag is a nudge to the
      // simulation and a circular one is re-solved from the ring, so neither node
      // carries a coordinate and neither is recorded here. A sankey node carries
      // `localX`/`localY` instead and takes the `dragnode` path below.
      if (item?.x == null || item.y == null || params.event == null) {
        return;
      }
      grabbed = { id: item.id, from: item, pointer: [params.event.offsetX, params.event.offsetY] };
    };

    const onDragEnd = (event: { offsetX: number; offsetY: number }) => {
      const grab = grabbed;
      grabbed = null;
      if (grab == null || chart.isDisposed()) {
        return;
      }
      const from = chart.convertFromPixel({ seriesIndex: SERIES_INDEX }, grab.pointer);
      const to = chart.convertFromPixel({ seriesIndex: SERIES_INDEX }, [event.offsetX, event.offsetY]);
      if (!Array.isArray(from) || !Array.isArray(to)) {
        return;
      }
      // **Every** node's position, not just the dragged one. The graph variant seeds any
      // node without a stored pair onto a ring around the nodes that have one
      // (`resolveFixedPositions`), so recording the first drag alone would re-seed all of
      // its neighbours around it — drag one node and the topology rearranges itself, which
      // is what "moving a node breaks the graph" was. Writing the layout as drawn makes the
      // drag mean what it looks like it means, and every subsequent one moves one node.
      const positions = readNodePositions(chart);
      positions.set(grab.id, {
        x: (grab.from.x ?? 0) + (to[0] - from[0]),
        y: (grab.from.y ?? 0) + (to[1] - from[1]),
      });
      persistPositions(positions);
    };

    /**
     * The sankey drag, which needs none of that: ECharts dispatches a real `dragNode`
     * action per movement, carrying the node's index and its new position as a
     * fraction of the layout rect. Debounced because it fires on every pointer move.
     *
     * The index is into the node data in the order the series was built, which is the
     * visible node order — the same list `buildOption` mapped, so the id lookup cannot
     * drift.
     */
    const onDragNode = (payload: unknown) => {
      const { chartContext: ctx } = latest.current;
      if (ctx.seriesType !== 'sankey' || ctx.options.relationsDraggable !== true) {
        return;
      }
      if (typeof payload !== 'object' || payload === null) {
        return;
      }
      const dataIndex: unknown = 'dataIndex' in payload ? payload.dataIndex : undefined;
      const localX: unknown = 'localX' in payload ? payload.localX : undefined;
      const localY: unknown = 'localY' in payload ? payload.localY : undefined;
      if (typeof dataIndex !== 'number' || typeof localX !== 'number' || typeof localY !== 'number') {
        return;
      }
      const id = readNodeIdAt(chart, dataIndex);
      if (id != null) {
        // One node, unlike the graph branch: a sankey's other nodes are *computed* by the
        // flow layout rather than seeded from the pinned ones, so pinning this one cannot
        // move them.
        debounce(() => persistPositions(new Map([[id, { x: localX, y: localY }]])));
      }
    };

    /**
     * The roam (pan/zoom) action, fired by both the drag controller and the panel's
     * own zoom buttons — so a button click is remembered exactly as a drag is.
     */
    const onRoam = () => {
      const { chartContext: ctx, onOptionsChange: write } = latest.current;
      if (ctx.options.relationsRememberView !== true || chart.isDisposed()) {
        return;
      }
      const view = readViewState(chart);
      if (view == null) {
        return;
      }
      debounce(() =>
        write({
          ...ctx.options,
          ...(view.zoom != null ? { relationsViewZoom: view.zoom } : {}),
          ...(view.center != null ? { relationsViewCenter: view.center } : {}),
        })
      );
    };

    chart.on('mousedown', onMouseDown);
    chart.on('dragnode', onDragNode);
    chart.on('graphroam', onRoam);
    chart.on('sankeyroam', onRoam);
    zr.on('dragend', onDragEnd);

    return () => {
      if (timer != null) {
        clearTimeout(timer);
      }
      if (!chart.isDisposed()) {
        chart.off('mousedown', onMouseDown);
        chart.off('dragnode', onDragNode);
        chart.off('graphroam', onRoam);
        chart.off('sankeyroam', onRoam);
        zr.off('dragend', onDragEnd);
      }
    };
  }, [chart]);
}

/** The rendered series' node items, read back off the merged option. */
function readNodeItems(chart: EChartsType): unknown[] {
  const series: unknown = chart.getOption()?.series;
  const first: unknown = Array.isArray(series) ? series[SERIES_INDEX] : undefined;
  if (typeof first !== 'object' || first === null || !('data' in first)) {
    return [];
  }
  const data: unknown = first.data;
  return Array.isArray(data) ? data : [];
}

/**
 * The mark id at a node index of the rendered series, read back off the option.
 *
 * `getOption()` returns the merged option, which holds the very `data` array this
 * panel supplied — so the id is the one the field config addresses, not a name ECharts
 * derived. Keeps the sankey path free of the internal model, at the cost of one lookup
 * per drag.
 */
function readNodeIdAt(chart: EChartsType, dataIndex: number): string | undefined {
  return asNodeItem(readNodeItems(chart)[dataIndex])?.id;
}

/**
 * Every node's position as the option currently states it, keyed by mark id.
 *
 * The option is where the *rendered* layout is: the option layer emits an `x`/`y` per node
 * under `layout: 'none'`, pinned or seeded (`resolveFixedPositions`), so this is the graph
 * exactly as the user is looking at it — which is what a drag has to preserve for every node
 * it did not touch. Nodes without a pair are skipped rather than defaulted: that is a layout
 * with no coordinate to keep, and inventing `0, 0` would stack them on the origin.
 */
function readNodePositions(chart: EChartsType): Map<string, MarkPosition> {
  const positions = new Map<string, MarkPosition>();
  for (const item of readNodeItems(chart)) {
    const node = asNodeItem(item);
    if (node != null && typeof node.x === 'number' && typeof node.y === 'number') {
      positions.set(node.id, { x: node.x, y: node.y });
    }
  }
  return positions;
}
