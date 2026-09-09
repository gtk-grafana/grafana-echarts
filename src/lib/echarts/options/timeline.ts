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

/** Milliseconds per playback step. See {@link RELATIONS_TIME_STEP_DURATION_DEFAULT}. */
export function resolveRelationsTimeStepDuration(options: PanelOptions): number {
  const duration = options.relationsTimeStepDuration;
  // A zero or negative interval would spin the timer as fast as the host allows.
  return duration != null && duration > 0 ? duration : RELATIONS_TIME_STEP_DURATION_DEFAULT;
}
