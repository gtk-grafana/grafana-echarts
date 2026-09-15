import { type DataFrame, type Field } from '@grafana/data';
import { debug, LOG_LEVELS } from 'development';
import {
  aliasEndpointKeys,
  declaredEndpointKeys,
  endpointLabelKeysOf,
  endpointsOf,
  type GraphEndpointKeys,
  type GraphEndpoints,
  isCanonicalEndpointKeys,
  numericFields,
} from 'lib/echarts/relations/converters/contract';
import { customOf, isHiddenFrom, numberFrom, stringFrom } from 'lib/echarts/relations/converters/fieldRead';
import {
  edgeColorOf,
  type MarkRead,
  markValue,
  secondaryStatsOf,
  sourceRowOf,
} from 'lib/echarts/relations/converters/markRead';
import { type RelationLink } from 'lib/echarts/relations/converters/model';
import { contestedIds, edgeId, uniqueId, withoutEndpoints } from 'lib/echarts/relations/converters/toGraphWide';

/** The keys this edge's endpoints filter under, as far as the response can say. */
function edgeFilterLabels(
  field: Field,
  endpoints: GraphEndpoints,
  read: GraphEndpointKeys | undefined,
  declared: GraphEndpointKeys | undefined
): { keys: GraphEndpointKeys; recovered: boolean } | undefined {
  if (declared && !isCanonicalEndpointKeys(declared)) {
    return { keys: declared, recovered: false };
  }
  const own = endpointLabelKeysOf(field);
  if (own && !isCanonicalEndpointKeys(own)) {
    return { keys: own, recovered: false };
  }
  const alias = aliasEndpointKeys(field, endpoints, read);
  return alias ? { keys: alias, recovered: true } : undefined;
}

export function readLinks(frame: DataFrame, markRead: MarkRead, recovered: Set<RelationLink>): RelationLink[] {
  const links: RelationLink[] = [];
  // Prefer endpoint labels declared by the frame.
  const declared = declaredEndpointKeys(frame);

  for (const field of numericFields(frame)) {
    // Do not recover the same label pair that supplied the endpoints.
    const read = endpointLabelKeysOf(field, declared);
    const endpoints = endpointsOf(field, declared);
    if (!endpoints) {
      continue;
    }

    const value = markValue(field, markRead);
    const custom = customOf(field);
    const link: RelationLink = {
      id: field.name,
      source: endpoints.source,
      target: endpoints.target,
      // Keep an edge when its field has no samples.
      value: value ?? 1,
      // Reducers have no single source row, so they use row zero.
      sourceRowIndex: sourceRowOf(markRead),
      field,
    };

    const filterLabels = edgeFilterLabels(field, endpoints, read, declared);
    if (filterLabels != null) {
      link.filterLabels = filterLabels.keys;
      if (filterLabels.recovered) {
        recovered.add(link);
      }
    }

    const color = edgeColorOf(field, value);
    if (color != null) {
      link.color = color;
    }
    const width = numberFrom(custom.lineWidth);
    if (width != null) {
      link.width = width;
    }
    const lineType = stringFrom(custom.lineType);
    if (lineType === 'solid' || lineType === 'dashed' || lineType === 'dotted') {
      link.lineType = lineType;
    }
    const curveness = numberFrom(custom.curveness);
    if (curveness != null) {
      link.curveness = curveness;
    }
    const secondaries = secondaryStatsOf(field, markRead);
    if (secondaries.length > 0) {
      link.secondaries = secondaries;
    }
    if (isHiddenFrom(field)) {
      link.hidden = true;
    }
    links.push(link);
  }

  return links;
}

/** Give every mark in a collision its own lookup key. */
export function assignMarkKeys(links: RelationLink[]): void {
  const colliding = contestedIds(links.map((link) => link.id));
  if (colliding.size === 0) {
    return;
  }

  const taken = new Set(links.map((link) => link.id));
  const keyed = links.filter((link) => colliding.has(link.id));
  const bases = keyed.map((link) => edgeId(link.source, link.target));
  const contested = contestedIds(bases);
  keyed.forEach((link, index) => {
    const base = bases[index];
    // Exclude endpoint aliases from the parallel-edge discriminator.
    const endpointKeys = link.field ? endpointLabelKeysOf(link.field) : undefined;
    const rest = withoutEndpoints(withoutEndpoints(link.field?.labels, endpointKeys), link.filterLabels);
    const key = uniqueId(taken, base, rest, contested.has(base));
    taken.add(key);
    link.markKey = key;
  });

  debug(`Colliding edges: ${keyed.length} edges with colliding names: ${[...colliding].join(', ')}`, LOG_LEVELS.warn, {
    ids: [...colliding],
    markKeys: keyed.map((link) => link.markKey),
  });
}
