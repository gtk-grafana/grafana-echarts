import { act, renderHook } from '@testing-library/react';
import { type EChartsType } from 'lib/echarts/echarts';
import { useChartResize } from './useChartResize';

/** Record the ECharts operations used by the resize hook. */
function createFakeChart(initialWidth = 0, initialHeight = 0) {
  const resized: Array<{ width: number; height: number }> = [];
  const setOption = jest.fn();
  const operations: string[] = [];
  let currentWidth = initialWidth;
  let currentHeight = initialHeight;
  return {
    chart: {
      getWidth: () => currentWidth,
      getHeight: () => currentHeight,
      setOption: (option: unknown, opts?: unknown) => {
        operations.push('setOption');
        setOption(option, opts);
      },
      resize: (size: { width: number; height: number }) => {
        operations.push('resize');
        resized.push(size);
        currentWidth = size.width;
        currentHeight = size.height;
      },
    } as unknown as EChartsType,
    resized,
    setOption,
    operations,
  };
}

describe('useChartResize', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('pushes the allocated size to the instance', () => {
    const { chart, resized } = createFakeChart();

    renderHook(() => useChartResize(chart, 400, 300));

    expect(resized).toEqual([{ width: 400, height: 300 }]);
  });

  it('resizes again when the allocated box changes', () => {
    const { chart, resized } = createFakeChart();
    const { rerender } = renderHook(({ w, h }) => useChartResize(chart, w, h), {
      initialProps: { w: 400, h: 300 },
    });

    rerender({ w: 500, h: 300 });

    expect(resized).toEqual([
      { width: 400, height: 300 },
      { width: 500, height: 300 },
    ]);
  });

  it('does not resize when the chart already has the allocated size', () => {
    const { chart, resized } = createFakeChart(400, 300);
    renderHook(() => useChartResize(chart, 400, 300));

    // ECharts' resize relayouts and repaints, so a no-op call is not free.
    expect(resized).toEqual([]);
  });

  it('enables force motion before each later animated-force resize', () => {
    const { chart, resized, setOption, operations } = createFakeChart(400, 300);
    const { rerender } = renderHook(
      ({ width, height }) => useChartResize(chart, width, height, { strategy: 'animated-force' }),
      { initialProps: { width: 400, height: 300 } }
    );

    rerender({ width: 500, height: 320 });
    rerender({ width: 640, height: 360 });

    expect(setOption).toHaveBeenCalledTimes(2);
    expect(setOption).toHaveBeenNthCalledWith(
      1,
      { series: [{ type: 'graph', force: { layoutAnimation: true, friction: 0.05, initLayout: 'none' } }] },
      undefined
    );
    expect(setOption).toHaveBeenNthCalledWith(
      2,
      { series: [{ type: 'graph', force: { layoutAnimation: true, friction: 0.05, initLayout: 'none' } }] },
      undefined
    );
    expect(resized).toEqual([
      { width: 500, height: 320 },
      { width: 640, height: 360 },
    ]);
    expect(operations).toEqual(['setOption', 'resize', 'setOption', 'resize']);
  });

  it('merges one final option 150 ms after the latest force resize', () => {
    const { chart, setOption } = createFakeChart(400, 300);
    const finalOption = { series: [{ type: 'graph' as const, force: { repulsion: 123 } }] };
    const getSettledOption = jest.fn(() => finalOption);
    const { rerender } = renderHook(
      ({ width, height }) => useChartResize(chart, width, height, { strategy: 'animated-force', getSettledOption }),
      { initialProps: { width: 400, height: 300 } }
    );

    for (let update = 1; update <= 60; update++) {
      rerender({ width: 400 + update, height: 300 + update });
      if (update < 60) {
        act(() => jest.advanceTimersByTime(2));
      }
    }
    act(() => jest.advanceTimersByTime(149));
    expect(getSettledOption).not.toHaveBeenCalled();

    act(() => jest.advanceTimersByTime(1));
    expect(getSettledOption).toHaveBeenCalledWith(460, 360);
    expect(setOption).toHaveBeenLastCalledWith(finalOption, undefined);
    expect(setOption).toHaveBeenCalledTimes(61);
  });

  it('cancels a final force update on unmount', () => {
    const { chart } = createFakeChart(400, 300);
    const getSettledOption = jest.fn(() => ({ series: [] }));
    const { rerender, unmount } = renderHook(
      ({ width }) => useChartResize(chart, width, 300, { strategy: 'animated-force', getSettledOption }),
      { initialProps: { width: 400 } }
    );

    rerender({ width: 500 });
    expect(jest.getTimerCount()).toBe(1);
    unmount();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('cancels final work when the chart or strategy changes', () => {
    const initial = createFakeChart(400, 300);
    const replacement = createFakeChart();
    const getSettledOption = jest.fn(() => ({ series: [] }));
    const { rerender } = renderHook(
      ({ chart, width, strategy }) => useChartResize(chart, width, 300, { strategy, getSettledOption }),
      {
        initialProps: {
          chart: initial.chart,
          width: 400,
          strategy: 'animated-force' as 'animated-force' | 'immediate',
        },
      }
    );

    rerender({ chart: initial.chart, width: 500, strategy: 'animated-force' });
    rerender({ chart: replacement.chart, width: 600, strategy: 'animated-force' });
    expect(jest.getTimerCount()).toBe(0);

    rerender({ chart: replacement.chart, width: 700, strategy: 'animated-force' });
    rerender({ chart: replacement.chart, width: 800, strategy: 'immediate' });
    act(() => jest.advanceTimersByTime(150));
    expect(getSettledOption).not.toHaveBeenCalled();
  });

  it('keeps the configured force state when a replacement chart needs its first resize', () => {
    const initial = createFakeChart(400, 300);
    const replacement = createFakeChart();
    const { rerender } = renderHook(
      ({ chart, width, height }) => useChartResize(chart, width, height, { strategy: 'animated-force' }),
      { initialProps: { chart: initial.chart, width: 400, height: 300 } }
    );

    rerender({ chart: replacement.chart, width: 800, height: 500 });

    expect(replacement.setOption).not.toHaveBeenCalled();
    expect(replacement.resized).toEqual([{ width: 800, height: 500 }]);
  });

  it.each(['fixed', 'circular', 'sankey', 'chord', 'non-relations'])('%s uses immediate resize behavior', () => {
    const { chart, resized, setOption } = createFakeChart(400, 300);

    renderHook(() => useChartResize(chart, 500, 320, { strategy: 'immediate' }));

    expect(setOption).not.toHaveBeenCalled();
    expect(resized).toEqual([{ width: 500, height: 320 }]);
  });

  it('does not resize a fixed chart', () => {
    const { chart, resized, setOption } = createFakeChart(400, 300);

    renderHook(() => useChartResize(chart, 500, 320, { strategy: 'fixed' }));

    expect(setOption).not.toHaveBeenCalled();
    expect(resized).toEqual([]);
  });

  it('does nothing before the instance exists', () => {
    // The instance is created in a layout effect, so the first render sees null.
    expect(() => renderHook(() => useChartResize(null, 400, 300))).not.toThrow();
  });

  it('does not resize a preview card', () => {
    const { chart, resized } = createFakeChart();

    renderHook(() => useChartResize(chart, 400, 300, { enabled: false }));

    expect(resized).toEqual([]);
  });
});
