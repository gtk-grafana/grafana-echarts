import { type FieldConfigSource } from '@grafana/data';
import { type ECElementEvent } from 'echarts/core';
import { type ChartContext } from 'lib/echarts/charts/types';
import { type EChartsType } from 'lib/echarts/echarts';
import { type RelationsNodeItem } from 'lib/echarts/tooltip/types';
import { setMarkPositionConfig } from 'lib/grafana/fields/seriesConfig';
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

/**
 * Whether the response actually contains a field this mark's name would match — i.e.
 * whether a `byName` override written for it has anywhere to land.
 *
 * The guard exists because failing this is *worse* than not saving. A node the response
 * only implied has no field on a host that cannot run the `deriveNodes` pre-pass
 * (`grafana.panelPluginTransformations`, off by default), so the override matches
 * nothing — but writing it still re-renders the panel, and the node snaps straight back
 * to where it was with no explanation. Declining to write leaves the drag standing for
 * the session and keeps the dashboard clean.
 */
function hasFieldNamed(ctx: ChartContext, name: string): boolean {
  return ctx.frames.some((frame) => frame.fields.some((field) => field.name === name));
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

    const persistPosition = (id: string, position: { x: number; y: number }) => {
      const { chartContext: ctx, onFieldConfigChange: write } = latest.current;
      if (!hasFieldNamed(ctx, id)) {
        return;
      }
      write(setMarkPositionConfig(ctx.fieldConfig, id, position));
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
      persistPosition(grab.id, {
        x: (grab.from.x ?? 0) + (to[0] - from[0]),
        y: (grab.from.y ?? 0) + (to[1] - from[1]),
      });
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
        debounce(() => persistPosition(id, { x: localX, y: localY }));
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

/**
 * The mark id at a node index of the rendered series, read back off the option.
 *
 * `getOption()` returns the merged option, which holds the very `data` array this
 * panel supplied — so the id is the one the field config addresses, not a name ECharts
 * derived. Keeps the sankey path free of the internal model, at the cost of one lookup
 * per drag.
 */
function readNodeIdAt(chart: EChartsType, dataIndex: number): string | undefined {
  const series: unknown = chart.getOption()?.series;
  const first: unknown = Array.isArray(series) ? series[SERIES_INDEX] : undefined;
  if (typeof first !== 'object' || first === null || !('data' in first)) {
    return undefined;
  }
  const data: unknown = first.data;
  const item: unknown = Array.isArray(data) ? data[dataIndex] : undefined;
  return asNodeItem(item)?.id;
}
