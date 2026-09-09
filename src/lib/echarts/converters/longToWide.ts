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
  endpointLabelKeysOf,
  endpointLabelsOf,
  endpointsFromName,
  GRAPH_EDGES_WIDE,
  GRAPH_NODES_WIDE,
  type GraphEndpointKeys,
  type GraphEndpoints,
  isCanonicalEndpointKeys,
  isEdgesWideFrame,
} from 'lib/echarts/converters/graphWide';
import {
  contestedIds,
  edgeId,
  edgeLabels,
  edgesWideFrame,
  numberAt,
  uniqueId,
  withEndpointLabelsMeta,
  withoutEndpoints,
} from 'lib/echarts/converters/toGraphWide';
import { type RelationsFamilyField } from 'lib/grafana/fields/fieldTypes';
import { map } from 'rxjs';

/**
 * Convert a **long** graph response — one series per frame, endpoints in `field.labels` —
 * into the single wide edges frame the panel reads.
 *
 * This is the shape every labelled datasource returns. `sum by (source, target) (…)` in
 * `Format: Time series` is N frames of `[Time, Value]`, each `Value` carrying the grouping
 * labels; Loki's metric queries are byte-identical, and TestData's `predictable_csv_wave`
 * reproduces it. Sibling of `legacyToWide.ts`, registered in the same prefix
 * (`modules/relations/dataTransformations.ts`) and sharing its construction
 * (`toGraphWide.ts`) so both emit the same shape.
 *
 * **Why it has to exist: identity.** The response draws without it — the reader collects
 * every frame that looks like edges (`findEdgesFrames`, `graphWide.ts`), so twelve series
 * render twelve edges on a stock host with no transformation at all. What they do *not*
 * have is names. Each frame's value field is called `Value`, so the twelve marks share one
 * id: `byName: 'Value'` matches all of them at once, the override picker lists `Value` once
 * per frame, and a per-edge unit, colour or data link is unreachable. Only a transformation
 * running **before** `applyFieldOverrides` can create a field for an override to land on,
 * which is the whole thesis of the pivot.
 *
 * Nothing in core composes to do it either: `joinByField` renames a `Value` field to its
 * **frame name**, which TestData sets and a real Prometheus range query does not, so the
 * join silently produces a wide frame whose fields are all still called `Value` (measured
 * against live Mimir; ../../../../data-plane/graph-wide.md).
 *
 * **The row dimension is kept.** A range query pivots to one frame with many rows and
 * `calcs[0]` reduces it, so `mean` / `max` over the window are available and the default
 * `lastNotNull` means "now" — none of which survives the instant-query detour the docs
 * recommend today.
 *
 * **Edges only, for now.** A node-stat query (`sum by (server) (…)`) is long as well, but
 * one endpoint label is not a pair, so pivoting it is a different conversion and this
 * claims none of it — a node frame still needs `rowsToFields`. Nodes an edge refers to
 * appear either way (`deriveNodesFromLinks`); they just carry no stat of their own.
 *
 * **The endpoint keys are the contract's own**, `source` / `target`. A conventional-pair
 * list (`client`/`server`, `src`/`dst`) is the next step and belongs here, in one place:
 * the supplier's context is `{ series }` only, so no panel option can reach this far —
 * see ../../../../todo/graph-wide-migration.md.
 *
 * Deliberately theme-free and synchronous, like its sibling: it runs inside the host's rx
 * pipeline, where no theme is in scope and `field.display` does not exist yet.
 */

/** The row dimension of a long series. A datasource response always has one. */
function rowField(frame: DataFrame): Field | undefined {
  return frame.fields.find((field) => field.type === FieldType.time);
}

/**
 * The one numeric field of a long series — `Value`, for every datasource that emits this
 * shape.
 *
 * "Exactly one" is what separates *long* from *wide*: a frame with several numeric fields
 * is already one mark per field, which is the contract, and re-pivoting it would rename
 * marks that already have ids.
 */
function seriesValueField(frame: DataFrame): Field | undefined {
  const numeric = frame.fields.filter((field) => field.type === FieldType.number);
  return numeric.length === 1 ? numeric[0] : undefined;
}

/**
 * True when a frame is one edge of a long graph response.
 *
 * Every clause is an exclusion earned by a shape that would otherwise be damaged:
 *
 * - a **declared** wide kind is authoritative in both directions, exactly as in the
 *   reader — a frame that says what it is never gets guessed at;
 * - **no row dimension** means a static table, not a datasource series: that is the
 *   `csv_content` / SQL / `rowsToFields` route, whose frames are already wide;
 * - **several numeric fields** means already one mark per field (see above);
 * - a value field whose **name already splits on the separator** is already an edge id —
 *   the contract's fallback carrier — so the frame is wide with one edge, not long.
 */
export function isLongEdgesFrame(frame: DataFrame): boolean {
  if (frame.meta?.type === GRAPH_EDGES_WIDE || frame.meta?.type === GRAPH_NODES_WIDE) {
    return false;
  }
  if (!rowField(frame)) {
    return false;
  }
  const value = seriesValueField(frame);
  if (!value || !endpointLabelsOf(value)) {
    return false;
  }
  return endpointsFromName(value.name) == null;
}

/**
 * The long edge series in a response — or none, when something else is already its edges
 * frame.
 *
 * That second half is what keeps exactly one converter in play. A declared
 * `graph-edges-wide` frame, or a shape-wide one with several edge fields, *is* the edges
 * frame; a labelled series alongside it is a second query, and pivoting it would mint a
 * **rival** edges frame — a second set of ids over the same topology, minted by this
 * converter rather than carried by the response.
 *
 * The reader makes the same call from the other side: `findEdgesFrames` collects declared
 * frames as a *filter*, so a declared frame beside raw series renders exactly what it
 * renders today. Where nothing declares itself the reader now collects the shape-matched
 * frames *and* the series that this declined, which is more data, not less.
 */
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

/**
 * The id the wire already gave a series, if it gave one.
 *
 * Two carriers, in the reader's own precedence order. `config.displayNameFromDS` is where
 * a rendered legend format lands (Prometheus, Loki). `frame.name` is where a TestData
 * `alias` lands — and is also precisely what `joinByField` renamed a `Value` field to, so
 * a dashboard that used the documented join keeps its ids, and its `byName` overrides keep
 * matching, when this runs instead of it.
 *
 * With **no** legend format Prometheus sets the frame name to the series' own label set,
 * `{client="a", server="b"}`, which is no id anybody would write an override against — and
 * which `getFieldDisplayName` then renders twice. Recognising it costs one comparison and
 * is exact: `formatLabels` builds the same sorted `k="v"` join. Rejecting it here is what
 * lets a plain query with no legend format come out with readable edge ids.
 */
function wireId(frame: DataFrame, value: Field): string | undefined {
  const fromDS = value.config.displayNameFromDS;
  if (fromDS != null && fromDS !== '') {
    return fromDS;
  }
  const name = frame.name;
  return name != null && name !== '' && name !== formatLabels(value.labels ?? {}) ? name : undefined;
}

/**
 * The joined row dimension: every timestamp any series carries, ascending.
 *
 * A union rather than the first frame's column. Prometheus aligns a range query to one
 * step grid, but a series with a gap has fewer points than its siblings, and a response
 * can mix an instant query with a ranged one — so index-aligning the columns would put a
 * mark's values on rows that belong to another mark.
 */
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

/**
 * A series' values on the joined rows.
 *
 * `null` where the series has no sample at that timestamp: an absent scrape is not a zero,
 * and every reducer `calcs[0]` can be set to skips nulls rather than averaging them in.
 * The map is keyed by timestamp rather than by row, so a series whose own column is a
 * subset of the union still lands on its own rows.
 */
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
  /** Which label pair the endpoints were read from. See `ENDPOINT_LABEL_PAIRS`. */
  keys: GraphEndpointKeys;
  /** Every label except the endpoints — the discriminator for parallel edges. */
  rest: Labels;
  /** The id it wants, before contested ones are told apart. */
  base: string;
}

function marksOf(series: DataFrame[]): Mark[] {
  const marks: Mark[] = [];
  for (const frame of series) {
    const time = rowField(frame);
    const value = seriesValueField(frame);
    const keys = value && endpointLabelKeysOf(value);
    const endpoints: GraphEndpoints | undefined = value && endpointLabelsOf(value);
    // All four are guaranteed by `isLongEdgesFrame`; this keeps the reads honest.
    if (!time || !value || !keys || !endpoints) {
      continue;
    }
    marks.push({
      time,
      value,
      endpoints,
      keys,
      // The pair this series actually used, so a `client`/`server` response does not put
      // its whole topology into the parallel-edge discriminator.
      rest: withoutEndpoints(value.labels, keys),
      base: wireId(frame, value) ?? edgeId(endpoints.source, endpoints.target),
    });
  }
  return marks;
}

/**
 * The endpoint labels to record on the pivoted frame: the non-canonical pair the series
 * were labelled with, when they agree on one.
 *
 * A response mixing pairs (one query grouped by `client`/`server`, another by
 * `source`/`target`) has no single answer, so it records none and the panel falls back to
 * the contract's keys — the same place it was before. Recording one of two would be worse
 * than recording neither: the tooltip would write a key that is right for half the edges.
 */
function commonEndpointKeys(marks: Mark[]): GraphEndpointKeys | undefined {
  const [first] = marks;
  if (!first || isCanonicalEndpointKeys(first.keys)) {
    return undefined;
  }
  return marks.every((mark) => mark.keys.source === first.keys.source && mark.keys.target === first.keys.target)
    ? first.keys
    : undefined;
}

/**
 * The name a datasource gives a value column, where no id is implied. Written out rather
 * than imported: `TIME_SERIES_VALUE_FIELD_NAME` is deprecated in `@grafana/data` 13.1.1,
 * and the convention it names is still exactly what Prometheus, Loki and TestData emit.
 */
const VALUE_FIELD_NAME = 'Value';

/** `Value`, and `Value #A` when a panel runs several queries. */
function isGenericValueName(name: string): boolean {
  return name === VALUE_FIELD_NAME || name.startsWith(`${VALUE_FIELD_NAME} #`);
}

/**
 * Warn when the pivot renames the only mark in the response.
 *
 * This is the conversion's one genuine ambiguity, and it is inherent rather than a gap in
 * the predicate: **"one long series" and "one single-edge wide frame with a row dimension"
 * are the same frame shape.** Nothing in the data separates them, so a wide frame that
 * declares no `meta.type` and does not name its edge with the separator is claimed here and
 * its id replaced. Topology and values survive either way — what breaks is a `byName`
 * override written against the old id, which is exactly the kind of silent breakage this
 * contract keeps producing.
 *
 * A warning rather than an error, because for a genuine single-series query the conversion
 * is correct; and it stays quiet when the old name is a datasource's value column, where
 * there was no id to lose.
 */
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
  // The row dimension keeps its name (`Time`, for every datasource that emits this shape)
  // and nothing else: the reader looks only at numeric fields, so config here is dead
  // weight, and a stale display processor would be worse than none.
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
      // Config is carried whole — unit, decimals, colour, thresholds, mappings, links,
      // `custom.*`. Dropping it is the concrete thing core's `joinByLabels` gets wrong,
      // and per-mark formatting is most of what the wide contract buys.
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

  // `refId` and `meta` describe the query, which every series shares, so they carry over.
  // The frame **name** does not: one series' legend is not the name of a frame holding all
  // of them, and `joinDataFrames` drops it for the same reason (verified — it returns
  // `{length, fields}`, with the carry-over commented out in core).
  //
  // The endpoint labels ride along on `meta.custom`, because this is the step that destroys
  // them: every field above is written with the canonical pair, so nothing downstream could
  // otherwise tell `sum by (client, server)` from `sum by (source, target)`.
  return edgesWideFrame(
    { refId: first.refId, meta: withEndpointLabelsMeta(first.meta, commonEndpointKeys(marks)) },
    fields
  );
}

/**
 * Pivot a long graph response into one wide edges frame.
 *
 * The pivoted frame takes the first claimed frame's place, so a mixed response keeps its
 * order; frames this does not own are returned **by reference**, and when nothing is
 * claimed the input array itself is. Both matter: a custom transform operator bypasses
 * `config.filter`, so it sees every frame in the response and must leave the rest
 * identity-intact, which is what lets the host skip re-running field overrides.
 */
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

/**
 * `longToWide` as a transformation the host can run above the panel.
 *
 * A `CustomTransformOperator` for the same two reasons as `legacyToWideOperator`: no
 * JSON-configured transformation can express this conversion (`joinByField` loses the ids,
 * and nothing in core writes `meta.type`), and a function cannot round-trip dashboard
 * JSON, so the entry is structurally non-persistable rather than only by convention.
 */
export const longToWideOperator: CustomTransformOperator = () => (source) => source.pipe(map(longToWide));
