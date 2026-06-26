import { DashboardCursorSync } from '@grafana/data';
import { getHoverTime, shouldApplyCrosshair, shouldShowSyncedTooltip, throttle } from 'echarts/sync';

describe('getHoverTime', () => {
  it('returns the finite time from the payload point', () => {
    expect(getHoverTime({ point: { time: 1234 } })).toBe(1234);
  });

  it('returns null when time is missing, null, or not finite', () => {
    expect(getHoverTime(undefined)).toBeNull();
    expect(getHoverTime({ point: {} })).toBeNull();
    expect(getHoverTime({ point: { time: null } })).toBeNull();
    expect(getHoverTime({ point: { time: NaN } })).toBeNull();
  });
});

describe('cursor sync mode predicates', () => {
  it('applies the crosshair for Crosshair and Tooltip, not Off', () => {
    expect(shouldApplyCrosshair(DashboardCursorSync.Off)).toBe(false);
    expect(shouldApplyCrosshair(DashboardCursorSync.Crosshair)).toBe(true);
    expect(shouldApplyCrosshair(DashboardCursorSync.Tooltip)).toBe(true);
  });

  it('only shows the synced tooltip box in Tooltip mode', () => {
    expect(shouldShowSyncedTooltip(DashboardCursorSync.Off)).toBe(false);
    expect(shouldShowSyncedTooltip(DashboardCursorSync.Crosshair)).toBe(false);
    expect(shouldShowSyncedTooltip(DashboardCursorSync.Tooltip)).toBe(true);
  });
});

describe('throttle', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('invokes on the leading edge immediately', () => {
    const fn = jest.fn();
    const t = throttle(fn, 100);
    t.run();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('coalesces bursts into a single trailing invocation', () => {
    const fn = jest.fn();
    const t = throttle(fn, 100);

    t.run(); // leading
    t.run();
    t.run();
    expect(fn).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(100); // trailing
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('allows another leading call after the window elapses', () => {
    const fn = jest.fn();
    const t = throttle(fn, 100);

    t.run();
    expect(fn).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(100);
    t.run();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('cancel drops a pending trailing invocation', () => {
    const fn = jest.fn();
    const t = throttle(fn, 100);

    t.run(); // leading
    t.run(); // schedules trailing
    t.cancel();

    jest.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
