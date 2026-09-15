import { type DataFrame, type DataFrameType, type Field, FieldType, type Labels } from '@grafana/data';
import { isRecord, stringFrom } from 'lib/echarts/relations/converters/fieldRead';

/** Separator for endpoint names stored in a field name. */
export const EDGE_SEPARATOR = '-->';

/** Wide graph frame types. See data-plane/graph-wide.md. */
// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
export const GRAPH_EDGES_WIDE = 'graph-edges-wide' as DataFrameType;
// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
export const GRAPH_NODES_WIDE = 'graph-nodes-wide' as DataFrameType;

/** Contract version for both wide frame types. */
export const GRAPH_TYPE_VERSION: [number, number] = [0, 1];

export const SOURCE_LABEL = 'source';
export const TARGET_LABEL = 'target';
export const SECONDARYSTAT_LABEL = 'secondarystat';

export const numericFields = (frame: DataFrame): Field[] =>
  frame.fields.filter((field) => field.type === FieldType.number);

/** Values for one edge endpoint pair. */
export interface GraphEndpoints {
  source: string;
  target: string;
}

/** Label names for one edge endpoint pair. */
export interface GraphEndpointKeys {
  source: string;
  target: string;
}

export const CANONICAL_ENDPOINT_KEYS: GraphEndpointKeys = { source: SOURCE_LABEL, target: TARGET_LABEL };

/** Endpoint label pairs accepted without explicit metadata. */
export const ENDPOINT_LABEL_PAIRS: readonly GraphEndpointKeys[] = [
  CANONICAL_ENDPOINT_KEYS,
  { source: 'client', target: 'server' },
  { source: 'src', target: 'dst' },
  { source: 'from', target: 'to' },
];

export const ENDPOINT_LABEL_KEYS: ReadonlySet<string> = new Set(
  ENDPOINT_LABEL_PAIRS.flatMap((pair) => [pair.source, pair.target])
);

export const GRAPH_META_CUSTOM = 'graph';

/** Marks a nodes frame that contains placeholder fields. */
export const GRAPH_META_DERIVED_NODES = 'derivedNodes';

export function isCanonicalEndpointKeys(keys: GraphEndpointKeys): boolean {
  return keys.source === SOURCE_LABEL && keys.target === TARGET_LABEL;
}

export function isDerivedNodesFrame(frame: DataFrame): boolean {
  const custom: unknown = isRecord(frame.meta?.custom) ? frame.meta.custom[GRAPH_META_CUSTOM] : undefined;
  return isRecord(custom) && custom[GRAPH_META_DERIVED_NODES] === true;
}

/** Reads endpoint label names from frame metadata. */
export function declaredEndpointKeys(frame: DataFrame): GraphEndpointKeys | undefined {
  const custom: unknown = isRecord(frame.meta?.custom) ? frame.meta.custom[GRAPH_META_CUSTOM] : undefined;
  if (!isRecord(custom)) {
    return undefined;
  }
  const source = stringFrom(custom.sourceKey);
  const target = stringFrom(custom.targetKey);
  return source && target ? { source, target } : undefined;
}

/** Finds the first supported endpoint label pair on a field. */
export function endpointLabelKeysOf(field: Field, declared?: GraphEndpointKeys): GraphEndpointKeys | undefined {
  const labels = field.labels ?? {};
  if (declared && labels[declared.source] && labels[declared.target]) {
    return declared;
  }
  return ENDPOINT_LABEL_PAIRS.find((pair) => labels[pair.source] && labels[pair.target]);
}

/** Reads endpoint values from field labels. */
export function endpointLabelsOf(field: Field, declared?: GraphEndpointKeys): GraphEndpoints | undefined {
  const keys = endpointLabelKeysOf(field, declared);
  if (!keys) {
    return undefined;
  }
  const labels = field.labels ?? {};
  return { source: labels[keys.source], target: labels[keys.target] };
}

/** Splits every valid separator and favors a split found in the labels. */
export function endpointsFromName(name: string, labels?: Labels): GraphEndpoints | undefined {
  const splits: GraphEndpoints[] = [];
  for (let at = name.indexOf(EDGE_SEPARATOR); at > 0; at = name.indexOf(EDGE_SEPARATOR, at + 1)) {
    const source = name.slice(0, at);
    const target = name.slice(at + EDGE_SEPARATOR.length);
    if (source && target) {
      splits.push({ source, target });
    }
  }
  if (splits.length === 0) {
    return undefined;
  }
  const values = new Set(Object.values(labels ?? {}));
  return splits.find(({ source, target }) => values.has(source) && values.has(target)) ?? splits[0];
}

/** Reads endpoints from labels, then falls back to the field name. */
export function endpointsOf(field: Field, declared?: GraphEndpointKeys): GraphEndpoints | undefined {
  return endpointLabelsOf(field, declared) ?? endpointsFromName(field.name, field.labels);
}

/** Finds original label names after a query copies endpoints to canonical labels. */
export function aliasEndpointKeys(
  field: Field,
  endpoints: GraphEndpoints,
  read?: GraphEndpointKeys
): GraphEndpointKeys | undefined {
  const candidates = Object.entries(field.labels ?? {}).filter(([key]) => key !== read?.source && key !== read?.target);
  const matching = (value: string): string[] => candidates.filter(([, held]) => held === value).map(([key]) => key);

  if (endpoints.source === endpoints.target) {
    const both = matching(endpoints.source);
    return both.length === 2 ? { source: both[0], target: both[1] } : undefined;
  }
  const sources = matching(endpoints.source);
  const targets = matching(endpoints.target);
  if (sources.length !== 1 || targets.length !== 1) {
    return undefined;
  }
  return { source: sources[0], target: targets[0] };
}
