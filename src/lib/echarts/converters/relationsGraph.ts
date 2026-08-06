import { type DataFrame, type Field, FieldType, type GrafanaTheme2, type ReduceDataOptions } from '@grafana/data';
import { frameToGraphWide, isGraphWideFrames, resolveGraphWideRoles } from 'lib/echarts/converters/graphWide';
import { isLegacyGraphFrames } from 'lib/echarts/converters/legacyToWide';
import { type NodeGraphData } from 'lib/echarts/converters/relationsModel';

/**
 * Single entry point for the relations family's data.
 *
 * The family reads **only** `graph-*-wide` (`converters/graphWide.ts`). Grafana's
 * row-based node-graph frames are converted to it *above* the panel, by the
 * transformation the plugin registers on itself
 * (`modules/relations/dataTransformations.ts`). That placement is the whole point: a
 * conversion inside the panel would run after `applyFieldOverrides`, so its fields
 * could render but could never carry a per-mark override.
 *
 * Requires the panel-registered transformations API (grafana/grafana#129992, expected
 * in Grafana 13.2 — the plugin's minimum supported version). On an older host nothing
 * converts the frames, and this throws rather than rendering nothing: a row-format
 * response reaching the panel means the pipeline is missing a step the user can supply
 * by hand, and a silent empty panel would hide that. See
 * ../../../../todo/graph-wide-migration.md.
 */
export function frameToRelationsGraph(
  frames: DataFrame[],
  theme: GrafanaTheme2,
  reduceOptions?: ReduceDataOptions
): NodeGraphData | null {
  if (isGraphWideFrames(frames)) {
    return frameToGraphWide(frames, theme, reduceOptions);
  }
  if (isLegacyGraphFrames(frames)) {
    throw new Error(
      'Row-based node-graph frames need converting to the field-based graph contract before the panel can read them. ' +
        'This normally happens automatically (Grafana 13.2+); on an older host, add a "Rows to fields" transformation.'
    );
  }
  // Not a graph in either shape: nothing to draw, which is the no-data view's job.
  return null;
}

const isNumeric = (field: Field): boolean => field.type === FieldType.number;

/**
 * The field whose config formats node values.
 *
 * Every node already carries its own field (`RelationNode.field`), so this exists only
 * for the parts of the options and tooltip layers that still take one field for the
 * whole series — per-mark formatting is phase 5 of the migration. The nodes frame's
 * first mark is representative, because the conversion copies the stat column's
 * `unit`/`decimals` onto every mark.
 *
 * Roles come from `resolveGraphWideRoles`, so this cannot disagree with the reader
 * about which frame is which.
 */
export function getRelationsValueField(frames: DataFrame[]): Field | undefined {
  const roles = resolveGraphWideRoles(frames);
  if (!roles) {
    return undefined;
  }
  return (roles.nodesFrame ?? roles.edgesFrame).fields.find(isNumeric);
}

/** The field formatting a hovered *link*'s value. */
export function getRelationsLinkValueField(frames: DataFrame[]): Field | undefined {
  return resolveGraphWideRoles(frames)?.edgesFrame.fields.find(isNumeric);
}
