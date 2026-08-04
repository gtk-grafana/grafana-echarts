// Root specifier deliberately: `rxjs` is an exact-string webpack external
// (`.config/bundler/externals.ts`), so `rxjs/operators` would be bundled instead of
// taken from the host.
import { map } from 'rxjs';

import {
  type CustomTransformOperator,
  type DataFrame,
  type Field,
  FieldColorModeId,
  type FieldConfig,
  FieldType,
  type Labels,
} from '@grafana/data';
import { isEdgesFrame, isNodesFrame } from 'lib/echarts/converters/nodeGraph';
import {
  EDGE_SEPARATOR,
  GRAPH_EDGES_WIDE,
  GRAPH_NODES_WIDE,
  GRAPH_TYPE_VERSION,
  isGraphWideFrames,
} from 'lib/echarts/converters/graphWide';

/**
 * Convert Grafana's legacy row-based node-graph frames (`graph-*-long`) into the
 * field-based wide contract (`graph-*-wide`) — one node per field, one edge per
 * field.
 *
 * See ../../../../data-plane/graph-wide.md#complete-mapping-from-graph--long for the
 * mapping this implements, and ../../../../todo/graph-wide-migration.md for why the
 * conversion has to happen *above* the panel to be useful: run here, in the panel, it
 * is downstream of `applyFieldOverrides`, so the fields it produces can render but can
 * never carry a per-mark override. Registered as a panel transformation
 * (`setDataTransformations`, grafana/grafana#129992) it runs before the override pass
 * and each node and edge becomes an ordinary override target.
 *
 * Deliberately theme-free and synchronous: it runs both inside the rx pipeline (where
 * no theme is in scope) and at the panel's frame boundary as a fallback.
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

function findField(frame: DataFrame, name: string): Field | undefined {
  return frame.fields.find((field) => field.name.toLowerCase() === name);
}

/**
 * Read a value as a display string without a theme.
 *
 * The long reader (`nodeGraph.ts`) resolves through a display processor so enum
 * fields read as text. Nothing here can: this runs in the transformation pipeline,
 * before `applyFieldOverrides`, so `field.display` is not attached yet and there is
 * no theme to build one from. Numeric enum ids therefore stringify as their index —
 * acceptable because `id`/`source`/`target` are string fields in every producer.
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
 * renderer already makes: an SVG dash array has no ECharts equivalent, so only
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
function statConfig(statField: Field | undefined): FieldConfig {
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
function edgesToWide(frame: DataFrame): DataFrame {
  const idField = findField(frame, ID_FIELD);
  const sourceField = findField(frame, SOURCE_FIELD);
  const targetField = findField(frame, TARGET_FIELD);
  const mainstatField = findField(frame, MAINSTAT_FIELD);
  const thicknessField = findField(frame, THICKNESS_FIELD);
  const colorField = findField(frame, COLOR_FIELD);
  const dashField = findField(frame, STROKEDASHARRAY_FIELD);

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
      // themselves contain the separator, which a name split cannot.
      labels: { source, target, ...detailLabels(frame, row) },
      config: {
        ...base,
        ...(fixedColor != null ? { color: { mode: FieldColorModeId.Fixed, fixedColor } } : {}),
        ...(Object.keys(custom).length > 0 ? { custom } : {}),
      },
      // The weight is now the field's own value; `thickness` is no longer a fallback
      // for it, because it has become styling (`custom.lineWidth`).
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
function nodesToWide(frame: DataFrame): DataFrame {
  const idField = findField(frame, ID_FIELD);
  const titleField = findField(frame, TITLE_FIELD);
  const subtitleField = findField(frame, SUBTITLE_FIELD);
  const mainstatField = findField(frame, MAINSTAT_FIELD);
  const secondaryField = findField(frame, SECONDARYSTAT_FIELD);
  const radiusField = findField(frame, NODERADIUS_FIELD);
  const colorField = findField(frame, COLOR_FIELD);
  const iconField = findField(frame, ICON_FIELD);
  const fixedXField = findField(frame, FIXEDX_FIELD);
  const fixedYField = findField(frame, FIXEDY_FIELD);

  const base = statConfig(mainstatField);
  const fields: Field[] = [];

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

    const labels = detailLabels(frame, row);
    // `secondarystat` has no second reducer to land in on instant data — both calcs
    // reduce the same single value — so it is carried as a label rather than lost.
    // See graph-wide.md#the-reduceoptions-contract.
    const secondary = stringAt(secondaryField, row);
    if (secondary != null) {
      labels.secondarystat = secondary;
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
 * response and must leave the others identity-intact, which is what lets the panel
 * skip re-running field overrides.
 */
export function legacyToWide(frames: DataFrame[]): DataFrame[] {
  // Already wide (or natively emitted as wide) — nothing to do.
  if (frames.length === 0 || isGraphWideFrames(frames)) {
    return frames;
  }

  let converted = false;
  const out = frames.map((frame) => {
    if (isEdgesFrame(frame)) {
      converted = true;
      return edgesToWide(frame);
    }
    if (isNodesFrame(frame)) {
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
