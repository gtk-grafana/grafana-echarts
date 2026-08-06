// Root specifier deliberately: `rxjs` is an exact-string webpack external
import {
  type CustomTransformOperator,
  type DataFrame,
  type Field,
  FieldColorModeId,
  type FieldConfig,
  FieldType,
  type Labels,
} from '@grafana/data';
import type { EChartsRelationsFieldConfig } from 'editor/types';
import {
  EDGE_SEPARATOR,
  GRAPH_EDGES_WIDE,
  GRAPH_NODES_WIDE,
  GRAPH_TYPE_VERSION,
  isGraphWideFrames,
} from 'lib/echarts/converters/graphWide';
import {
  type RelationsFamilyField,
  type RelationsFamilyFrame,
  type RelationsFamilyValue,
} from 'lib/grafana/fields/fieldTypes';
import { type ConfigTypedField } from 'lib/grafana/types'; // (`.config/bundler/externals.ts`), so `rxjs/operators` would be bundled instead of
// taken from the host.
import { map } from 'rxjs';

/**
 * Convert Grafana's legacy row-based node-graph frames (`graph-*-long`) into the
 * field-based wide contract (`graph-*-wide`) — one node per field, one edge per
 * field.
 *
 * See ../../../../data-plane/graph-wide.md#complete-mapping-from-graph--long for the
 * mapping this implements. This is the **only** reader of the row format left in the
 * plugin: the panel itself reads the wide contract exclusively (`graphWide.ts`), so
 * the conversion has to happen *above* the panel to be useful at all. Registered as a
 * panel transformation (`setDataTransformations`, grafana/grafana#129992) it runs
 * before the override pass, and each node and edge becomes an ordinary override
 * target. On a host without that API nothing converts these frames and the panel
 * reports that it cannot read them — see `frameToRelationsGraph`.
 *
 * Deliberately theme-free and synchronous: it runs inside the host's rx pipeline,
 * where no theme is in scope and `field.display` does not exist yet.
 */

// Legacy field names, from Grafana's `NodeGraphDataFrameFieldNames`. All lowercase.
const ID_FIELD = 'id';
const SOURCE_FIELD = 'source';
const TARGET_FIELD = 'target';
const TITLE_FIELD = 'title';
const SUBTITLE_FIELD = 'subtitle';
const MAINSTAT_FIELD = 'mainstat';
const SECONDARYSTAT_FIELD = 'secondarystat';
const THICKNESS_FIELD = 'thickness';
const COLOR_FIELD = 'color';
const ICON_FIELD = 'icon';
const STROKEDASHARRAY_FIELD = 'strokedasharray';
const NODERADIUS_FIELD = 'noderadius';
const FIXEDX_FIELD = 'fixedx';
const FIXEDY_FIELD = 'fixedy';
const DETAIL_PREFIX = 'detail__';

/**
 * Case-insensitive field lookup — Grafana matches these names lowercased.
 * Doesn't need template types since this is still internal to the relations family
 * @todo potential performance enhancement to audit usages and prevent unnecessary iterations
 */

function findField<V, C>(frame: DataFrame, name: string): ConfigTypedField<V, C> | undefined {
  return frame.fields.find((field) => field.name.toLowerCase() === name);
}

const hasField = (frame: DataFrame, name: string): boolean => findField(frame, name) != null;

/**
 * True when a frame declares itself part of a node-graph response.
 *
 * Both signals are set by data sources that know what they are emitting — Tempo, X-Ray
 * and TestData's `node_graph` scenario all set the first (`nodeGraphUtils.ts`). They currently
 * say "this response is a node graph", **not** "this frame is the edges frame": a
 * declared response carries a nodes frame *and* an edges frame, so telling the two
 * apart is still a job for field shape.
 */
function declaresLegacyNodeGraph(frame: DataFrame): boolean {
  return (
    frame.meta?.preferredVisualisationType === 'nodeGraph' ||
    // Currently unused, proposed frame meta
    //@ts-expect-error @todo add legacy graph-edges-long, graph-node-long and proposed graph-nodes-wide, graph-edges-wide to core as alpha. @todo one frame or two?
    frame.meta?.type === 'graph-edges-long' ||
    //@ts-expect-error
    frame.meta?.type === 'graph-node-long'
  );
}

/**
 * A time dimension means a datasource response, not a static table of edges.
 *
 * That is the whole difference between `id,source,target,mainstat` from a CSV or a SQL
 * Expression — one row per edge, no time — and a Prometheus instant table that happens
 * to have `source` and `target` columns, which always carries `Time`. Without this
 * guard the conversion claims the Prometheus frame, widens it, and the user's own
 * transformation chain then finds none of the columns it filters for: the panel renders
 * "No data" and nothing is logged anywhere. Measured against a live Mimir.
 *
 * A frame that *declares* itself a node graph is trusted ahead of this heuristic, so a
 * datasource emitting the row format with a time column is unaffected.
 */
function hasTimeField(frame: DataFrame): boolean {
  return frame.fields.some((field) => field.type === FieldType.time);
}

/**
 * True when a frame is a legacy **edges** frame.
 *
 * Grafana's own role test is just "has a `source` field" (`applyOptionsToFrames`), but
 * that only runs after the user has already picked the node graph panel. Here the
 * predicate doubles as *detection*, so it requires `target` as well — and, for a frame
 * that declares nothing, the absence of a time field.
 *
 * `source` and `target` are required even when the frame declares itself a node graph.
 * The declaration is about the response, not the frame, and reading it as "these are
 * the edges" converted every declared *nodes* frame into an empty edges frame, silently
 * dropping every node's title, stat and colour.
 */
export function isLegacyEdgesFrame(frame: DataFrame): boolean {
  if (!hasField(frame, SOURCE_FIELD) || !hasField(frame, TARGET_FIELD)) {
    return false;
  }
  return declaresLegacyNodeGraph(frame) || !hasTimeField(frame);
}

/**
 * True when a frame is a legacy **nodes** frame: an `id` and no `source`/`target`.
 *
 * Deliberately stricter than Grafana, which treats any non-edges candidate frame as
 * nodes. Here the `id` field is required so an unrelated frame in a mixed response is
 * not silently read as a node list, and the same time-field rule applies — `id` is far
 * too common a column name to claim a datasource's own table on.
 */
export function isLegacyNodesFrame(frame: DataFrame): boolean {
  if (!hasField(frame, ID_FIELD) || isLegacyEdgesFrame(frame)) {
    return false;
  }
  return declaresLegacyNodeGraph(frame) || !hasTimeField(frame);
}

/**
 * True when these frames carry legacy row-based node-graph data.
 *
 * Role resolution is **field shape** — `source` and `target` are required on an edges
 * frame either way — and metadata only decides how much benefit of the doubt a frame
 * gets: a declared node graph skips the time-field guard, an undeclared one does not.
 * Shape has to stay load-bearing because metadata does not survive the paths that
 * matter: provisioned TestData `csv_content` fixtures cannot set frame metadata, and
 * SQL Expression outputs are named by `refId`.
 *
 * An edges frame is required: a lone nodes frame is a table, not a graph.
 */
export function isLegacyGraphFrames(frames: DataFrame[]): boolean {
  return frames.some(isLegacyEdgesFrame);
}

/**
 * Read a value as a display string without a theme.
 *
 * Nothing here can resolve through a display processor: this runs in the
 * transformation pipeline, before `applyFieldOverrides`, so `field.display` is not
 * attached yet and there is no theme to build one from. Numeric enum ids therefore
 * stringify as their index — acceptable because `id`/`source`/`target` are string
 * fields in every producer.
 */
function stringAt(field: Field | undefined, row: number): string | undefined {
  const raw: unknown = field?.values[row];
  if (raw == null || raw === '') {
    return undefined;
  }
  return typeof raw === 'string' ? raw : String(raw);
}

function numberAt(field: Field | undefined, row: number): number | null {
  const raw: unknown = field?.values[row];
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
}

/** A `color` column is only a colour when it holds an HTML colour string. */
function fixedColorAt(field: Field | undefined, row: number): string | undefined {
  const raw: unknown = field?.values[row];
  return typeof raw === 'string' && raw !== '' ? raw : undefined;
}

/**
 * `strokedasharray` -> `custom.lineType`, the same three-way approximation the
 * renderer already made: an SVG dash array has no ECharts equivalent, so only
 * "is it dashed, and how tightly" survives.
 */
function toLineType(dashArray: string | undefined): 'dashed' | 'dotted' | undefined {
  if (dashArray == null || dashArray.trim() === '') {
    return undefined;
  }
  const first = Number.parseFloat(dashArray);
  if (!Number.isFinite(first) || first <= 0) {
    return undefined;
  }
  return first <= 2 ? 'dotted' : 'dashed';
}

/** `detail__*` columns become labels, per the contract's endpoint/label carrier. */
function detailLabels(frame: DataFrame, row: number): Labels {
  const labels: Labels = {};
  for (const field of frame.fields) {
    const name = field.name.toLowerCase();
    if (!name.startsWith(DETAIL_PREFIX)) {
      continue;
    }
    const value = stringAt(field, row);
    if (value != null) {
      labels[field.name.slice(DETAIL_PREFIX.length)] = value;
    }
  }
  return labels;
}

/**
 * Carry the stat column's own formatting onto every mark.
 *
 * The long form has one `unit`/`decimals` for the whole column; the wide form is
 * per-mark, so the faithful conversion is to copy the column's config to each field
 * rather than drop it. A later per-mark override simply replaces it.
 */
function statConfig(statField: Field | undefined): FieldConfig<EChartsRelationsFieldConfig> {
  if (!statField) {
    return {};
  }
  const { unit, decimals, min, max, mappings, thresholds } = statField.config;
  return {
    ...(unit != null ? { unit } : {}),
    ...(decimals != null ? { decimals } : {}),
    ...(min != null ? { min } : {}),
    ...(max != null ? { max } : {}),
    ...(mappings != null ? { mappings } : {}),
    ...(thresholds != null ? { thresholds } : {}),
  };
}

/** One numeric field per edge row. */
function edgesToWide(frame: DataFrame): RelationsFamilyFrame {
  const idField = findField<number | string, EChartsRelationsFieldConfig>(frame, ID_FIELD);
  const sourceField = findField<number | string, EChartsRelationsFieldConfig>(frame, SOURCE_FIELD);
  const targetField = findField<number | string, EChartsRelationsFieldConfig>(frame, TARGET_FIELD);
  const mainstatField = findField<number | string, EChartsRelationsFieldConfig>(frame, MAINSTAT_FIELD);
  const thicknessField = findField<number | string, EChartsRelationsFieldConfig>(frame, THICKNESS_FIELD);
  const colorField = findField<number | string, EChartsRelationsFieldConfig>(frame, COLOR_FIELD);
  const dashField = findField<number | string, EChartsRelationsFieldConfig>(frame, STROKEDASHARRAY_FIELD);

  const base = statConfig(mainstatField);
  const fields: Field[] = [];

  for (let row = 0; row < frame.length; row++) {
    const source = stringAt(sourceField, row);
    const target = stringAt(targetField, row);
    // An edge missing either endpoint cannot be placed, exactly as in the long reader.
    if (source == null || target == null) {
      continue;
    }

    const thickness = numberAt(thicknessField, row);
    const lineType = toLineType(stringAt(dashField, row));
    const fixedColor = fixedColorAt(colorField, row);
    const custom: Record<string, unknown> = {};
    if (thickness != null) {
      custom.lineWidth = thickness;
    }
    if (lineType != null) {
      custom.lineType = lineType;
    }

    fields.push({
      // `id` becomes the override target, which the long form's `id` never was.
      name: stringAt(idField, row) ?? `${source}${EDGE_SEPARATOR}${target}`,
      type: FieldType.number,
      // Labels are the primary endpoint carrier: they survive node ids that
      // themselves contain the separator, which a name split cannot. Detail labels
      // are spread **first** so a `detail__source` column cannot silently move the
      // edge to a different node.
      labels: { ...detailLabels(frame, row), source, target },
      config: {
        ...base,
        ...(fixedColor != null ? { color: { mode: FieldColorModeId.Fixed, fixedColor } } : {}),
        ...(Object.keys(custom).length > 0 ? { custom } : {}),
      },
      // `thickness` stays in the weight chain (`mainstat` -> `thickness` -> 1) so a
      // legacy sankey whose ribbons were sized by `thickness` alone keeps its widths.
      // It is *also* mapped to `custom.lineWidth` above, which is its styling role.
      values: [numberAt(mainstatField, row) ?? thickness ?? 1],
    });
  }

  return {
    ...frame,
    fields,
    length: fields.length > 0 ? 1 : 0,
    meta: {
      ...frame.meta,
      type: GRAPH_EDGES_WIDE,
      typeVersion: GRAPH_TYPE_VERSION,
    },
  };
}

/** One numeric field per node row. */
function nodesToWide(frame: DataFrame): RelationsFamilyFrame {
  // @todo instead of iterating through the fields this many times, let's create a map of field names to field refs and make a single pass
  const idField = findField<RelationsFamilyValue, EChartsRelationsFieldConfig>(frame, ID_FIELD);
  const titleField = findField<RelationsFamilyValue, EChartsRelationsFieldConfig>(frame, TITLE_FIELD);
  const subtitleField = findField<RelationsFamilyValue, EChartsRelationsFieldConfig>(frame, SUBTITLE_FIELD);
  const mainstatField = findField<RelationsFamilyValue, EChartsRelationsFieldConfig>(frame, MAINSTAT_FIELD);
  const secondaryField = findField<RelationsFamilyValue, EChartsRelationsFieldConfig>(frame, SECONDARYSTAT_FIELD);
  const radiusField = findField<RelationsFamilyValue, EChartsRelationsFieldConfig>(frame, NODERADIUS_FIELD);
  const colorField = findField<RelationsFamilyValue, EChartsRelationsFieldConfig>(frame, COLOR_FIELD);
  const iconField = findField<RelationsFamilyValue, EChartsRelationsFieldConfig>(frame, ICON_FIELD);
  const fixedXField = findField<RelationsFamilyValue, EChartsRelationsFieldConfig>(frame, FIXEDX_FIELD);
  const fixedYField = findField<RelationsFamilyValue, EChartsRelationsFieldConfig>(frame, FIXEDY_FIELD);

  const base = statConfig(mainstatField);
  const fields: RelationsFamilyField[] = [];

  for (let row = 0; row < frame.length; row++) {
    const id = stringAt(idField, row);
    if (id == null) {
      continue;
    }

    const title = stringAt(titleField, row);
    const subtitle = stringAt(subtitleField, row);
    const icon = stringAt(iconField, row);
    const radius = numberAt(radiusField, row);
    const fixedX = numberAt(fixedXField, row);
    const fixedY = numberAt(fixedYField, row);
    const fixedColor = fixedColorAt(colorField, row);

    const custom: Record<string, unknown> = {};
    if (subtitle != null) {
      custom.subtitle = subtitle;
    }
    if (icon != null) {
      custom.icon = icon;
    }
    if (radius != null) {
      custom.nodeRadius = radius;
    }
    if (fixedX != null) {
      custom.fixedX = fixedX;
    }
    if (fixedY != null) {
      custom.fixedY = fixedY;
    }

    // `secondarystat` is carried as a label rather than lost: the row form has only
    // one value per node, so there is no second row for `calcs[1]` to reduce. A
    // natively-wide frame with a real value dimension uses `calcs[1]` instead.
    // A `detail__secondarystat` column cannot shadow it — the stat wins.
    const labels: Labels = detailLabels(frame, row);
    const secondary = stringAt(secondaryField, row);
    if (secondary != null) {
      labels[SECONDARYSTAT_FIELD] = secondary;
    }

    fields.push({
      name: id,
      type: FieldType.number,
      ...(Object.keys(labels).length > 0 ? { labels } : {}),
      config: {
        ...base,
        ...(title != null ? { displayName: title } : {}),
        ...(fixedColor != null ? { color: { mode: FieldColorModeId.Fixed, fixedColor } } : {}),
        ...(Object.keys(custom).length > 0 ? { custom } : {}),
      },
      values: [numberAt(mainstatField, row)],
    });
  }

  return {
    ...frame,
    fields,
    length: fields.length > 0 ? 1 : 0,
    meta: {
      ...frame.meta,
      type: GRAPH_NODES_WIDE,
      typeVersion: GRAPH_TYPE_VERSION,
    },
  };
}

/**
 * Convert every legacy node-graph frame in the response to its wide equivalent.
 *
 * Frames that are not node-graph frames are returned **by reference**, and when
 * nothing converts the input array itself is returned. Both matter: a custom
 * transform operator bypasses `config.filter`, so it sees every frame in the
 * response and must leave the others identity-intact, which is what lets the host
 * skip re-running field overrides.
 */
export function legacyToWide(frames: DataFrame[]): RelationsFamilyFrame[] {
  // Already wide (or natively emitted as wide) — nothing to do.
  if (frames.length === 0 || isGraphWideFrames(frames)) {
    return frames;
  }

  let converted = false;
  const out = frames.map((frame) => {
    if (isLegacyEdgesFrame(frame)) {
      converted = true;
      return edgesToWide(frame);
    }
    if (isLegacyNodesFrame(frame)) {
      converted = true;
      return nodesToWide(frame);
    }
    return frame;
  });

  return converted ? out : frames;
}

/**
 * `legacyToWide` as a transformation the host can run above the panel.
 *
 * A `CustomTransformOperator` rather than a `DataTransformerConfig` because no core
 * transformation can express this conversion: `configMapHandlers` writes neither
 * `config.custom.*` nor `config.links`, and `rowsToFields` drops `meta` — so
 * `custom.lineWidth`, per-mark links and `meta.type` are all unreachable through a
 * JSON-configured prefix. Measured in
 * ../../../../data-plane/graph-wide.md#what-a-native-pivot-cannot-carry.
 *
 * Two properties of the operator form matter here and are relied on: it is dispatched
 * on `typeof config === 'function'` **before** `standardTransformersRegistry` is read,
 * so there is no host-registry coupling and no jest stubbing problem; and a function
 * cannot round-trip dashboard JSON, so the entry is structurally non-persistable and
 * non-editable rather than only by convention.
 */
export const legacyToWideOperator: CustomTransformOperator = () => (source) => source.pipe(map(legacyToWide));
