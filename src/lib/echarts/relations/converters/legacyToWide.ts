import {
  type CustomTransformOperator,
  type DataFrame,
  type Field,
  FieldColorModeId,
  type FieldConfig,
  FieldType,
  type Labels,
} from '@grafana/data';
import { debug, LOG_LEVELS } from 'development';
import type { EChartsRelationsFieldConfig } from 'editor/relations/types';

import {
  edgeId,
  edgeLabels,
  edgesWideFrame,
  nodesWideFrame,
  numberAt,
} from 'lib/echarts/relations/converters/toGraphWide';
import {
  type RelationsFamilyField,
  type RelationsFamilyFrame,
  type RelationsFamilyValue,
} from 'lib/grafana/fields/relationsFields';
import { type ConfigTypedField } from 'lib/grafana/types';
// The root package is a webpack external. A subpath import would be bundled.
import { map } from 'rxjs';

import { isGraphWideFrames } from 'lib/echarts/relations/converters/frameRoles';

/** Convert Grafana's legacy row-based node-graph frames (`graph-*-long`) into the field-based wide contract (`graph-*-wide`). */

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
 * Find a field without case sensitivity.
 * @todo Reuse a field-name map if this lookup becomes expensive.
 */

function findField<V, C>(frame: DataFrame, name: string): ConfigTypedField<V, C> | undefined {
  return frame.fields.find((field) => field.name.toLowerCase() === name);
}

const hasField = (frame: DataFrame, name: string): boolean => findField(frame, name) != null;

/** True when a frame declares itself part of a node-graph response. */
function declaresLegacyNodeGraph(frame: DataFrame): boolean {
  return (
    frame.meta?.preferredVisualisationType === 'nodeGraph' ||
    // Proposed frame metadata is not yet typed by Grafana.
    //@ts-expect-error Proposed graph-wide metadata is not yet typed by Grafana.
    frame.meta?.type === 'graph-edges-long' ||
    //@ts-expect-error
    frame.meta?.type === 'graph-node-long'
  );
}

/** A time dimension means a datasource response, not a static table of edges. */
function hasTimeField(frame: DataFrame): boolean {
  return frame.fields.some((field) => field.type === FieldType.time);
}

/** True when a frame is a legacy edges frame. */
export function isLegacyEdgesFrame(frame: DataFrame): boolean {
  if (!hasField(frame, SOURCE_FIELD) || !hasField(frame, TARGET_FIELD)) {
    return false;
  }
  return declaresLegacyNodeGraph(frame) || !hasTimeField(frame);
}

/** True when a frame is a legacy nodes frame: an `id` and no `source`/`target`. */
export function isLegacyNodesFrame(frame: DataFrame): boolean {
  if (!hasField(frame, ID_FIELD) || isLegacyEdgesFrame(frame)) {
    return false;
  }
  return declaresLegacyNodeGraph(frame) || !hasTimeField(frame);
}

/** True when these frames carry legacy row-based node-graph data. */
export function isLegacyGraphFrames(frames: DataFrame[]): boolean {
  return frames.some(isLegacyEdgesFrame);
}

/** Read a value as a display string without a theme. */
function stringAt(field: Field | undefined, row: number): string | undefined {
  const raw: unknown = field?.values[row];
  if (raw == null || raw === '') {
    return undefined;
  }
  return typeof raw === 'string' ? raw : String(raw);
}

/** Read a non-empty color string. */
function fixedColorAt(field: Field | undefined, row: number): string | undefined {
  const raw: unknown = field?.values[row];
  return typeof raw === 'string' && raw !== '' ? raw : undefined;
}

/** Map an SVG dash array to the nearest ECharts line type. */
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

/** Carry the stat column's own formatting onto every mark. */
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
      name: stringAt(idField, row) ?? edgeId(source, target),
      type: FieldType.number,
      // Labels are the primary endpoint carrier: they survive node ids that
      // themselves contain the separator, which a name split cannot.
      labels: edgeLabels(detailLabels(frame, row), { source, target }),
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

  return edgesWideFrame(frame, fields);
}

/** One numeric field per node row. */
function nodesToWide(frame: DataFrame): RelationsFamilyFrame {
  // @todo Reuse a field-name map if this lookup becomes expensive.
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
    // The stat takes precedence over `detail__secondarystat`.
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

  return nodesWideFrame(frame, fields);
}

/** Convert every legacy node-graph frame in the response to its wide equivalent. */
export function legacyToWide(frames: DataFrame[]): RelationsFamilyFrame[] {
  // Keep native wide frames unchanged.
  if (frames.length === 0 || isGraphWideFrames(frames)) {
    return frames;
  }

  const converted: string[] = [];
  const out = frames.map((frame) => {
    if (isLegacyEdgesFrame(frame)) {
      const wide = edgesToWide(frame);
      converted.push(`${frame.refId ?? frame.name ?? '?'}: ${wide.fields.length} edges`);
      return wide;
    }
    if (isLegacyNodesFrame(frame)) {
      const wide = nodesToWide(frame);
      converted.push(`${frame.refId ?? frame.name ?? '?'}: ${wide.fields.length} nodes`);
      return wide;
    }
    return frame;
  });

  if (converted.length === 0) {
    return frames;
  }
  debug(
    `Note: relations converted ${converted.length} legacy graph-*-long frame(s) to the wide contract, ` +
      'one field per node and per edge, so each becomes an override target.',
    LOG_LEVELS.info,
    { converted, frames: frames.length }
  );
  return out;
}

/** `legacyToWide` as a transformation the host can run above the panel. */
export const legacyToWideOperator: CustomTransformOperator = () => (source) => source.pipe(map(legacyToWide));
