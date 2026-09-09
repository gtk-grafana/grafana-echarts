import { useEffect, useRef, useState } from 'react';

/**
 * The stop nearest a timestamp, as an index into `timeline` — and the **last** stop when
 * nothing is selected yet.
 *
 * "Nearest" rather than "exact" because the timeline is replaced under the selection: the
 * dashboard refreshes on its own interval, and the new response can drop the timestamp
 * that was picked (a rolling window walks off the oldest sample) or land on a shifted
 * step grid entirely. A selection kept as a *timestamp* survives that, where an index
 * would silently come to mean a different instant.
 *
 * The last stop is the default because it is what `lastNotNull` — the family's default
 * reducer — already draws, so switching the slider on does not change the picture.
 *
 * `timeline` must be ascending and non-empty; `graphWideTimeline` guarantees both.
 */
export function resolveTimelineIndex(timeline: number[], selected: number | null | undefined): number {
  if (selected == null) {
    return timeline.length - 1;
  }
  let nearest = 0;
  for (let index = 1; index < timeline.length; index++) {
    if (Math.abs(timeline[index] - selected) < Math.abs(timeline[nearest] - selected)) {
      nearest = index;
    }
  }
  return nearest;
}

/** Whether playback is running, the button that starts or stops it, and an explicit stop. */
export interface TimelinePlayback {
  playing: boolean;
  toggle: () => void;
  /**
   * Stop playback without starting it — for a selection the *user* made.
   *
   * Grabbing the slider while it is playing has to win, or the next tick drags the handle
   * back out from under them a fraction of a second later and the control feels broken.
   * Separate from `toggle` because it must be idempotent: it fires on every drag, most of
   * which happen while nothing is playing.
   */
  stop: () => void;
}

/**
 * Step the selection through the timeline on a timer, looping at the end.
 *
 * Owns only the timer and the playing flag; the *selection* stays with the panel, which
 * is what keeps one source of truth for a value the slider can also be dragged to. Each
 * tick reads the current selection and reports the next stop through `onSelect`.
 *
 * Those moving parts are read through a ref rather than through the effect's dependency
 * list on purpose. The effect must depend on nothing that changes per tick — `onSelect`
 * changes `selected`, so a dependency on it would tear the interval down and rebuild it
 * on every step, restarting the delay each time and making playback run slow and
 * unevenly.
 *
 * Loops back to the first stop at the end rather than stopping there: a topology over a
 * time window is watched as a cycle, and a play button that has to be pressed again
 * after each pass is a worse default than one the user pauses when they have seen it.
 *
 * A selection the user makes by hand stops it — see {@link TimelinePlayback.stop}.
 */
export function useTimelinePlayback(
  timeline: number[] | null,
  selected: number | null,
  stepDuration: number,
  onSelect: (at: number) => void
): TimelinePlayback {
  const [requested, setRequested] = useState(false);
  /**
   * Playing is **derived**, not stored: a refresh can turn a ranged response instant, and
   * a pause button over a timeline that no longer exists is a control that cannot be
   * switched off. Deriving it means that state can never need correcting from an effect —
   * and it resumes by itself if the data comes back, which is the same answer a user who
   * left it playing would give.
   */
  const playing = requested && timeline != null && timeline.length > 1;

  const latest = useRef({ timeline, selected, onSelect });
  // Written in an effect rather than during render, so a render React throws away
  // cannot leave the timer reading state that was never committed. Effects run before
  // any interval can fire, so the tick below always sees the current values.
  useEffect(() => {
    latest.current = { timeline, selected, onSelect };
  });

  useEffect(() => {
    if (!playing) {
      return;
    }
    const timer = setInterval(() => {
      const { timeline: stops, selected: at, onSelect: select } = latest.current;
      if (stops == null || stops.length === 0) {
        return;
      }
      select(stops[(resolveTimelineIndex(stops, at) + 1) % stops.length]);
    }, stepDuration);
    // Cleared on unmount as well as on pause: the panel can be removed mid-playback.
    return () => clearInterval(timer);
  }, [playing, stepDuration]);

  return { playing, toggle: () => setRequested(!playing), stop: () => setRequested(false) };
}
