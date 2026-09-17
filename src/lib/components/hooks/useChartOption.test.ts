import { act, renderHook } from '@testing-library/react';
import { type ECBasicOption } from 'echarts/types/dist/shared';
import { type ChartContext } from 'lib/echarts/charts/types';
import { type EChartsType } from 'lib/echarts/echarts';
import { buildPanelChartOption } from 'lib/echarts/options/panelOption';
import { ENABLE_TIME_BRUSH_ACTION } from 'lib/echarts/timeBrush';
import { NOOP_TOOLTIP_SINK } from 'lib/echarts/tooltip/model';
import { useChartOption } from './useChartOption';

// The option build is covered end-to-end by `panelOption.test.ts`; mocking it
// here lets these tests drive the branches this hook owns — the brush arm/clear
// choice, and the empty-canvas path when a family derives no option.
jest.mock('lib/echarts/options/panelOption', () => ({ buildPanelChartOption: jest.fn() }));
const buildOption = jest.mocked(buildPanelChartOption);

interface SetOptionCall {
  option: ECBasicOption;
  opts?: { notMerge?: boolean };
}

function createFakeChart() {
  const setOptionCalls: SetOptionCall[] = [];
  const dispatched: unknown[] = [];
  const clear = jest.fn();
  const handlers: Record<string, Array<() => void>> = {};
  let liveOption: ECBasicOption = {};
  return {
    chart: {
      setOption: (option: ECBasicOption, opts?: { notMerge?: boolean }) => {
        setOptionCalls.push({ option, opts });
        liveOption = option;
      },
      dispatchAction: (payload: unknown) => void dispatched.push(payload),
      clear,
      getOption: () => liveOption,
      isDisposed: () => false,
      on: (event: string, handler: () => void) => void (handlers[event] ??= []).push(handler),
      off: (event: string, handler: () => void) => {
        handlers[event] = (handlers[event] ?? []).filter((candidate) => candidate !== handler);
      },
    } as unknown as EChartsType,
    setOptionCalls,
    dispatched,
    clear,
    emit: (event: string) => (handlers[event] ?? []).forEach((handler) => handler()),
    setLiveSeries: (series: Record<string, unknown>) => {
      liveOption = { series: [series] };
    },
  };
}

const ctx = { seriesType: 'line' } as unknown as ChartContext;
const options = {
  isGrafanaLegend: false,
  plotWidth: 400,
  plotHeight: 300,
  tooltipSink: NOOP_TOOLTIP_SINK,
  reportTooltipTrigger: () => undefined,
};

describe('useChartOption', () => {
  beforeEach(() => {
    buildOption.mockReset();
  });

  it('replaces the option outright rather than merging into the previous one', () => {
    buildOption.mockReturnValue({ series: [] });
    const { chart, setOptionCalls } = createFakeChart();

    renderHook(() => useChartOption(chart, ctx, options));

    // A merge would leave behind components the new family omits.
    expect(setOptionCalls).toEqual([{ option: { series: [] }, opts: { notMerge: true } }]);
  });

  it('reports the resolved tooltip trigger so the overlay knows how to hide', () => {
    buildOption.mockReturnValue({ tooltip: { trigger: 'axis' } });
    const { chart } = createFakeChart();
    const reportTooltipTrigger = jest.fn();

    renderHook(() => useChartOption(chart, ctx, { ...options, reportTooltipTrigger }));

    expect(reportTooltipTrigger).toHaveBeenCalledWith('axis');
  });

  it('arms the time-brush cursor when the option carries a brush', () => {
    buildOption.mockReturnValue({ brush: {} });
    const { chart, dispatched } = createFakeChart();

    renderHook(() => useChartOption(chart, ctx, options));

    // `notMerge` recreates the brush component, so the cursor is re-armed here.
    expect(dispatched).toEqual([ENABLE_TIME_BRUSH_ACTION]);
  });

  it('does not dispatch a cursor action for a graph-like option', () => {
    buildOption.mockReturnValue({ series: [] });
    const { chart, dispatched } = createFakeChart();

    renderHook(() => useChartOption(chart, ctx, options));

    expect(dispatched).toEqual([]);
  });

  it('lets a full replacement dispose brush state during a brush-to-graph transition', () => {
    buildOption.mockReturnValueOnce({ brush: {} }).mockReturnValueOnce({ series: [{ type: 'graph' }] });
    const { chart, dispatched, setOptionCalls } = createFakeChart();
    const { rerender } = renderHook(({ context }) => useChartOption(chart, context, options), {
      initialProps: { context: ctx },
    });

    rerender({ context: { ...ctx, seriesType: 'graph' } as ChartContext });

    expect(setOptionCalls).toHaveLength(2);
    expect(dispatched).toEqual([ENABLE_TIME_BRUSH_ACTION]);
  });

  /**
   * No option means "nothing to draw from this data", which every family falls back to
   * the no-data view for. Throwing here would swap the panel for an error boundary,
   * which is reserved for data the family cannot *read* — that throws from inside the
   * build instead, so the message reaches the user.
   */
  it('clears the canvas rather than throwing when the family derives no option', () => {
    buildOption.mockReturnValue(null);
    const { chart, setOptionCalls, clear } = createFakeChart();

    expect(() => renderHook(() => useChartOption(chart, ctx, options))).not.toThrow();
    expect(clear).toHaveBeenCalled();
    expect(setOptionCalls).toEqual([]);
  });

  it('lets a read failure propagate, so the panel reports it', () => {
    buildOption.mockImplementation(() => {
      throw new Error('cannot read these frames');
    });
    const { chart } = createFakeChart();

    expect(() => renderHook(() => useChartOption(chart, ctx, options))).toThrow('cannot read these frames');
  });

  it('does not build before the instance exists', () => {
    renderHook(() => useChartOption(null, ctx, options));

    expect(buildOption).not.toHaveBeenCalled();
  });

  it('rebuilds when the chart context changes, but not on an unrelated re-render', () => {
    buildOption.mockReturnValue({ series: [] });
    const { chart } = createFakeChart();
    const { rerender } = renderHook(({ context }) => useChartOption(chart, context, options), {
      initialProps: { context: ctx },
    });

    rerender({ context: ctx });
    expect(buildOption).toHaveBeenCalledTimes(1);

    // `chartContext` is memoized upstream, so a new identity means real change.
    rerender({ context: { ...ctx } as ChartContext });
    expect(buildOption).toHaveBeenCalledTimes(2);
  });

  it('does not rebuild for a width-only panel resize', () => {
    buildOption.mockReturnValue({ series: [] });
    const { chart } = createFakeChart();
    const { rerender } = renderHook(({ plotWidth }) => useChartOption(chart, ctx, { ...options, plotWidth }), {
      initialProps: { plotWidth: 400 },
    });

    expect(buildOption).toHaveBeenLastCalledWith(ctx, expect.objectContaining({ plotWidth: 400, plotHeight: 300 }));
    rerender({ plotWidth: 240 });
    expect(buildOption).toHaveBeenCalledTimes(1);
  });

  it('does not rebuild for a height-only panel resize', () => {
    buildOption.mockReturnValue({ series: [] });
    const { chart } = createFakeChart();
    const { rerender } = renderHook(({ plotHeight }) => useChartOption(chart, ctx, { ...options, plotHeight }), {
      initialProps: { plotHeight: 300 },
    });

    expect(buildOption).toHaveBeenLastCalledWith(ctx, expect.objectContaining({ plotWidth: 400, plotHeight: 300 }));
    rerender({ plotHeight: 240 });
    expect(buildOption).toHaveBeenCalledTimes(1);
  });

  it('rebuilds a changed context with the latest plot size', () => {
    buildOption.mockReturnValue({ series: [] });
    const { chart } = createFakeChart();
    const changedContext = { ...ctx } as ChartContext;
    const { rerender } = renderHook(
      ({ context, width, height }) => {
        useChartOption(chart, context, { ...options, plotWidth: width, plotHeight: height });
      },
      { initialProps: { context: ctx, width: 400, height: 300 } }
    );

    rerender({ context: ctx, width: 600, height: 400 });
    rerender({ context: changedContext, width: 600, height: 400 });

    expect(buildOption).toHaveBeenCalledTimes(2);
    expect(buildOption).toHaveBeenLastCalledWith(
      changedContext,
      expect.objectContaining({ plotWidth: 600, plotHeight: 400 })
    );
  });

  it.each(['graph', 'sankey'] as const)('carries an interacted %s view into a data rebuild', (seriesType) => {
    buildOption
      .mockReturnValueOnce({ series: [{ type: seriesType }] })
      .mockReturnValueOnce({ series: [{ type: seriesType, center: ['50%', '60%'] }] });
    const fake = createFakeChart();
    const initialContext = { ...ctx, seriesType } as ChartContext;
    const { rerender } = renderHook(({ context }) => useChartOption(fake.chart, context, options), {
      initialProps: { context: initialContext },
    });

    fake.setLiveSeries({ type: seriesType, zoom: 2.5, center: [12, 34] });
    act(() => fake.emit(`${seriesType}roam`));
    rerender({ context: { ...initialContext } as ChartContext });

    expect(fake.setOptionCalls[1].option.series).toEqual([
      expect.objectContaining({ type: seriesType, zoom: 2.5, center: [12, 34] }),
    ]);
  });

  it('uses a newly computed center when the graph was not interacted with', () => {
    buildOption
      .mockReturnValueOnce({ series: [{ type: 'graph', center: ['50%', '55%'] }] })
      .mockReturnValueOnce({ series: [{ type: 'graph', center: ['50%', '70%'] }] });
    const fake = createFakeChart();
    const graphContext = { ...ctx, seriesType: 'graph' } as ChartContext;
    const { rerender } = renderHook(({ context }) => useChartOption(fake.chart, context, options), {
      initialProps: { context: graphContext },
    });

    rerender({ context: { ...graphContext } as ChartContext });

    expect(fake.setOptionCalls[1].option.series).toEqual([{ type: 'graph', center: ['50%', '70%'] }]);
  });

  it('rereads the live identity view so Reset remains authoritative', () => {
    buildOption.mockReturnValue({ series: [{ type: 'graph', center: ['50%', '60%'] }] });
    const fake = createFakeChart();
    const graphContext = { ...ctx, seriesType: 'graph' } as ChartContext;
    const { rerender } = renderHook(({ context }) => useChartOption(fake.chart, context, options), {
      initialProps: { context: graphContext },
    });

    fake.setLiveSeries({ type: 'graph', zoom: 2, center: [10, 20] });
    act(() => fake.emit('graphroam'));
    fake.setLiveSeries({ type: 'graph', zoom: 1, center: null });
    rerender({ context: { ...graphContext } as ChartContext });

    expect(fake.setOptionCalls[1].option.series).toEqual([{ type: 'graph', zoom: 1, center: ['50%', '60%'] }]);
  });

  it.each(['sankey', 'chord', 'line'] as const)('discards a graph view when switching to %s', (seriesType) => {
    buildOption
      .mockReturnValueOnce({ series: [{ type: 'graph' }] })
      .mockReturnValueOnce({ series: [{ type: seriesType }] });
    const fake = createFakeChart();
    const graphContext = { ...ctx, seriesType: 'graph' } as ChartContext;
    const { rerender } = renderHook(({ context }) => useChartOption(fake.chart, context, options), {
      initialProps: { context: graphContext },
    });

    fake.setLiveSeries({ type: 'graph', zoom: 2, center: [10, 20] });
    act(() => fake.emit('graphroam'));
    rerender({ context: { ...graphContext, seriesType } as ChartContext });

    expect(fake.setOptionCalls[1].option.series).toEqual([{ type: seriesType }]);
  });

  it('keeps the last interacted view through a temporary no-data clear', () => {
    buildOption
      .mockReturnValueOnce({ series: [{ type: 'graph' }] })
      .mockReturnValueOnce(null)
      .mockReturnValueOnce({ series: [{ type: 'graph' }] });
    const fake = createFakeChart();
    const graphContext = { ...ctx, seriesType: 'graph' } as ChartContext;
    const { rerender } = renderHook(({ context }) => useChartOption(fake.chart, context, options), {
      initialProps: { context: graphContext },
    });

    fake.setLiveSeries({ type: 'graph', zoom: 2, center: [10, 20] });
    act(() => fake.emit('graphroam'));
    rerender({ context: { ...graphContext } as ChartContext });
    fake.setLiveSeries({});
    rerender({ context: { ...graphContext } as ChartContext });

    expect(fake.setOptionCalls[1].option.series).toEqual([
      expect.objectContaining({ type: 'graph', zoom: 2, center: [10, 20] }),
    ]);
  });
});
