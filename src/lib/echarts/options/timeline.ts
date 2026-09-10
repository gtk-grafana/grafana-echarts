import { type PanelOptions } from 'types';

/**
 * The time slider's options: read every mark at **one timestamp** instead of reducing its
 * rows to a stat.
 *
 * A leaf module rather than two more resolvers in `options/graph.ts`, where the rest of the
 * family's live. Three unrelated layers ask this same question — the editor (which control
 * to show), the chart module (whether to offer a timeline) and the **tooltip** (whether to
 * name a reducer in the stat row) — and `options/graph.ts` already imports the tooltip
 * builder, so keeping them there would have made the tooltip's read a cycle.
 */

/**
 * The time slider is **off** by default: reducing the row dimension to one stat is what
 * the family has always done, and it is the only reading an instant response has.
 */
export const RELATIONS_TIME_SLIDER_DEFAULT = false;

/**
 * Wall-clock milliseconds per step during playback — not an aggregation window. At a
 * stop the panel reads the one sample at that timestamp; there is no window to widen.
 * One second is slow enough to read a topology and fast enough to see it move.
 */
export const RELATIONS_TIME_STEP_DURATION_DEFAULT = 1000;

/**
 * Whether the panel offers a timestamp to read the marks at instead of a reducer — see
 * `ChartTimeSlider`. The strip is drawn only when the data also has stops to step
 * through; that half is `relationsChartModule.getTimeline`.
 */
export function resolveRelationsTimeSlider(options: PanelOptions): boolean {
  return options.relationsTimeSlider ?? RELATIONS_TIME_SLIDER_DEFAULT;
}

/**
 * How far each playback step moves, as a **percentage of the timeline**: 1% is the
 * finest walk and 100% jumps end to end.
 *
 * A percentage rather than a count of stops, because the count is not the user's to know
 * — the stops are whatever the response happens to carry, and the same dashboard panel
 * holds five of them over an hour and three hundred over a week. A percentage means the
 * same setting reads the same way on both: "cross the window in twenty steps".
 *
 * 1% is the default and preserves the original behaviour exactly wherever it can — see
 * {@link stopsPerStep}, which floors the result at one stop, so any timeline of a hundred
 * stops or fewer still advances one at a time.
 */
export const RELATIONS_TIME_STEP_SIZE_DEFAULT = 1;

/** The percentage bounds the editor's slider offers, and the range this clamps into. */
const STEP_SIZE_MIN = 1;
const STEP_SIZE_MAX = 100;

/** Milliseconds per playback step. See {@link RELATIONS_TIME_STEP_DURATION_DEFAULT}. */
export function resolveRelationsTimeStepDuration(options: PanelOptions): number {
  const duration = options.relationsTimeStepDuration;
  // A zero or negative interval would spin the timer as fast as the host allows.
  return duration != null && duration > 0 ? duration : RELATIONS_TIME_STEP_DURATION_DEFAULT;
}

/** How far each playback step moves, in percent. See {@link RELATIONS_TIME_STEP_SIZE_DEFAULT}. */
export function resolveRelationsTimeStepSize(options: PanelOptions): number {
  const size = options.relationsTimeStepSize;
  if (size == null || !Number.isFinite(size)) {
    return RELATIONS_TIME_STEP_SIZE_DEFAULT;
  }
  // Clamped rather than trusted: the slider cannot produce an out-of-range value, but a
  // hand-edited dashboard JSON can, and 0 would leave playback running without advancing.
  return Math.min(STEP_SIZE_MAX, Math.max(STEP_SIZE_MIN, size));
}

/**
 * That percentage as a number of **stops**, against a timeline of `length`.
 *
 * Floored at one stop, which is what makes the 1% default a no-op on everything but a
 * dense response: 1% of anything up to a hundred stops rounds to less than one, and a
 * step of zero would leave playback running in place. Rounded rather than truncated so
 * the setting is symmetric — 50% of ten stops is five, not four.
 */
export function stopsPerStep(length: number, percent: number): number {
  return Math.max(1, Math.round((length * percent) / 100));
}
