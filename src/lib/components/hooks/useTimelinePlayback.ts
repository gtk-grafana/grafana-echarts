import { useEffect, useRef, useState } from 'react';

/**
 * How long a press is allowed to hold a step back. A click is well under this; a drag —
 * panning the graph, dragging the slider handle — is longer and must not stall playback,
 * so the hold expires rather than waiting for a `pointerup` that a drag out of the window
 * may never deliver.
 */
const PRESS_GRACE_MS = 1000;

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
 * `stepStops` is how many stops a step covers — `stopsPerStep` resolves the user's
 * percentage against this timeline's length. See {@link nextIndex} for where it lands.
 *
 * A selection the user makes by hand stops it — see {@link TimelinePlayback.stop}.
 */
export function useTimelinePlayback(
  timeline: number[] | null,
  selected: number | null,
  stepDuration: number,
  stepStops: number,
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

  /**
   * When the pointer went down, or `null` while it is up — so a step can wait for a click
   * to finish rather than landing in the middle of one.
   *
   * **A rebuild between `mousedown` and `mouseup` swallows the click.** ZRender decides
   * whether a click happened by comparing the *element objects* the two halves resolved
   * to (`Handler`: `if (this._downEl !== this._upEl … ) return`), and a step replaces the
   * series' elements. Whether that matters is per series: `graph` and `chord` diff their
   * data and update the elements in place, so identity survives and the click lands, but
   * `SankeyView.render` rebuilds every node rect and link curve from scratch — the same
   * missing diff that stops a sankey tweening between stops — so on a sankey every click
   * that straddled a step was silently discarded, and a mark could not be pinned while
   * playback ran. Measured: press, let a step land, release → pinned on graph and chord,
   * not on sankey.
   *
   * Listened for on the document in the capture phase, because the press lands on the
   * canvas and this hook has no handle on it.
   */
  const pressedAtRef = useRef<number | null>(null);
  useEffect(() => {
    const down = () => (pressedAtRef.current = Date.now());
    const up = () => (pressedAtRef.current = null);
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('pointerup', up, true);
    document.addEventListener('pointercancel', up, true);
    return () => {
      document.removeEventListener('pointerdown', down, true);
      document.removeEventListener('pointerup', up, true);
      document.removeEventListener('pointercancel', up, true);
    };
  }, []);

  const latest = useRef({ timeline, selected, stepStops, onSelect });
  // Written in an effect rather than during render, so a render React throws away
  // cannot leave the timer reading state that was never committed. Effects run before
  // any interval can fire, so the tick below always sees the current values.
  useEffect(() => {
    latest.current = { timeline, selected, stepStops, onSelect };
  });

  useEffect(() => {
    if (!playing) {
      return;
    }
    const timer = setInterval(() => {
      // Hold the step while a click is in flight — see `pressedAtRef`. Skipping the beat
      // rather than deferring it: one missed tick is imperceptible, and the alternative
      // is a queue of steps firing at once when the button comes up.
      const pressedAt = pressedAtRef.current;
      if (pressedAt != null && Date.now() - pressedAt < PRESS_GRACE_MS) {
        return;
      }
      const { timeline: stops, selected: at, stepStops: step, onSelect: select } = latest.current;
      if (stops == null || stops.length === 0) {
        return;
      }
      select(stops[nextIndex(resolveTimelineIndex(stops, at), step, stops.length)]);
    }, stepDuration);
    // Cleared on unmount as well as on pause: the panel can be removed mid-playback.
    return () => clearInterval(timer);
  }, [playing, stepDuration]);

  return { playing, toggle: () => setRequested(!playing), stop: () => setRequested(false) };
}

/**
 * Where a step of `step` stops lands from `index`, over a timeline of `length`.
 *
 * Both ends are always visited, which plain modulo arithmetic does not give: a step that
 * would overshoot lands on the **last** stop first, and only wraps to the first from
 * there. Without that, a step size the length does not divide by would skip the final
 * state on every pass — and the newest sample is the one a reader most expects to see —
 * while `(index + step) % length` would also drift the whole cycle onto different stops
 * each time round, so the same playback never repeats itself.
 */
function nextIndex(index: number, step: number, length: number): number {
  const next = index + step;
  if (next < length) {
    return next;
  }
  return index < length - 1 ? length - 1 : 0;
}
