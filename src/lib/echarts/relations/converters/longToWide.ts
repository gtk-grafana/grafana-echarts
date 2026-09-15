// Root specifier deliberately: `rxjs` is an exact-string webpack external
// (`.config/bundler/externals.ts`), so `rxjs/operators` would be bundled instead of
// taken from the host.
import {
  type CustomTransformOperator,
  type DataFrame,
  type Field,
  FieldType,
  formatLabels,
  type Labels,
  TIME_SERIES_TIME_FIELD_NAME,
} from '@grafana/data';
import { debug, LOG_LEVELS } from 'development';

import {
  contestedIds,
  edgeId,
  edgeLabels,
  edgesWideFrame,
  numberAt,
  uniqueId,
  withEndpointLabelsMeta,
  withoutEndpoints,
} from 'lib/echarts/relations/converters/toGraphWide';
import { type RelationsFamilyField } from 'lib/grafana/fields/relationsFields';
import { map } from 'rxjs';

import {
  aliasEndpointKeys,
  endpointLabelKeysOf,
  endpointLabelsOf,
  endpointsFromName,
  GRAPH_EDGES_WIDE,
  GRAPH_NODES_WIDE,
  type GraphEndpointKeys,
  type GraphEndpoints,
  isCanonicalEndpointKeys,
} from 'lib/echarts/relations/converters/contract';
import { isEdgesWideFrame } from 'lib/echarts/relations/converters/frameRoles';

/** Convert a long graph response. */

/** The row dimension of a long series. A datasource response always has one. */
function rowField(frame: DataFrame): Field | undefined {
  return frame.fields.find((field) => field.type === FieldType.time);
}

/** Return the numeric field of a long series. */
function seriesValueField(frame: DataFrame): Field | undefined {
  const numeric = frame.fields.filter((field) => field.type === FieldType.number);
  return numeric.length === 1 ? numeric[0] : undefined;
}

/** True when a frame is one edge of a long graph response. */
export function isLongEdgesFrame(frame: DataFrame): boolean {
  if (frame.meta?.type === GRAPH_EDGES_WIDE || frame.meta?.type === GRAPH_NODES_WIDE) {
    return false;
  }
  if (!rowField(frame)) {
    return false;
  }
  const value = seriesValueField(frame);
  if (!value || endpointsFromName(value.name, value.labels) != null) {
    return false;
  }
  return endpointLabelsOf(value) != null || wireEndpoints(frame, value) != null;
}

/** The long edge series in a response. */
function longEdgeSeries(frames: DataFrame[]): DataFrame[] {
  const claimed = new Set(frames.filter(isLongEdgesFrame));
  if (claimed.size === 0) {
    return [];
  }
  return frames.some((frame) => !claimed.has(frame) && isEdgesWideFrame(frame)) ? [] : [...claimed];
}

/** True when these frames are a long graph response in need of the pivot. */
export function isLongGraphFrames(frames: DataFrame[]): boolean {
  return longEdgeSeries(frames).length > 0;
}

/** The id the wire already gave a series, if it gave one. */
function wireId(frame: DataFrame, value: Field): string | undefined {
  const fromDS = value.config.displayNameFromDS;
  if (fromDS != null && fromDS !== '') {
    return fromDS;
  }
  const name = frame.name;
  return name != null && name !== '' && name !== formatLabels(value.labels ?? {}) ? name : undefined;
}

/** The endpoints a series' wire id carries, when it is an edge id rather than a name. */
function wireEndpoints(frame: DataFrame, value: Field): GraphEndpoints | undefined {
  const id = wireId(frame, value);
  return id != null ? endpointsFromName(id, value.labels) : undefined;
}

/** The joined row dimension: every timestamp any series carries, ascending. */
function joinedRows(series: DataFrame[]): number[] {
  const rows = new Set<number>();
  for (const frame of series) {
    const time = rowField(frame);
    for (let row = 0; row < (time?.values.length ?? 0); row++) {
      const at = numberAt(time, row);
      if (at != null) {
        rows.add(at);
      }
    }
  }
  return [...rows].sort((first, second) => first - second);
}

/** A series' values on the joined rows. */
function valuesOnRows(rows: number[], time: Field, value: Field): Array<number | null> {
  const byRow = new Map<number, number | null>();
  for (let row = 0; row < time.values.length; row++) {
    const at = numberAt(time, row);
    if (at != null) {
      byRow.set(at, numberAt(value, row));
    }
  }
  return rows.map((at) => byRow.get(at) ?? null);
}

/** One series' contribution to the pivot, before its id is settled. */
interface Mark {
  time: Field;
  value: Field;
  endpoints: GraphEndpoints;
  /** Label keys that supplied the endpoints. */
  keys?: GraphEndpointKeys;
  /** The keys the endpoints' *values* are also under, recovered by value. */
  alias?: GraphEndpointKeys;
  /** Labels that distinguish parallel edges. */
  rest: Labels;
  /** The id it wants, before contested ones are told apart. */
  base: string;
}

function marksOf(series: DataFrame[]): Mark[] {
  const marks: Mark[] = [];
  for (const frame of series) {
    const time = rowField(frame);
    const value = seriesValueField(frame);
    const keys = value ? endpointLabelKeysOf(value) : undefined;
    // Prefer label endpoints over wire-id endpoints.
    const endpoints: GraphEndpoints | undefined =
      (value && endpointLabelsOf(value)) ?? (value && wireEndpoints(frame, value)) ?? undefined;
    // `isLongEdgesFrame` guarantees these values.
    if (!time || !value || !endpoints) {
      continue;
    }
    marks.push({
      time,
      value,
      endpoints,
      ...(keys ? { keys } : {}),
      // Record aliases before the pivot writes canonical endpoint keys.
      ...pickAlias(aliasEndpointKeys(value, endpoints, keys)),
      // The pair this series actually used, so a `client`/`server` response does not put
      // its whole topology into the parallel-edge discriminator.
      rest: withoutEndpoints(value.labels, keys),
      base: wireId(frame, value) ?? edgeId(endpoints.source, endpoints.target),
    });
  }
  return marks;
}

/** `exactOptionalPropertyTypes` is on, so an absent alias is an absent key. */
function pickAlias(alias: GraphEndpointKeys | undefined): { alias?: GraphEndpointKeys } {
  return alias ? { alias } : {};
}

/** Return shared non-canonical endpoint keys. */
function commonEndpointKeys(marks: Mark[]): GraphEndpointKeys | undefined {
  return commonPair(marks.map((mark) => mark.keys)) ?? commonPair(marks.map((mark) => mark.alias));
}

/** One pair, when every mark agrees on it and it is worth declaring. */
function commonPair(pairs: Array<GraphEndpointKeys | undefined>): GraphEndpointKeys | undefined {
  const [first] = pairs;
  if (!first || isCanonicalEndpointKeys(first)) {
    return undefined;
  }
  return pairs.every((pair) => pair?.source === first.source && pair?.target === first.target) ? first : undefined;
}

/** The name a datasource gives a value column, where no id is implied. */
const VALUE_FIELD_NAME = 'Value';

/** `Value`, and `Value #A` when a panel runs several queries. */
function isGenericValueName(name: string): boolean {
  return name === VALUE_FIELD_NAME || name.startsWith(`${VALUE_FIELD_NAME} #`);
}

/** Warn when the pivot renames the only mark in the response. */
function warnIfWideLookalike(marks: Mark[], ids: string[]): void {
  if (marks.length !== 1) {
    return;
  }
  const [{ value }] = marks;
  const [id] = ids;
  if (id === value.name || isGenericValueName(value.name)) {
    return;
  }
  debug(
    `Note: relations pivoted a single labelled series and renamed its edge "${value.name}" to "${id}". ` +
      'If that frame was already `graph-edges-wide`, declare `meta.type` on it — or name the edge ' +
      '`source-->target` — so the conversion leaves it alone; a `byName` override on the old name ' +
      'no longer matches.',
    LOG_LEVELS.warn,
    { from: value.name, to: id, labels: value.labels }
  );
}

/** One numeric field per series, on a shared row dimension. */
function pivot(series: DataFrame[]): DataFrame {
  const rows = joinedRows(series);
  const first = series[0];
  // Keep the time-field name, but discard stale display configuration.
  const fields: RelationsFamilyField[] = [
    {
      name: rowField(first)?.name ?? TIME_SERIES_TIME_FIELD_NAME,
      type: FieldType.time,
      config: {},
      values: rows,
    },
  ];

  const marks = marksOf(series);
  const contested = contestedIds(marks.map((mark) => mark.base));
  const taken = new Set<string>();
  const ids: string[] = [];
  for (const mark of marks) {
    const id = uniqueId(taken, mark.base, mark.rest, contested.has(mark.base));
    taken.add(id);
    ids.push(id);
    fields.push({
      name: id,
      type: FieldType.number,
      labels: edgeLabels(mark.rest, mark.endpoints),
      // Keep all field configuration for formatting, links, and overrides.
      config: { ...mark.value.config },
      values: valuesOnRows(rows, mark.time, mark.value),
    });
  }

  warnIfWideLookalike(marks, ids);
  debug(
    `Note: relations pivoted ${marks.length} long graph series into one graph-edges-wide frame ` +
      `over ${rows.length} row(s). Without it the reader would still draw every edge, but they would ` +
      'share one field name and no per-edge override could address them.',
    LOG_LEVELS.info,
    { edges: ids, rows: rows.length, refId: first.refId }
  );

  // Preserve query metadata and record endpoint aliases before writing canonical labels.
  return edgesWideFrame(
    { refId: first.refId, meta: withEndpointLabelsMeta(first.meta, commonEndpointKeys(marks)) },
    fields
  );
}

/** Pivot a long graph response into one wide edges frame. */
export function longToWide(frames: DataFrame[]): DataFrame[] {
  const series = longEdgeSeries(frames);
  if (series.length === 0) {
    return frames;
  }

  const pivoted = pivot(series);
  const claimed = new Set(series);
  return frames.flatMap((frame) => {
    if (!claimed.has(frame)) {
      return [frame];
    }
    return frame === series[0] ? [pivoted] : [];
  });
}

/** `longToWide` as a transformation the host can run above the panel. */
export const longToWideOperator: CustomTransformOperator = () => (source) => source.pipe(map(longToWide));
