import { type DataFrame, DataFrameType, type Field, FieldType } from '@grafana/data';
import { resolveGraphWideRoles } from 'lib/echarts/relations/converters/frameRoles';
import { numberAt } from 'lib/echarts/relations/converters/toGraphWide';

/** Return the time field for a ranged response. */
function rowDimension(frame: DataFrame): Field | undefined {
  return frame.fields.find((field) => field.type === FieldType.time);
}

/**
 * The data-plane kinds that declare no row dimension: numbers, one per series, with no time axis.
 * https://grafana.com/developers/dataplane/numeric
 */
const NUMERIC_FRAME_TYPES: ReadonlySet<string> = new Set([
  DataFrameType.NumericWide,
  DataFrameType.NumericMulti,
  DataFrameType.NumericLong,
]);

/** Check whether a frame has no time selection. */
export function isTimelessFrame(frame: DataFrame): boolean {
  const type = frame.meta?.type;
  return rowDimension(frame) == null || (type != null && NUMERIC_FRAME_TYPES.has(type));
}

/** Every timestamp this response carries, ascending and deduped. */
export function graphWideTimeline(frames: DataFrame[]): number[] {
  return [...collectStops(frames)].sort((first, second) => first - second);
}

/** The distinct timestamps every role frame carries, stopping as soon as `limit` of them are known. */
function collectStops(frames: DataFrame[], limit = Infinity): Set<number> {
  const stops = new Set<number>();
  const roles = frames.length > 0 ? resolveGraphWideRoles(frames) : null;
  if (roles == null) {
    return stops;
  }
  for (const frame of [...roles.edgesFrames, ...roles.nodesFrames]) {
    // Ignore timestamps on instant data because they are not timeline stops.
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

/** Check whether a response has a usable timeline. */
export function hasGraphTimeline(frames: DataFrame[] | undefined): boolean {
  return frames != null && collectStops(frames, 2).size > 1;
}

/** The row this frame carries `at` on, or `null` when it has no sample there. */
export function rowAt(frame: DataFrame, at: number): number | null {
  const time = rowDimension(frame);
  for (let row = 0; row < (time?.values.length ?? 0); row++) {
    if (numberAt(time, row) === at) {
      return row;
    }
  }
  return null;
}
