import { act, renderHook } from '@testing-library/react';
import { type EChartsType } from 'lib/echarts/echarts';
import { useSettledChartSize } from './useSettledChartSize';

const chart = {} as EChartsType;

describe('useSettledChartSize', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('publishes the initial animated-force size immediately', () => {
    const { result } = renderHook(() => useSettledChartSize(chart, 400, 300, 'animated-force'));

    expect(result.current).toEqual({ width: 400, height: 300 });
  });

  it('publishes every immediate size without waiting', () => {
    const { result, rerender } = renderHook(
      ({ width, height }) => useSettledChartSize(chart, width, height, 'immediate'),
      { initialProps: { width: 400, height: 300 } }
    );

    rerender({ width: 500, height: 320 });
    expect(result.current).toEqual({ width: 500, height: 320 });

    rerender({ width: 640, height: 360 });
    expect(result.current).toEqual({ width: 640, height: 360 });
  });

  it('keeps the initial fixed size', () => {
    const { result, rerender } = renderHook(({ width, height }) => useSettledChartSize(chart, width, height, 'fixed'), {
      initialProps: { width: 400, height: 300 },
    });

    rerender({ width: 500, height: 320 });
    rerender({ width: 640, height: 360 });

    expect(result.current).toEqual({ width: 400, height: 300 });
    expect(jest.getTimerCount()).toBe(0);
  });

  it('publishes only the latest size after a 60-update force burst becomes quiet', () => {
    const { result, rerender } = renderHook(
      ({ width, height }) => useSettledChartSize(chart, width, height, 'animated-force'),
      { initialProps: { width: 400, height: 300 } }
    );

    for (let update = 1; update <= 60; update++) {
      rerender({ width: 400 + update, height: 300 + update });
    }

    act(() => jest.advanceTimersByTime(149));
    expect(result.current).toEqual({ width: 400, height: 300 });

    act(() => jest.advanceTimersByTime(1));
    expect(result.current).toEqual({ width: 460, height: 360 });
  });

  it('cancels a pending update on unmount', () => {
    const { rerender, unmount } = renderHook(
      ({ width, height }) => useSettledChartSize(chart, width, height, 'animated-force'),
      { initialProps: { width: 400, height: 300 } }
    );

    rerender({ width: 500, height: 350 });
    expect(jest.getTimerCount()).toBe(1);

    unmount();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('cancels the old chart update and exposes the replacement chart size immediately', () => {
    const replacement = {} as EChartsType;
    const { result, rerender } = renderHook(
      ({ instance, width, height }) => useSettledChartSize(instance, width, height, 'animated-force'),
      { initialProps: { instance: chart, width: 400, height: 300 } }
    );

    rerender({ instance: chart, width: 500, height: 350 });
    rerender({ instance: replacement, width: 600, height: 400 });

    expect(result.current).toEqual({ width: 600, height: 400 });
    expect(jest.getTimerCount()).toBe(0);

    act(() => jest.advanceTimersByTime(150));
    expect(result.current).toEqual({ width: 600, height: 400 });
  });

  it('cancels pending work and exposes the raw size when the strategy changes', () => {
    const { result, rerender } = renderHook(
      ({ width, height, strategy }) => useSettledChartSize(chart, width, height, strategy),
      {
        initialProps: {
          width: 400,
          height: 300,
          strategy: 'animated-force' as 'animated-force' | 'immediate',
        },
      }
    );

    rerender({ width: 500, height: 350, strategy: 'animated-force' });
    rerender({ width: 600, height: 400, strategy: 'immediate' });
    expect(result.current).toEqual({ width: 600, height: 400 });

    rerender({ width: 700, height: 450, strategy: 'animated-force' });
    expect(result.current).toEqual({ width: 700, height: 450 });

    act(() => jest.advanceTimersByTime(150));
    expect(result.current).toEqual({ width: 700, height: 450 });
  });
});
