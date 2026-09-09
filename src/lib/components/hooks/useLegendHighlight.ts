import { DataHoverClearEvent, DataHoverEvent, type EventBus } from '@grafana/data';
import { type ChartContext, type ChartModule } from 'lib/echarts/charts/types';
import { type EChartsType } from 'lib/echarts/echarts';
import { type RefObject, useCallback, useEffect, useRef } from 'react';

/**
 * Emphasise a legend row's marks in the chart while the cursor is on that row.
 *
 * **Driven by the event bus, not by props.** `VizLegend` declares
 * `onLabelMouseOver`/`onLabelMouseOut` on its props type, but its implementation
 * destructures a fixed list that excludes them and installs its own handlers,
 * which publish {@link DataHoverEvent} / {@link DataHoverClearEvent} carrying
 * `payload.dataId = item.label`. Passing those props is therefore silently
 * ignored (verified against `@grafana/ui`'s `VizLegend.mjs`), and the bus is the
 * only channel a legend hover actually reaches the panel through — which is also
 * how core wires legend-to-viz hover sync.
 *
 * No filtering by event origin: an unrecognised `dataId` resolves to no targets,
 * so a hover published by another panel is inert unless it happens to name one of
 * this chart's own marks — which is exactly the cross-panel behaviour the shared
 * bus exists for.
 *
 * Which marks light up is the chart family's business — a relations row means
 * "this node plus every link touching it" — so the targets come from
 * {@link ChartModule.getLegendHighlightTargets}. A family that does not implement
 * it never subscribes.
 *
 * The chart lives in `EChart` while the legend is `VizLayout`'s sibling, so the
 * instance is reached through a ref the panel shares between them.
 * https://echarts.apache.org/en/api.html#action.highlight
 */
export function useLegendHighlight(
  chartRef: RefObject<EChartsType | null>,
  chartModule: ChartModule,
  chartContext: ChartContext,
  eventBus: EventBus
): void {
  // What is currently emphasised, so the same payload can be reverted rather than
  // recomputed — the data may have changed underneath since it was applied.
  const activeRef = useRef<Array<{ dataType?: string; dataIndex: number[] }>>([]);

  const clear = useCallback(() => {
    const chart = chartRef.current;
    if (chart != null && !chart.isDisposed()) {
      for (const target of activeRef.current) {
        chart.dispatchAction({ type: 'downplay', seriesIndex: 0, ...target });
      }
    }
    activeRef.current = [];
  }, [chartRef]);

  const resolve = useCallback(
    (label: string) => {
      const chart = chartRef.current;
      if (chart == null || chart.isDisposed()) {
        return;
      }
      // A hover that moves straight from one row to the next may not emit a clear.
      clear();
      const targets = chartModule.getLegendHighlightTargets?.(chartContext, label) ?? [];
      for (const target of targets) {
        chart.dispatchAction({ type: 'highlight', seriesIndex: 0, ...target });
      }
      activeRef.current = targets;
    },
    [chartRef, chartModule, chartContext, clear]
  );

  // `chartContext` changes identity on every data/option change, so the handler is
  // reached through a ref and the subscription below is not torn down each render.
  const resolveRef = useRef(resolve);
  useEffect(() => {
    resolveRef.current = resolve;
  }, [resolve]);

  const supported = chartModule.getLegendHighlightTargets != null;

  useEffect(() => {
    if (!supported) {
      return;
    }
    const hover = eventBus.subscribe(DataHoverEvent, (event) => {
      const label = event.payload?.dataId;
      if (label != null) {
        resolveRef.current(label);
      }
    });
    const cleared = eventBus.subscribe(DataHoverClearEvent, () => clear());
    return () => {
      hover.unsubscribe();
      cleared.unsubscribe();
      clear();
    };
  }, [supported, eventBus, clear]);
}
