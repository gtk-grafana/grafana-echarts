import { type DataFrame, type FieldConfigSource } from '@grafana/data';
import { type PanelContext, PanelContextProvider } from '@grafana/ui';
import { act, render } from '@testing-library/react';
import { type EChartsType } from 'echarts';
import { type SeriesType } from 'editor/types';
import { type ChartFamily } from 'lib/echarts/charts/autoSeriesType';
import { TOOLTIP_MARKER_ATTR } from 'lib/components/tooltip/constants';
import React from 'react';
import { getChart } from 'test/canvas';
import { getComponent, waitForFinished } from 'test/panel';
import { type PanelOptions } from 'types';

/**
 * Driving the pinned tooltip through zrender's **real** pointer pipeline, shared by the
 * footer suites (`dataLinks`, `adHocFilters`).
 *
 * Both of those test a composition rather than a function: the ECharts formatter builds a
 * content model, the React overlay renders it, and `VizTooltipFooter` decides what to show.
 * Unit tests on each layer can all pass while the whole produces no footer at all — which
 * is exactly how the bugs those suites cover reached a browser. So the input has to be a
 * pointer and the assertion has to be the DOM.
 */

/** The pinned tooltip's root, marked by the overlay for its own outside-click handler. */
export const tooltipEl = (): HTMLElement | null => document.querySelector<HTMLElement>(`[${TOOLTIP_MARKER_ATTR}]`);

export const tooltipText = (): string => tooltipEl()?.textContent ?? '';

/**
 * Dispatch through zrender's `Handler` (not the zr Eventful) so ECharts sees a
 * genuine pointer: it runs `findHover`, dispatches element events, and only
 * synthesizes `click` after a matching press/release pair.
 */
export const dispatch = async (chart: EChartsType, type: string, x: number, y: number): Promise<void> => {
  await act(async () => {
    // ZRender's Handler is not part of the public typings.
    const handler = (chart.getZr() as unknown as { handler: { dispatch: (t: string, e: unknown) => void } }).handler;
    handler.dispatch(type, { zrX: x, zrY: y, offsetX: x, offsetY: y, preventDefault: () => undefined });
    // Let ECharts' tooltip timers and the hook's rAF flush settle.
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
};

/** Emulate a browser click: zrender only synthesizes `click` after a press pair. */
export const clickAt = async (chart: EChartsType, x: number, y: number): Promise<void> => {
  // The document-level mousedown is what dismisses a pinned tooltip, so it has
  // to fire too — re-pinning depends on the click rebuilding state afterwards.
  await act(async () => {
    document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  });
  await dispatch(chart, 'mousedown', x, y);
  await dispatch(chart, 'mouseup', x, y);
  await dispatch(chart, 'click', x, y);
};

/** Hover each candidate point until one lands on a chart item, then click to pin. */
export const hoverAndPin = async (
  chart: EChartsType,
  points: Array<[number, number]>
): Promise<readonly [number, number]> => {
  for (const [x, y] of points) {
    await dispatch(chart, 'mousemove', x, y);
    if (tooltipText() !== '') {
      await clickAt(chart, x, y);
      return [x, y] as const;
    }
  }
  throw new Error('No chart item was hoverable at any candidate point');
};

/**
 * The rendered centre of a relations mark, read off the chart rather than guessed.
 * Scanning candidate points cannot say *which* mark was hit — and on these suites that
 * is the whole claim.
 *
 * `getItemLayout` shape depends on the variant: a graph node is `[x, y]` and a graph edge
 * is its endpoint pair, while a sankey node is the `{x, y, dx, dy}` rectangle the layout
 * assigned it.
 */
export const markPoint = (chart: EChartsType, dataType: 'node' | 'edge', dataIndex: number): [number, number] => {
  // ECharts' model/data internals are not part of the public typings.
  const model = chart as unknown as {
    getModel: () => {
      getSeriesByIndex: (index: number) => {
        getData: (type?: string) => { getItemLayout: (i: number) => unknown };
      };
    };
  };
  const layout = model
    .getModel()
    .getSeriesByIndex(0)
    .getData(dataType === 'edge' ? 'edge' : undefined)
    .getItemLayout(dataIndex);
  if (Array.isArray(layout)) {
    const points: Array<number | [number, number]> = layout;
    const [first, second] = points;
    if (typeof first === 'number' && typeof second === 'number') {
      return [first, second];
    }
    const [[x1, y1], [x2, y2]] = [first, second] as Array<[number, number]>;
    return [(x1 + x2) / 2, (y1 + y2) / 2];
  }
  const rect = layout as { x: number; y: number; dx: number; dy: number };
  return [rect.x + rect.dx / 2, rect.y + rect.dy / 2];
};

export interface TooltipPanelArgs {
  frames: DataFrame[];
  seriesType: SeriesType;
  family: ChartFamily;
  options?: Partial<PanelOptions>;
  /**
   * Field config applied through Grafana's real override pass, so `defaults.filterable`
   * reaches every field exactly as the Fields tab's switch puts it there. See
   * `test/fieldConfig.ts` for which properties the test registry carries.
   */
  fieldConfig?: FieldConfigSource;
  /**
   * The panel context the footer reads. `onAddAdHocFilter` is **required** for any filter
   * button to render at all (`collectAdHocFilters` returns nothing without it), so a suite
   * asserting filters must supply one.
   */
  panelContext?: Partial<PanelContext>;
}

/** The panel rendered and settled, with the chart instance the pointer helpers drive. */
export const renderTooltipPanel = async ({
  frames,
  seriesType,
  family,
  options,
  fieldConfig,
  panelContext,
}: TooltipPanelArgs): Promise<EChartsType> => {
  const panel = getComponent(frames, seriesType, options, undefined, undefined, family, fieldConfig);
  const { container } = render(
    panelContext ? <PanelContextProvider value={panelContext as PanelContext}>{panel}</PanelContextProvider> : panel
  );
  const { chart } = getChart(container);
  await waitForFinished(chart);
  return chart!;
};
