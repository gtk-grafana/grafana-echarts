// Root specifier deliberately: `rxjs` is an exact-string webpack external
// (`.config/bundler/externals.ts`), so `rxjs/operators` would be bundled instead of
// taken from the host.
import { type CustomTransformOperator, type DataFrame, type Field, FieldType } from '@grafana/data';
import { debug, LOG_LEVELS } from 'development';

import { nodesWideFrame } from 'lib/echarts/relations/converters/toGraphWide';
import { type RelationsFamilyField } from 'lib/grafana/fields/relationsFields';
import { map } from 'rxjs';

import { GRAPH_META_CUSTOM, GRAPH_META_DERIVED_NODES } from 'lib/echarts/relations/converters/contract';
import { endpointNames, resolveGraphWideRoles } from 'lib/echarts/relations/converters/frameRoles';

const numericFields = (frame: DataFrame): Field[] => frame.fields.filter((field) => field.type === FieldType.number);

/** Every node id some nodes frame already declares, and which therefore needs nothing. */
function declaredNodeIds(nodesFrames: DataFrame[]): Set<string> {
  const declared = new Set<string>();
  for (const frame of nodesFrames) {
    for (const field of numericFields(frame)) {
      declared.add(field.name);
    }
  }
  return declared;
}

/** One numeric field per inferred node, carrying no stat. */
function derivedNodeFields(ids: readonly string[], rows: number): RelationsFamilyField[] {
  return ids.map((id) => ({
    name: id,
    type: FieldType.number,
    config: {},
    values: Array.from({ length: rows }, () => null),
  }));
}

/** Add the missing nodes to the frame that already holds the declared ones. */
function withDerivedNodes(frame: DataFrame, missing: readonly string[]): DataFrame {
  const rows = Math.max(frame.length, 1);
  return { ...frame, fields: [...frame.fields, ...derivedNodeFields(missing, rows)], length: rows };
}

/** The frame the pre-pass creates when the response declares no nodes at all. */
function placeholderNodesFrame(refId: string | undefined, missing: readonly string[]): DataFrame {
  const frame = nodesWideFrame(refId != null ? { refId } : {}, derivedNodeFields(missing, 1));
  // This new frame has no existing custom metadata to preserve.
  return {
    ...frame,
    meta: { ...frame.meta, custom: { [GRAPH_META_CUSTOM]: { [GRAPH_META_DERIVED_NODES]: true } } },
  };
}

/** Declare every endpoint the response left implicit. */
export function deriveNodes(frames: DataFrame[]): DataFrame[] {
  const roles = resolveGraphWideRoles(frames);
  if (!roles) {
    return frames;
  }

  const declared = declaredNodeIds(roles.nodesFrames);
  const missing = [...endpointNames(roles.edgesFrames)].filter((id) => !declared.has(id));
  if (missing.length === 0) {
    return frames;
  }

  debug(`Creating ${missing.length} derived node(s)`, LOG_LEVELS.info, {
    derived: missing,
    declared: [...declared],
    appended: roles.nodesFrames.length > 0,
  });

  const [target] = roles.nodesFrames;
  if (target == null) {
    return [placeholderNodesFrame(roles.edgesFrames[0].refId, missing), ...frames];
  }
  return frames.map((frame) => (frame === target ? withDerivedNodes(frame, missing) : frame));
}

/** `deriveNodes` as a transformation the host can run above the panel. */
export const deriveNodesOperator: CustomTransformOperator = () => (source) => source.pipe(map(deriveNodes));
