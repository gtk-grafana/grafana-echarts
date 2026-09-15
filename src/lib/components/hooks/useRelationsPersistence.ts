import { type FieldConfigSource } from '@grafana/data';
import { type ECElementEvent } from 'echarts/core';
import { type ChartContext } from 'lib/echarts/charts/types';
import { type EChartsType } from 'lib/echarts/echarts';

import { type MarkPosition, setMarkPositionsConfig } from 'lib/grafana/fields/seriesConfig';
import { useEffect, useRef } from 'react';
import { type PanelOptions } from 'types';

import { type RelationsNodeItem } from 'lib/echarts/relations/tooltip/types';

/** Wait time before an interaction is saved, in milliseconds. */
const PERSIST_DEBOUNCE_MS = 400;

/** Relations panels render one series. */
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
  // Keep handlers stable during data refreshes.
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

    /** The graph drag, reconstructed. */
    let grabbed: { id: string; from: RelationsNodeItem; pointer: [number, number] } | null = null;

    const onMouseDown = (params: ECElementEvent) => {
      grabbed = null;
      if (latest.current.chartContext.options.relationsDraggable !== true) {
        return;
      }
      const item = params.dataType === 'edge' ? undefined : asNodeItem(params.data);
      // Only a fixed graph reads stored `x` and `y` coordinates.
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
      // Save all positions because the fixed layout seeds unpinned nodes again.
      const positions = readNodePositions(chart);
      positions.set(grab.id, {
        x: (grab.from.x ?? 0) + (to[0] - from[0]),
        y: (grab.from.y ?? 0) + (to[1] - from[1]),
      });
      persistPositions(positions);
    };

    /** Handle the ECharts sankey node-drag action. */
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
        // The sankey layout computes the other node positions.
        debounce(() => persistPositions(new Map([[id, { x: localX, y: localY }]])));
      }
    };

    /** Save pan and zoom changes. */
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

/** The mark id at a node index of the rendered series, read back off the option. */
function readNodeIdAt(chart: EChartsType, dataIndex: number): string | undefined {
  return asNodeItem(readNodeItems(chart)[dataIndex])?.id;
}

/** Every node's position as the option currently states it, keyed by mark id. */
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
