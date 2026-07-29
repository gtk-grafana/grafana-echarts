import { type VizLegendOptions } from '@grafana/schema';
import { renderHook } from '@testing-library/react';
import { type ChartContext, type ChartModule } from 'lib/echarts/charts/types';
import { useLegendItems } from './useLegendItems';

const ctx = { seriesType: 'line' } as unknown as ChartContext;
const legend = { calcs: ['mean'] } as unknown as VizLegendOptions;

/** Records the calcs it was asked for and returns one item per calc. */
function createFakeModule() {
  const calls: string[][] = [];
  const buildLegendItems = jest.fn((_ctx: ChartContext, calcs: string[]) => {
    calls.push(calcs);
    return [{ label: 'A', color: 'red', yAxis: 1 }];
  });
  return { module: { buildLegendItems } as unknown as ChartModule, buildLegendItems, calls };
}

describe('useLegendItems', () => {
  it('builds the family items with the resolved calcs', () => {
    const { module, calls } = createFakeModule();

    const { result } = renderHook(() => useLegendItems(module, ctx, legend, true));

    expect(result.current).toEqual([{ label: 'A', color: 'red', yAxis: 1 }]);
    expect(calls).toEqual([['mean']]);
  });

  it('skips the work entirely when the Grafana legend is hidden', () => {
    const { module, buildLegendItems } = createFakeModule();

    const { result } = renderHook(() => useLegendItems(module, ctx, legend, false));

    expect(result.current).toEqual([]);
    // Nothing renders these, so building them would be wasted per-render work.
    expect(buildLegendItems).not.toHaveBeenCalled();
  });

  it('passes no calcs when the legend has none', () => {
    const { module, calls } = createFakeModule();

    renderHook(() => useLegendItems(module, {} as ChartContext, {} as VizLegendOptions, true));

    expect(calls).toEqual([[]]);
  });

  it('memoizes across re-renders with unchanged inputs', () => {
    const { module, buildLegendItems } = createFakeModule();
    const { result, rerender } = renderHook(() => useLegendItems(module, ctx, legend, true));
    const first = result.current;

    rerender();

    // A fresh array each render would re-run every downstream memo (including
    // `useSeriesVisibility`, which depends on the items).
    expect(result.current).toBe(first);
    expect(buildLegendItems).toHaveBeenCalledTimes(1);
  });

  it('rebuilds when the chart context changes', () => {
    const { module, buildLegendItems } = createFakeModule();
    const { rerender } = renderHook(({ context }) => useLegendItems(module, context, legend, true), {
      initialProps: { context: ctx },
    });

    rerender({ context: { ...ctx } as ChartContext });

    expect(buildLegendItems).toHaveBeenCalledTimes(2);
  });
});
