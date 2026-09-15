import { type DataFrame } from '@grafana/data';
import {
  declaredEndpointKeys,
  endpointLabelKeysOf,
  endpointsOf,
  GRAPH_EDGES_WIDE,
  GRAPH_NODES_WIDE,
  type GraphEndpointKeys,
  isCanonicalEndpointKeys,
  isDerivedNodesFrame,
  numericFields,
} from 'lib/echarts/relations/converters/contract';

/** Returns true when metadata or field shape identifies an edges frame. */
export function isEdgesWideFrame(frame: DataFrame): boolean {
  if (frame.meta?.type === GRAPH_EDGES_WIDE) {
    return true;
  }
  if (frame.meta?.type === GRAPH_NODES_WIDE) {
    return false;
  }
  const numeric = numericFields(frame);
  const declared = declaredEndpointKeys(frame);
  return numeric.length > 0 && numeric.some((field) => endpointsOf(field, declared) != null);
}

/** A wide graph needs at least one edges frame. */
export function isGraphWideFrames(frames: DataFrame[]): boolean {
  return frames.some(isEdgesWideFrame);
}

/** Returns every declared edges frame, or every shape match. */
function findEdgesFrames(frames: DataFrame[]): DataFrame[] {
  const declared = frames.filter((frame) => frame.meta?.type === GRAPH_EDGES_WIDE);
  return declared.length > 0 ? declared : frames.filter((frame) => isEdgesWideFrame(frame));
}

/**
 * Returns declared nodes frames or shape matches.
 * Derived placeholders do not hide later user transformations.
 */
function findNodesFrames(frames: DataFrame[], endpoints: ReadonlySet<string>): DataFrame[] {
  const declared = frames.filter((frame) => frame.meta?.type === GRAPH_NODES_WIDE);
  if (declared.some((frame) => !isDerivedNodesFrame(frame))) {
    return declared;
  }
  const matched = frames.filter(
    (frame) =>
      !declared.includes(frame) &&
      !isEdgesWideFrame(frame) &&
      numericFields(frame).some((field) => endpoints.has(field.name))
  );
  return [...declared, ...matched];
}

/** Returns endpoint names in source, target, and frame order. */
export function endpointNames(edgesFrames: DataFrame[]): Set<string> {
  const names = new Set<string>();
  for (const frame of edgesFrames) {
    const declared = declaredEndpointKeys(frame);
    for (const field of numericFields(frame)) {
      const endpoints = endpointsOf(field, declared);
      if (endpoints) {
        names.add(endpoints.source);
        names.add(endpoints.target);
      }
    }
  }
  return names;
}

/** Returns the first non-canonical endpoint label pair. */
export function resolveEndpointLabelKeys(edgesFrames: DataFrame[]): GraphEndpointKeys | undefined {
  for (const frame of edgesFrames) {
    const declared = declaredEndpointKeys(frame);
    if (declared && !isCanonicalEndpointKeys(declared)) {
      return declared;
    }
  }
  for (const frame of edgesFrames) {
    for (const field of numericFields(frame)) {
      const keys = endpointLabelKeysOf(field);
      if (keys && !isCanonicalEndpointKeys(keys)) {
        return keys;
      }
    }
  }
  return undefined;
}

/** Resolves all edge and node frames with metadata before shape matching. */
export function resolveGraphWideRoles(
  frames: DataFrame[]
): { edgesFrames: DataFrame[]; nodesFrames: DataFrame[] } | null {
  const edgesFrames = findEdgesFrames(frames);
  if (edgesFrames.length === 0) {
    return null;
  }
  return { edgesFrames, nodesFrames: findNodesFrames(frames, endpointNames(edgesFrames)) };
}

/** Returns true when every node is derived or has only null values. */
export function hasNoNodeStats(frames: DataFrame[] | undefined): boolean {
  const roles = frames != null && frames.length > 0 ? resolveGraphWideRoles(frames) : null;
  if (roles == null) {
    return false;
  }
  const nodeFields = roles.nodesFrames.flatMap(numericFields);
  if (nodeFields.length === 0) {
    return true;
  }
  return !nodeFields.some((field) => field.values.some((value) => value != null));
}
