import { act, renderHook } from '@testing-library/react';
import { resolveTimelineIndex, useTimelinePlayback } from './useTimelinePlayback';

/**
 * Playback and the clamping that survives a refresh. Fake timers throughout: the whole
 * point of the hook is *when* it steps, and a real interval would make that a race.
 */

const T0 = 1700000000000;
const STEP = 300000;
const timeline = [T0, T0 + STEP, T0 + 2 * STEP];

describe('resolveTimelineIndex', () => {
  it('finds an exact stop', () => {
    expect(resolveTimelineIndex(timeline, T0 + STEP)).toBe(1);
  });

  /**
   * Nothing selected reads as the **newest** stop, which is what the family's default
   * `lastNotNull` reducer already draws — so switching the slider on does not change the
   * picture.
   */
  it('defaults to the newest stop', () => {
    expect(resolveTimelineIndex(timeline, null)).toBe(2);
    expect(resolveTimelineIndex(timeline, undefined)).toBe(2);
  });

  /**
   * The reason the selection is a timestamp rather than an index: the dashboard refreshes
   * on its own interval and replaces the timeline underneath it. A rolling window drops
   * the oldest stop and shifts every index by one; the nearest *timestamp* is still the
   * same instant.
   */
  it('falls back to the nearest stop when the selection is gone', () => {
    const shifted = [T0 + STEP, T0 + 2 * STEP, T0 + 3 * STEP];

    expect(resolveTimelineIndex(shifted, T0)).toBe(0);
    expect(resolveTimelineIndex(shifted, T0 + 2 * STEP + 10)).toBe(1);
    expect(resolveTimelineIndex(shifted, T0 + 9 * STEP)).toBe(2);
  });
});

describe('useTimelinePlayback', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const setup = (stops: number[] | null = timeline, selected: number | null = T0, stepDuration = 1000) => {
    const onSelect = jest.fn();
    const view = renderHook(({ at }: { at: number | null }) => useTimelinePlayback(stops, at, stepDuration, onSelect), {
      initialProps: { at: selected },
    });
    return { onSelect, view };
  };

  it('does not run until it is started', () => {
    const { onSelect, view } = setup();

    expect(view.result.current.playing).toBe(false);
    act(() => jest.advanceTimersByTime(5000));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('advances one stop per step duration', () => {
    const { onSelect, view } = setup();

    act(() => view.result.current.toggle());
    expect(view.result.current.playing).toBe(true);

    act(() => jest.advanceTimersByTime(1000));
    expect(onSelect).toHaveBeenLastCalledWith(T0 + STEP);

    // The panel owns the selection, so the next step only lands on the right stop once
    // the new one is handed back in — which is what a re-render with `at` does here.
    view.rerender({ at: T0 + STEP });
    act(() => jest.advanceTimersByTime(1000));
    expect(onSelect).toHaveBeenLastCalledWith(T0 + 2 * STEP);
  });

  /**
   * Loops rather than stopping at the end: a topology over a time window is watched as a
   * cycle, and a play button that has to be pressed again after every pass is worse than
   * one the user pauses when they have seen enough.
   */
  it('loops back to the first stop at the end', () => {
    const { onSelect, view } = setup(timeline, T0 + 2 * STEP);

    act(() => view.result.current.toggle());
    act(() => jest.advanceTimersByTime(1000));

    expect(onSelect).toHaveBeenLastCalledWith(T0);
  });

  it('honours the configured step duration', () => {
    const { onSelect, view } = setup(timeline, T0, 250);

    act(() => view.result.current.toggle());
    act(() => jest.advanceTimersByTime(240));
    expect(onSelect).not.toHaveBeenCalled();

    act(() => jest.advanceTimersByTime(20));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  /**
   * A step must not restart the timer. `onSelect` changes the selection, so an effect
   * that depended on it would tear the interval down and rebuild it every tick — the
   * delay would restart each time and playback would run slow and unevenly. Two full
   * durations therefore have to produce two steps, even though the selection moved
   * between them.
   */
  it('keeps a steady cadence while the selection moves under it', () => {
    const { onSelect, view } = setup();

    act(() => view.result.current.toggle());
    act(() => jest.advanceTimersByTime(1000));
    view.rerender({ at: T0 + STEP });
    act(() => jest.advanceTimersByTime(1000));

    expect(onSelect).toHaveBeenCalledTimes(2);
  });

  it('stops stepping when paused', () => {
    const { onSelect, view } = setup();

    act(() => view.result.current.toggle());
    act(() => jest.advanceTimersByTime(1000));
    act(() => view.result.current.toggle());
    act(() => jest.advanceTimersByTime(5000));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(view.result.current.playing).toBe(false);
  });

  /**
   * A selection the user makes by hand wins over playback. Without this the next tick
   * drags the handle back out from under them a fraction of a second after they let go,
   * and the slider feels broken rather than merely busy.
   */
  it('stops when the user takes hold of the slider', () => {
    const { onSelect, view } = setup();

    act(() => view.result.current.toggle());
    act(() => jest.advanceTimersByTime(1000));
    expect(onSelect).toHaveBeenCalledTimes(1);

    act(() => view.result.current.stop());
    expect(view.result.current.playing).toBe(false);

    act(() => jest.advanceTimersByTime(5000));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  // Idempotent, because it fires on every drag and most drags happen while nothing is
  // playing — unlike `toggle`, which would *start* playback from there.
  it('stays stopped when a manual move lands while paused', () => {
    const { view } = setup();

    act(() => view.result.current.stop());
    act(() => view.result.current.stop());

    expect(view.result.current.playing).toBe(false);
  });

  it('clears the interval on unmount', () => {
    const { onSelect, view } = setup();

    act(() => view.result.current.toggle());
    view.unmount();
    act(() => jest.advanceTimersByTime(5000));

    expect(onSelect).not.toHaveBeenCalled();
  });

  /**
   * A refresh can turn a ranged response instant, and a pause button over a timeline that
   * no longer exists is a control that cannot be switched off — so `playing` is derived
   * rather than stored. Nothing steps, and the button reads "play" again.
   */
  it('reports not playing when there is no timeline to play', () => {
    const { onSelect, view } = setup(null);

    act(() => view.result.current.toggle());

    expect(view.result.current.playing).toBe(false);
    act(() => jest.advanceTimersByTime(5000));
    expect(onSelect).not.toHaveBeenCalled();
  });

  // One stop is an instant response with a clock on it: there is nowhere to step to.
  it('reports not playing over a single stop', () => {
    const { view } = setup([T0]);

    act(() => view.result.current.toggle());

    expect(view.result.current.playing).toBe(false);
  });
});
