import { type DataFrame, DataFrameType, type Field, FieldType } from '@grafana/data';
import { resolveGraphWideRoles } from 'lib/echarts/relations/converters/frameRoles';
import { numberAt } from 'lib/echarts/relations/converters/toGraphWide';

/**
 * The **row dimension**: the axis a frame's rows run along, the timestamps a response
 * offers to read its marks at, and the row lookup for one of them.
 *
 * Only the time-slider reading needs this — reducing collapses the row dimension away.
 * Kept out of `markRead.ts` because the editor and the chart module ask whether stops
 * *exist* without reading any mark.
 */

/** The row dimension of a frame — the time column a ranged response carries. */
function rowDimension(frame: DataFrame): Field | undefined {
  return frame.fields.find((field) => field.type === FieldType.time);
}

/**
 * The data-plane kinds that declare **no row dimension**: numbers, one per series, with no
 * time axis. https://grafana.com/developers/dataplane/numeric
 */
const NUMERIC_FRAME_TYPES: ReadonlySet<string> = new Set([
  DataFrameType.NumericWide,
  DataFrameType.NumericMulti,
  DataFrameType.NumericLong,
]);

/**
 * Does this frame have **nothing to select by time** — one reading, true for the whole
 * range?
 *
 * Not the same question as "has a time field", and that is the trap. A Prometheus *instant*
 * query answers `numeric-multi` and still ships a `Time` column: one row, stamped with the
 * **evaluation instant**. That instant is `now`, so it lands nowhere near the step grid a
 * ranged query returns — which made a mixed response (ranged edges beside an instant nodes
 * query, exactly how a service graph carries per-node error ratios) lose every node the
 * moment the time slider was switched on. `rowAt` matched no row, every node read `null`,
 * and a `null` node is not just a missing tooltip row: a by-value scheme has no value to
 * grade, so `colorOf` returns nothing and `fillPaletteColors` hands the node a palette slot
 * instead — the reported symptom was "thresholds stop working under the slider".
 *
 * So the *declared kind* decides, not the columns. A numeric frame's time column is a
 * timestamp **about** the reading rather than an axis through it, and the reading is the
 * same at every stop.
 *
 * Shape alone cannot answer this. "One row" is the tempting test and it is wrong: a raw
 * ragged response is N frames of one sample each, and there a missing sample at the selected
 * stop really is `null` — no carry-forward, which is what keeps a scrubbed edge honest. The
 * kind is what separates "one sample of a series" from "one number for the range".
 *
 * A frame whose datasource declares nothing keeps the old reading, so nothing regresses on
 * a response this cannot classify.
 */
export function isTimelessFrame(frame: DataFrame): boolean {
  const type = frame.meta?.type;
  return rowDimension(frame) == null || (type != null && NUMERIC_FRAME_TYPES.has(type));
}

/**
 * Every timestamp this response carries, ascending and deduped — the stops a time slider
 * can select. **Empty on instant data**, which is what hides the control there.
 *
 * A union across every role frame rather than one frame's column, for the same reason
 * `longToWide.ts:joinedRows` unions before pivoting: a series with a gap is shorter than its
 * siblings, and the raw shape shares no row grid at all, so no single column is the
 * timeline. Kept separate from that one — the pivot runs above the panel, on frames this
 * reader may never be handed.
 */
export function graphWideTimeline(frames: DataFrame[]): number[] {
  return [...collectStops(frames)].sort((first, second) => first - second);
}

/**
 * The distinct timestamps every role frame carries, **stopping as soon as `limit` of them
 * are known**.
 *
 * The limit is what lets {@link hasGraphTimeline} answer a yes/no question without walking
 * a ranged response end to end: it runs from an editor `showIf`, which is re-evaluated on
 * every keystroke in the options pane, where {@link graphWideTimeline} runs once per render
 * behind a memo.
 */
function collectStops(frames: DataFrame[], limit = Infinity): Set<number> {
  const stops = new Set<number>();
  const roles = frames.length > 0 ? resolveGraphWideRoles(frames) : null;
  if (roles == null) {
    return stops;
  }
  for (const frame of [...roles.edgesFrames, ...roles.nodesFrames]) {
    // A timeless frame contributes nothing to scrub *through*, however its datasource
    // stamped it. An instant Prometheus query ships one row stamped `now`, which would
    // otherwise become a stop of its own — one sitting off the ranged frames' step grid,
    // where every edge reads null and the graph goes weightless. Two instant queries with
    // different evaluation instants would even raise a slider on a response that has no
    // timeline at all, which is the opposite of what this function promises above.
    const time = isTimelessFrame(frame) ? undefined : rowDimension(frame);
    for (let row = 0; row < (time?.values.length ?? 0); row++) {
      const at = numberAt(time, row);
      if (at != null) {
        stops.add(at);
        if (stops.size >= limit) {
          return stops;
        }
      }
    }
  }
  return stops;
}

/**
 * Whether this response has **somewhere to scrub to** — a row dimension carrying more than
 * one distinct timestamp. Drives the "Time slider" control's visibility.
 *
 * Answers `false` when it cannot tell. Unlike {@link hasNoNodeStats}, where `false` keeps
 * its control, the cautious answer here would show the switch on every instant panel, where
 * turning it on hides the reducer picker and produces nothing but an advisory. Hiding is
 * safe because the control's `showIf` keeps a switch that is *already on* visible.
 */
export function hasGraphTimeline(frames: DataFrame[] | undefined): boolean {
  return frames != null && collectStops(frames, 2).size > 1;
}

/**
 * The row this frame carries `at` on, or `null` when it has no sample there.
 *
 * Resolved per frame, which is the only correct resolution for a ragged response: row 4
 * of a 57-row series and row 4 of a one-row series are not the same instant. A shared row
 * index would silently read one mark at another mark's timestamp.
 */
export function rowAt(frame: DataFrame, at: number): number | null {
  const time = rowDimension(frame);
  for (let row = 0; row < (time?.values.length ?? 0); row++) {
    if (numberAt(time, row) === at) {
      return row;
    }
  }
  return null;
}
