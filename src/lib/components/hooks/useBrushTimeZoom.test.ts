import { type AbsoluteTimeRange } from '@grafana/data';
import { renderHook } from '@testing-library/react';
import { type EChartsType } from 'lib/echarts/echarts';
import { CLEAR_TIME_BRUSH_ACTION } from 'lib/echarts/timeBrush';
import { useBrushTimeZoom } from './useBrushTimeZoom';

/** A `lineX` brush selection, as ECharts reports it on a time axis. */
const brushEnd = (from: number, to: number) => ({ areas: [{ coordRange: [from, to] }] });

function createFakeChart(xAxis: unknown = [{ type: 'time' }], { disposed = false } = {}) {
  const handlers: Record<string, Array<(arg: unknown) => void>> = {};
  const dispatched: unknown[] = [];
  const chart = {
    on: (event: string, handler: (arg: unknown) => void) => void (handlers[event] ??= []).push(handler),
    off: (event: string, handler: (arg: unknown) => void) => {
      handlers[event] = (handlers[event] ?? []).filter((h) => h !== handler);
    },
    getOption: () => ({ xAxis }),
    dispatchAction: (payload: unknown) => void dispatched.push(payload),
    isDisposed: () => disposed,
  };
  return {
    chart: chart as unknown as EChartsType,
    dispatched,
    handlerCount: (event: string) => (handlers[event] ?? []).length,
    emit: (event: string, arg?: unknown) => (handlers[event] ?? []).forEach((h) => h(arg)),
  };
}

describe('useBrushTimeZoom', () => {
  it('turns a completed selection into an absolute time range', () => {
    const { chart, emit } = createFakeChart();
    const onChangeTimeRange = jest.fn();

    renderHook(() => useBrushTimeZoom(chart, onChangeTimeRange));
    emit('brushEnd', brushEnd(1000, 5000));

    expect(onChangeTimeRange).toHaveBeenCalledWith<[AbsoluteTimeRange]>({ from: 1000, to: 5000 });
  });

  it('clears the selection highlight so it does not linger through the refetch', () => {
    const { chart, emit, dispatched } = createFakeChart();

    renderHook(() => useBrushTimeZoom(chart, jest.fn()));
    emit('brushEnd', brushEnd(1000, 5000));

    expect(dispatched).toEqual([CLEAR_TIME_BRUSH_ACTION]);
  });

  it('ignores a zero-width selection', () => {
    const { chart, emit, dispatched } = createFakeChart();
    const onChangeTimeRange = jest.fn();

    renderHook(() => useBrushTimeZoom(chart, onChangeTimeRange));
    emit('brushEnd', brushEnd(1000, 1000));

    expect(onChangeTimeRange).not.toHaveBeenCalled();
    // The highlight is still cleared — the drag happened, it just resolved to nothing.
    expect(dispatched).toEqual([CLEAR_TIME_BRUSH_ACTION]);
  });

  it('calls the latest setter without re-binding the listener', () => {
    const { chart, emit, handlerCount } = createFakeChart();
    const first = jest.fn();
    const second = jest.fn();
    const { rerender } = renderHook(({ onChange }) => useBrushTimeZoom(chart, onChange), {
      initialProps: { onChange: first },
    });

    rerender({ onChange: second });
    emit('brushEnd', brushEnd(1000, 5000));

    // The ref is what lets a new prop land without re-registering on the instance.
    expect(handlerCount('brushEnd')).toBe(1);
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });

  it('throws on a chart with no usable x axis', () => {
    // `getOption` normally normalizes `xAxis` to an array; a radar/pie option has none.
    const { chart, emit } = createFakeChart(null);

    renderHook(() => useBrushTimeZoom(chart, jest.fn()));

    expect(() => emit('brushEnd', brushEnd(1000, 5000))).toThrow('Invalid xAxis!');
  });

  it('detaches the listener on unmount', () => {
    const { chart, handlerCount } = createFakeChart();
    const { unmount } = renderHook(() => useBrushTimeZoom(chart, jest.fn()));
    expect(handlerCount('brushEnd')).toBe(1);

    unmount();

    expect(handlerCount('brushEnd')).toBe(0);
  });

  it('leaves a disposed instance alone on unmount', () => {
    // EChart's layout-effect cleanup disposes before this passive cleanup runs.
    const { chart, handlerCount } = createFakeChart([{ type: 'time' }], { disposed: true });
    const { unmount } = renderHook(() => useBrushTimeZoom(chart, jest.fn()));

    expect(() => unmount()).not.toThrow();
    // `dispose` already dropped its own listeners, so `off` is skipped.
    expect(handlerCount('brushEnd')).toBe(1);
  });

  it('does nothing before the instance exists', () => {
    expect(() => renderHook(() => useBrushTimeZoom(null, jest.fn()))).not.toThrow();
  });
});
