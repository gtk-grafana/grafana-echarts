import { act, renderHook } from '@testing-library/react';
import { stopsPerStep } from 'lib/echarts/options/timeline';
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

/**
 * The percentage the user sets, resolved against the length of the timeline they have.
 * A count of stops would mean something different on a five-stop hour and a
 * three-hundred-stop week; a percentage means the same thing on both.
 */
describe('stopsPerStep', () => {
  it('scales with the length of the timeline', () => {
    expect(stopsPerStep(300, 10)).toBe(30);
    expect(stopsPerStep(20, 50)).toBe(10);
    expect(stopsPerStep(20, 100)).toBe(20);
  });

  /**
   * The floor is what makes the 1% default a no-op wherever it can be: 1% of anything up
   * to a hundred stops rounds below one, and a step of zero would leave playback running
   * without ever advancing.
   */
  it('never rounds down to a standing start', () => {
    expect(stopsPerStep(5, 1)).toBe(1);
    expect(stopsPerStep(100, 1)).toBe(1);
    expect(stopsPerStep(0, 50)).toBe(1);
  });

  // Rounded rather than truncated, so the setting is symmetric: half of ten is five.
  it('rounds to the nearest stop', () => {
    expect(stopsPerStep(10, 50)).toBe(5);
    expect(stopsPerStep(101, 1)).toBe(1);
    expect(stopsPerStep(150, 1)).toBe(2);
  });
});

describe('useTimelinePlayback', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const setup = (
    stops: number[] | null = timeline,
    selected: number | null = T0,
    stepDuration = 1000,
    stepStops = 1
  ) => {
    const onSelect = jest.fn();
    const view = renderHook(
      ({ at }: { at: number | null }) => useTimelinePlayback(stops, at, stepDuration, stepStops, onSelect),
      { initialProps: { at: selected } }
    );
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

  /**
   * A coarse step covers several stops at once, which is the whole point on a dense
   * response: three hundred stops at one a second is five minutes of watching.
   */
  it('advances by the configured number of stops', () => {
    const wide = [T0, T0 + STEP, T0 + 2 * STEP, T0 + 3 * STEP, T0 + 4 * STEP];
    const { onSelect, view } = setup(wide, T0, 1000, 2);

    act(() => view.result.current.toggle());
    act(() => jest.advanceTimersByTime(1000));

    expect(onSelect).toHaveBeenLastCalledWith(T0 + 2 * STEP);
  });

  /**
   * A step that would overshoot lands on the **last** stop rather than wrapping past it.
   * The newest sample is the one a reader most expects to see, and a step size the length
   * does not divide by would otherwise skip it on every pass.
   */
  it('lands on the final stop before looping, even from an overshooting step', () => {
    const wide = [T0, T0 + STEP, T0 + 2 * STEP, T0 + 3 * STEP];
    const { onSelect, view } = setup(wide, T0 + 2 * STEP, 1000, 3);

    act(() => view.result.current.toggle());
    act(() => jest.advanceTimersByTime(1000));

    expect(onSelect).toHaveBeenLastCalledWith(T0 + 3 * STEP);
  });

  // And only from the last stop does it wrap — so the cycle repeats itself exactly
  // rather than drifting onto different stops each time round, as modulo would.
  it('wraps to the first stop only once it is on the last', () => {
    const wide = [T0, T0 + STEP, T0 + 2 * STEP, T0 + 3 * STEP];
    const { onSelect, view } = setup(wide, T0 + 3 * STEP, 1000, 3);

    act(() => view.result.current.toggle());
    act(() => jest.advanceTimersByTime(1000));

    expect(onSelect).toHaveBeenLastCalledWith(T0);
  });

  // A step wider than the whole timeline is 100% — end to end, then back to the start.
  it('treats a step wider than the timeline as end to end', () => {
    const { onSelect, view } = setup(timeline, T0, 1000, 99);

    act(() => view.result.current.toggle());
    act(() => jest.advanceTimersByTime(1000));

    expect(onSelect).toHaveBeenLastCalledWith(T0 + 2 * STEP);
  });

  /**
   * A step must not land inside a click. ZRender decides a click happened by comparing
   * the element *objects* `mousedown` and `mouseup` resolved to, and a step replaces the
   * series' elements — so on a `sankey`, whose view rebuilds every element rather than
   * diffing them, a click that straddled a step was silently discarded and the mark could
   * not be pinned while playback ran.
   */
  describe('holding a step for a click', () => {
    const press = () => document.dispatchEvent(new Event('pointerdown'));
    const release = () => document.dispatchEvent(new Event('pointerup'));
    /** Well inside the one-second grace, so a tick lands while the press is still held. */
    const QUICK = 200;

    it('does not step while the pointer is down', () => {
      const { onSelect, view } = setup(timeline, T0, QUICK);

      act(() => view.result.current.toggle());
      act(() => press());
      act(() => jest.advanceTimersByTime(600));

      expect(onSelect).not.toHaveBeenCalled();
    });

    it('steps again once the pointer comes up', () => {
      const { onSelect, view } = setup(timeline, T0, QUICK);

      act(() => view.result.current.toggle());
      act(() => press());
      act(() => jest.advanceTimersByTime(600));
      expect(onSelect).not.toHaveBeenCalled();

      act(() => release());
      act(() => jest.advanceTimersByTime(QUICK));

      expect(onSelect).toHaveBeenCalledTimes(1);
    });

    /**
     * The hold expires rather than waiting for a `pointerup` that may never come — a drag
     * out of the window delivers none, and playback must not stall on one. A drag is also
     * simply not a click, so there is nothing left to protect.
     */
    it('gives up holding once the press outlasts a click', () => {
      const { onSelect, view } = setup(timeline, T0, QUICK);

      act(() => view.result.current.toggle());
      act(() => press());
      act(() => jest.advanceTimersByTime(600));
      expect(onSelect).not.toHaveBeenCalled();

      // Still held, but past the grace: stepping resumes without a `pointerup`.
      act(() => jest.advanceTimersByTime(600));

      expect(onSelect).toHaveBeenCalled();
      release();
    });

    // `pointercancel` is what a browser sends when it takes the gesture over (a scroll,
    // a context menu), and it has to release the hold exactly as an up would.
    it('releases the hold on pointercancel', () => {
      const { onSelect, view } = setup(timeline, T0, QUICK);

      act(() => view.result.current.toggle());
      act(() => press());
      act(() => document.dispatchEvent(new Event('pointercancel')));
      act(() => jest.advanceTimersByTime(QUICK));

      expect(onSelect).toHaveBeenCalledTimes(1);
    });
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
