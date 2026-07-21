import { act, fireEvent, renderHook } from '@testing-library/react';
import { type EChartsType } from 'lib/echarts/echarts';
import { type TooltipModel } from 'lib/echarts/tooltip/model';
import { type RefObject } from 'react';
import { useEChartsTooltip } from './useEChartsTooltip';

const model: TooltipModel = { header: 'x', rows: [{ label: 'A', value: '1' }] };

/** Minimal ECharts stand-in that records handlers and lets tests emit events. */
function createFakeChart() {
  const zrHandlers: Record<string, Array<(arg: unknown) => void>> = {};
  const chartHandlers: Record<string, Array<(arg: unknown) => void>> = {};
  const zr = {
    on: (event: string, handler: (arg: unknown) => void) => void (zrHandlers[event] ??= []).push(handler),
    off: (event: string, handler: (arg: unknown) => void) => {
      zrHandlers[event] = (zrHandlers[event] ?? []).filter((h) => h !== handler);
    },
  };
  const chart = {
    getZr: () => zr,
    on: (event: string, handler: (arg: unknown) => void) => void (chartHandlers[event] ??= []).push(handler),
    off: (event: string, handler: (arg: unknown) => void) => {
      chartHandlers[event] = (chartHandlers[event] ?? []).filter((h) => h !== handler);
    },
    isDisposed: () => false,
  };
  return {
    chart: chart as unknown as EChartsType,
    emitZr: (event: string, arg?: unknown) => (zrHandlers[event] ?? []).forEach((h) => h(arg)),
    emit: (event: string, arg?: unknown) => (chartHandlers[event] ?? []).forEach((h) => h(arg)),
  };
}

// A container positioned at (100, 50) so window coords are offset + this origin.

const containerRef = {
  current: { getBoundingClientRect: () => ({ left: 100, top: 50 }) },
} as unknown as RefObject<HTMLElement>;

describe('useEChartsTooltip', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    // Run the rAF flush synchronously; keep setTimeout (the hide delay) on fake timers.
    jest.spyOn(global, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
    jest.spyOn(global, 'cancelAnimationFrame').mockImplementation(() => undefined);
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('shows content on sink and tracks the cursor in window coordinates', () => {
    const fake = createFakeChart();
    const { result } = renderHook(() => useEChartsTooltip(fake.chart, containerRef));

    act(() => {
      result.current.reportTrigger('item');
      fake.emitZr('mousemove', { offsetX: 5, offsetY: 8 });
      result.current.sink(model);
    });

    expect(result.current.state.visible).toBe(true);
    expect(result.current.state.model).toEqual(model);
    expect(result.current.state.position).toEqual({ x: 105, y: 58 });
  });

  it('hides immediately on globalout (cursor leaves the canvas)', () => {
    const fake = createFakeChart();
    const { result } = renderHook(() => useEChartsTooltip(fake.chart, containerRef));

    act(() => {
      result.current.sink(model);
    });
    expect(result.current.state.visible).toBe(true);

    act(() => {
      fake.emitZr('globalout');
    });
    expect(result.current.state.visible).toBe(false);
  });

  it('hides an item-triggered tooltip a short delay after mouseout', () => {
    const fake = createFakeChart();
    const { result } = renderHook(() => useEChartsTooltip(fake.chart, containerRef));

    act(() => {
      result.current.reportTrigger('item');
      result.current.sink(model);
      fake.emit('mouseout');
    });
    // Still visible during the grace period.
    expect(result.current.state.visible).toBe(true);

    act(() => {
      jest.advanceTimersByTime(200);
    });
    expect(result.current.state.visible).toBe(false);
  });

  it('keeps an axis-triggered ("All") tooltip open through mouseout', () => {
    const fake = createFakeChart();
    const { result } = renderHook(() => useEChartsTooltip(fake.chart, containerRef));

    act(() => {
      result.current.reportTrigger('axis');
      result.current.sink(model);
      fake.emit('mouseout');
      jest.advanceTimersByTime(200);
    });

    expect(result.current.state.visible).toBe(true);
  });

  it('pins on click, freezes hover updates, and dismisses on Escape', () => {
    const fake = createFakeChart();
    const { result } = renderHook(() => useEChartsTooltip(fake.chart, containerRef));

    act(() => {
      result.current.reportTrigger('item');
      result.current.sink(model);
      fake.emit('click');
    });
    expect(result.current.state.pinned).toBe(true);

    // A later hover is ignored while pinned.
    act(() => {
      result.current.sink({ header: 'other', rows: [] });
    });
    expect(result.current.state.model).toEqual(model);

    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    expect(result.current.state.pinned).toBe(false);
    expect(result.current.state.visible).toBe(false);
  });
});
