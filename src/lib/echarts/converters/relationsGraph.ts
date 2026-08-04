import { type DataFrame, type Field, FieldType, type GrafanaTheme2 } from '@grafana/data';
import { frameToGraphWide, isEdgesWideFrame, isGraphWideFrames } from 'lib/echarts/converters/graphWide';
import {
  frameToNodeGraph,
  getNodeGraphValueField,
  isEdgesFrame,
  type NodeGraphData,
} from 'lib/echarts/converters/nodeGraph';

/**
 * Single entry point for the relations family's data, over both graph contracts.
 *
 * Which reader runs is decided per response, not per panel, because the same panel can
 * receive either shape depending on the datasource and on whether the host ran the
 * plugin's registered long->wide transformation (`modules/relations/dataTransformations.ts`):
 *
 * - `graph-*-wide` frames -> `frameToGraphWide`, where each mark is a field and so an
 *   override target;
 * - legacy `graph-*-long` frames -> `frameToNodeGraph`, unchanged, so every existing
 *   dashboard renders exactly as before on a host without the transformations API.
 *
 * Both produce the same `NodeGraphData`, so nothing downstream of here knows which
 * contract it is drawing.
 */
export function frameToRelationsGraph(
  frames: DataFrame[],
  theme: GrafanaTheme2,
  calcs?: string[]
): NodeGraphData | null {
  return isGraphWideFrames(frames) ? frameToGraphWide(frames, theme, calcs) : frameToNodeGraph(frames, theme);
}

/**
 * The field whose config formats node values and drives the by-value colour scheme.
 *
 * On the wide contract every node carries its own field (`RelationNode.field`), so this
 * is only a fallback for the parts of the options layer that still take one field for
 * the whole series — per-mark formatting is phase 5 of the migration. The first numeric
 * field of the nodes frame is representative, since `legacyToWide` copies the stat
 * column's `unit`/`decimals` onto every mark.
 */
export function getRelationsValueField(frames: DataFrame[]): Field | undefined {
  if (!isGraphWideFrames(frames)) {
    return getNodeGraphValueField(frames);
  }
  const edgesFrame = frames.find((frame) => isEdgesWideFrame(frame));
  const nodesFrame = frames.find((frame) => frame !== edgesFrame && frame.fields.some(isNumeric));
  return (nodesFrame ?? edgesFrame)?.fields.find(isNumeric);
}

/** The field formatting a hovered *link*'s value. */
export function getRelationsLinkValueField(frames: DataFrame[]): Field | undefined {
  if (isGraphWideFrames(frames)) {
    return frames.find((frame) => isEdgesWideFrame(frame))?.fields.find(isNumeric);
  }
  const edgesFrame = frames.find(isEdgesFrame);
  const mainstat = edgesFrame?.fields.find((field) => field.name.toLowerCase() === 'mainstat');
  return mainstat?.type === FieldType.number ? mainstat : undefined;
}

const isNumeric = (field: Field): boolean => field.type === FieldType.number;
