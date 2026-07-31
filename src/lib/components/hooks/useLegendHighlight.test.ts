import { DataHoverClearEvent, DataHoverEvent, EventBusSrv } from '@grafana/data';
import { renderHook } from '@testing-library/react';
import { type ChartContext, type ChartModule, type LegendHighlightTarget } from 'lib/echarts/charts/types';
import { type EChartsType } from 'lib/echarts/echarts';
import { type RefObject } from 'react';
import { useLegendHighlight } from './useLegendHighlight';

interface Dispatched {
  type: string;
  seriesIndex?: number;
  dataType?: string;
  dataIndex?: number[];
}

function createFakeChart() {
  const dispatched: Dispatched[] = [];
  const chart = {
    isDisposed: () => false,
    dispatchAction: (payload: Dispatched) => void dispatched.push(payload),
  };
  return { ref: { current: chart as unknown as EChartsType } as RefObject<EChartsType | null>, dispatched };
}

/** A relations-shaped module: a legend row is a node plus the links touching it. */
const targetsByLabel: Record<string, LegendHighlightTarget[]> = {
  gateway: [
    { dataType: 'node', dataIndex: [0] },
    { dataType: 'edge', dataIndex: [0, 1] },
  ],
  db: [{ dataType: 'node', dataIndex: [3] }],
};

const chartModule = {
  getLegendHighlightTargets: (_ctx: ChartContext, label: string) => targetsByLabel[label] ?? [],
} as unknown as ChartModule;

const ctx = {} as ChartContext;

const hover = (bus: EventBusSrv, dataId: string) => bus.publish(new DataHoverEvent({ point: {}, dataId }));

describe('useLegendHighlight', () => {
  it('highlights the hovered row’s node and its links', () => {
    const bus = new EventBusSrv();
    const { ref, dispatched } = createFakeChart();
    renderHook(() => useLegendHighlight(ref, chartModule, ctx, bus));

    hover(bus, 'gateway');

    expect(dispatched).toEqual([
      { type: 'highlight', seriesIndex: 0, dataType: 'node', dataIndex: [0] },
      { type: 'highlight', seriesIndex: 0, dataType: 'edge', dataIndex: [0, 1] },
    ]);
  });

  it('reverts exactly what it highlighted when the hover clears', () => {
    const bus = new EventBusSrv();
    const { ref, dispatched } = createFakeChart();
    renderHook(() => useLegendHighlight(ref, chartModule, ctx, bus));

    hover(bus, 'gateway');
    dispatched.length = 0;
    bus.publish(new DataHoverClearEvent());

    expect(dispatched).toEqual([
      { type: 'downplay', seriesIndex: 0, dataType: 'node', dataIndex: [0] },
      { type: 'downplay', seriesIndex: 0, dataType: 'edge', dataIndex: [0, 1] },
    ]);
  });

  // Moving straight from one row to the next may emit no clear in between, so the
  // previous emphasis has to be dropped by the next hover or it would accumulate.
  it('drops the previous emphasis when the hover moves to another row', () => {
    const bus = new EventBusSrv();
    const { ref, dispatched } = createFakeChart();
    renderHook(() => useLegendHighlight(ref, chartModule, ctx, bus));

    hover(bus, 'gateway');
    dispatched.length = 0;
    hover(bus, 'db');

    expect(dispatched).toEqual([
      { type: 'downplay', seriesIndex: 0, dataType: 'node', dataIndex: [0] },
      { type: 'downplay', seriesIndex: 0, dataType: 'edge', dataIndex: [0, 1] },
      { type: 'highlight', seriesIndex: 0, dataType: 'node', dataIndex: [3] },
    ]);
  });

  it('does nothing for a label the family does not recognise', () => {
    const bus = new EventBusSrv();
    const { ref, dispatched } = createFakeChart();
    renderHook(() => useLegendHighlight(ref, chartModule, ctx, bus));

    hover(bus, 'not-a-node');

    expect(dispatched).toEqual([]);
  });

  // Families that opt out must not even subscribe, so a legend hover stays inert.
  it('never subscribes for a family with no highlight targets', () => {
    const bus = new EventBusSrv();
    const { ref, dispatched } = createFakeChart();
    renderHook(() => useLegendHighlight(ref, {} as ChartModule, ctx, bus));

    hover(bus, 'gateway');

    expect(dispatched).toEqual([]);
  });

  it('clears the emphasis on unmount', () => {
    const bus = new EventBusSrv();
    const { ref, dispatched } = createFakeChart();
    const view = renderHook(() => useLegendHighlight(ref, chartModule, ctx, bus));

    hover(bus, 'db');
    dispatched.length = 0;
    view.unmount();

    expect(dispatched).toEqual([{ type: 'downplay', seriesIndex: 0, dataType: 'node', dataIndex: [3] }]);
  });
});
