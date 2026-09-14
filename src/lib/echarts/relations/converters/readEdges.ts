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

/**
 * Reading the **link** half of the model: one edge per numeric field on an edges frame,
 * its endpoints off `field.labels`, its style and its filter labels off `fieldConfig`.
 */

/**
 * The keys **this edge's** endpoints filter under, as far as the response can say. Three
 * carriers, most authoritative first, and every one of them is per edge:
 *
 * - the frame's {@link GRAPH_META_CUSTOM} declaration, the only carrier that survives a
 *   pivot — but frame-wide, so a response mixing pairs records none (`commonEndpointKeys`);
 * - the field's own non-canonical pair, for a response that reached the panel unconverted;
 * - the alias recovered from the field's values ({@link aliasEndpointKeys}), which is the
 *   only one of the three that can answer differently for two edges of one frame.
 *
 * Undefined means "nothing but the contract's own pair", which the tooltip already treats
 * as the fallback — so an edge that answers nothing costs nothing.
 */
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
  // The frame's own answer to "which labels are the endpoints", tried ahead of the
  // conventional pairs. See `GRAPH_META_CUSTOM`.
  const declared = declaredEndpointKeys(frame);

  for (const field of numericFields(frame)) {
    // The pair the endpoints were *read* from, which the recovery has to skip: reporting
    // back the key it read the value out of would say nothing.
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
      // The weight is the field's own value. `thickness`'s old role as a weight
      // fallback belongs to the conversion now; here a mark is numeric by contract.
      // A field with no samples at all reduces to `null` and draws a weightless edge
      // rather than disappearing: the frame still claimed to describe this edge.
      value: value ?? 1,
      // The row the value was read from. Only `at` makes this exact: under `reduce` it is
      // row 0, so a data link interpolating `${__value.numeric}` disagrees with the
      // tooltip on ranged data. Not fixable there — "the row the reducer picked" is well
      // defined for first/last/min/max and meaningless for mean/sum.
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
    // The same extra reducers the nodes get: on an edges-only response, which is the
    // common shape, the edges are the only marks a second calculation can reach.
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

/**
 * Give every mark in a collision its own lookup key — and **only** that.
 *
 * `id` stays `field.name`, always. That is the contract's first sentence, and the reason
 * to keep it under duplication is that a minted id would be a lie: `byName`/`byNames`
 * compare against `field.name` or the display name, so a synthetic `a-->b` is not an
 * override target, is not what the override picker lists, and — worst — would break
 * `getOverrideTargetNames`, whose output feeds an *exclude* matcher. Emit an id no field
 * answers to there and hiding one node hides every link in the panel.
 *
 * Duplicated ids are harmless to everything else: ECharts resolves links by
 * `source`/`target`, the cycle policy keys on the endpoints, the value comes off the item,
 * and per-edge hiding reads the mark's own field. Exactly one consumer is wrong —
 * `getRelationsTooltipMarks` keys its link map by id, so with N marks called `Value` the
 * last one's unit, decimals and `config.links` would be served to all N. `markKey` is that
 * map's key, and nothing else: it is never rendered (an edge's tooltip header is
 * `source → target`) and never matched against, which is why the reader may mint it when
 * it may not mint an id.
 *
 * The ladder is `longToWide`'s, shared from `toGraphWide.ts`, so one response is not keyed
 * two different ways depending on whether the pivot ran: endpoints, then the label set
 * that tells parallel edges apart, then `#n`. Every id is reserved up front, colliding or
 * not, because a mark that keeps its id is still looked up by it.
 */
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
    // The mark's *own* endpoint keys: an unconverted `client`/`server` response reaches the
    // reader with those still in place, and they are the endpoints, not a discriminator.
    // A recovered pair is dropped for the same reason — a query that kept `cluster` and
    // `namespace` beside the canonical pair is carrying its topology twice, not carrying a
    // label that tells two parallel edges apart.
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
