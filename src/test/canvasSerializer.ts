import { type CanvasRenderingContext2DEvent } from 'jest-canvas-mock';
import { type NewPlugin } from 'pretty-format';

/**
 * A compact snapshot format for recorded canvas draw calls: one JSON object per line.
 *
 * `pretty-format` spends ~10 lines on each draw call, most of it punctuation. One line
 * per event keeps every asserted number and makes a canvas diff readable as a diff: a
 * label that moved is a one-line change.
 *
 * **The format must be valid JSON.** `toMatchCanvasSnapshot` feeds the stored snapshot
 * back through its own `parseSnapshotJson` to build the "expected" half of the compare
 * viewer's visual diff. A prose format (`fillText "Gateway" @ 0,6`) would be shorter and
 * would cost the reviewer that half silently — the matcher logs `failed to parse expected
 * snapshot JSON` and returns. So: one JSON object per line, inside a JSON array.
 *
 * ```
 * [
 * {"type":"fillStyle","props":{"value":"#73bf69"}},
 * {"type":"fillText","props":{"text":"Gateway","x":0,"y":6,"maxWidth":null}}
 * ]
 * ```
 *
 * Key order comes straight from `JSON.stringify`: every event is built by one factory
 * (`createCanvasEvent(type, transform, props)`) and every `props` by a literal at the
 * mocked method's call site, so insertion order is fixed by the mock's source rather than
 * by the drawing.
 *
 * https://github.com/grafana/jest-canvas-mock-compare (matcher and viewer)
 * https://github.com/hustcc/jest-canvas-mock/blob/master/src/mock/createCanvasEvent.ts
 */

/**
 * A draw call as it reaches the snapshot: `removeCanvasTransforms` has already dropped
 * the `transform` matrix every event carries while it is being recorded.
 */
export type SnapshotCanvasEvent = Omit<CanvasRenderingContext2DEvent, 'transform'>;

/** A recorded draw call: `{ type: 'fillText', props: { … } }`. */
const isCanvasEvent = (value: unknown): value is SnapshotCanvasEvent => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const { type, props } = value as Record<string, unknown>;
  return typeof type === 'string' && typeof props === 'object' && props !== null;
};

/**
 * The value `toMatchCanvasSnapshot` is given: a non-empty array of draw calls. `[]` is
 * left to the default printer — it prints the same either way, and the emptier the
 * predicate the more unrelated snapshots it could claim by accident.
 */
export const isCanvasEventList = (value: unknown): value is SnapshotCanvasEvent[] =>
  Array.isArray(value) && value.length > 0 && value.every(isCanvasEvent);

/** One line per event, flush left, wrapped in the array brackets. */
export const serializeCanvasEvents = (events: readonly SnapshotCanvasEvent[]): string =>
  `[\n${events.map((event) => JSON.stringify(event)).join(',\n')}\n]`;

/**
 * Registered globally in `jest-setup.js`, so it reaches the stored `.snap` format for
 * every canvas suite. Written for the top-level array the matcher is called with: a list
 * nested inside a larger snapshotted object would be compacted too, ignoring the
 * parent's indentation. Nothing does that today.
 */
export const canvasEventSerializer: NewPlugin = {
  test: isCanvasEventList,
  serialize: (events: SnapshotCanvasEvent[]) => serializeCanvasEvents(events),
};
