import { act, renderHook } from '@testing-library/react';
import { type ECBasicOption } from 'echarts/types/dist/shared';
import { type ChartContext } from 'lib/echarts/charts/types';
import { type EChartsType } from 'lib/echarts/echarts';
import { buildPanelChartOption } from 'lib/echarts/options/panelOption';
import { DISABLE_TIME_BRUSH_ACTION, ENABLE_TIME_BRUSH_ACTION } from 'lib/echarts/timeBrush';
import { NOOP_TOOLTIP_SINK } from 'lib/echarts/tooltip/model';
import { useChartOption } from './useChartOption';
import { useSettledChartSize } from './useSettledChartSize';

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
  return {
    chart: {
      setOption: (option: ECBasicOption, opts?: { notMerge?: boolean }) => void setOptionCalls.push({ option, opts }),
      dispatchAction: (payload: unknown) => void dispatched.push(payload),
      clear,
    } as unknown as EChartsType,
    setOptionCalls,
    dispatched,
    clear,
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

  afterEach(() => {
    jest.useRealTimers();
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

  it('clears the brush cursor for a family with no time axis', () => {
    buildOption.mockReturnValue({ series: [] });
    const { chart, dispatched } = createFakeChart();

    renderHook(() => useChartOption(chart, ctx, options));

    expect(dispatched).toEqual([DISABLE_TIME_BRUSH_ACTION]);
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

  it('rebuilds with the new plot width after a width-only panel resize', () => {
    buildOption.mockReturnValue({ series: [] });
    const { chart } = createFakeChart();
    const { rerender } = renderHook(({ plotWidth }) => useChartOption(chart, ctx, { ...options, plotWidth }), {
      initialProps: { plotWidth: 400 },
    });

    expect(buildOption).toHaveBeenLastCalledWith(ctx, expect.objectContaining({ plotWidth: 400, plotHeight: 300 }));
    rerender({ plotWidth: 240 });
    expect(buildOption).toHaveBeenLastCalledWith(ctx, expect.objectContaining({ plotWidth: 240, plotHeight: 300 }));
    expect(buildOption).toHaveBeenCalledTimes(2);
  });

  it('rebuilds with the new plot height after a height-only panel resize', () => {
    buildOption.mockReturnValue({ series: [] });
    const { chart } = createFakeChart();
    const { rerender } = renderHook(({ plotHeight }) => useChartOption(chart, ctx, { ...options, plotHeight }), {
      initialProps: { plotHeight: 300 },
    });

    expect(buildOption).toHaveBeenLastCalledWith(ctx, expect.objectContaining({ plotWidth: 400, plotHeight: 300 }));
    rerender({ plotHeight: 240 });
    expect(buildOption).toHaveBeenLastCalledWith(ctx, expect.objectContaining({ plotWidth: 400, plotHeight: 240 }));
    expect(buildOption).toHaveBeenCalledTimes(2);
  });

  it('rebuilds the full option once with the final settled force size', () => {
    jest.useFakeTimers();
    buildOption.mockReturnValue({ series: [] });
    const { chart } = createFakeChart();
    const { rerender } = renderHook(
      ({ width, height }) => {
        const settled = useSettledChartSize(chart, width, height, 'animated-force');
        useChartOption(chart, ctx, { ...options, plotWidth: settled.width, plotHeight: settled.height });
      },
      { initialProps: { width: 400, height: 300 } }
    );

    for (let update = 1; update <= 60; update++) {
      rerender({ width: 400 + update, height: 300 + update });
    }

    expect(buildOption).toHaveBeenCalledTimes(1);
    act(() => jest.advanceTimersByTime(150));

    expect(buildOption).toHaveBeenCalledTimes(2);
    expect(buildOption).toHaveBeenLastCalledWith(ctx, expect.objectContaining({ plotWidth: 460, plotHeight: 360 }));
  });

  it('rebuilds a changed context immediately with the current settled force size', () => {
    jest.useFakeTimers();
    buildOption.mockReturnValue({ series: [] });
    const { chart } = createFakeChart();
    const changedContext = { ...ctx } as ChartContext;
    const { rerender } = renderHook(
      ({ context, width, height }) => {
        const settled = useSettledChartSize(chart, width, height, 'animated-force');
        useChartOption(chart, context, { ...options, plotWidth: settled.width, plotHeight: settled.height });
      },
      { initialProps: { context: ctx, width: 400, height: 300 } }
    );

    rerender({ context: ctx, width: 600, height: 400 });
    rerender({ context: changedContext, width: 600, height: 400 });

    expect(buildOption).toHaveBeenCalledTimes(2);
    expect(buildOption).toHaveBeenLastCalledWith(
      changedContext,
      expect.objectContaining({ plotWidth: 400, plotHeight: 300 })
    );

    act(() => jest.advanceTimersByTime(150));
    expect(buildOption).toHaveBeenLastCalledWith(
      changedContext,
      expect.objectContaining({ plotWidth: 600, plotHeight: 400 })
    );
  });
});
