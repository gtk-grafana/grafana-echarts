import { type Field } from '@grafana/data';
import { ENDPOINT_LABEL_KEYS, type GraphEndpointKeys } from 'lib/echarts/relations/converters/contract';
import { customFilterLabel } from 'lib/echarts/relations/tooltip/marks';
import {
  type NodeFilterLabels,
  type RelationsLinkItem,
  type RelationsMark,
  type RelationsMarks,
  type RelationsNodeItem,
} from 'lib/echarts/relations/tooltip/types';
import { type TooltipAdHocFilter, type TooltipFilters } from 'lib/echarts/tooltip/types';

/**
 * The ad-hoc **filter buttons** the tooltip footer offers for a hovered mark.
 *
 * Which keys a mark's endpoints are filterable *under* is mark-model data and lives in
 * `marks.ts`; this module decides which buttons a given mark actually gets, and dedupes
 * them. See `VizTooltipFooter`'s constraints on keyless values and all-or-nothing pairs.
 */

/**
 * Whether this mark's ad-hoc filters may be offered at all.
 *
 * The standard `filterable` field config is the gate — core's own for the same buttons, see
 * `resolveFilters` in `lib/components/tooltip` — but relations applies it here rather than
 * leaving it to the footer, because the footer can only ask the *hovered mark's* field and
 * one mark has none: a node the response only implied.
 *
 * So, in order:
 *
 * - a mark **with** a field answers for itself, `false` included. An explicit "not
 *   filterable" on one node is a `byName` override the user wrote, and no fallback may
 *   overrule it;
 * - a mark **without** one — a derived node on a host that cannot run the pre-pass, and
 *   therefore *every* node of an edges-only response there — takes the edges' answer
 *   ({@link RelationsMarks.endpointsFilterable}). Its filters are written under the
 *   endpoint label keys, which are the edges' dimensions, so the edges are the honest
 *   authority. Without this a service-graph panel offered filters on its links and none
 *   at all on its nodes.
 */
export function markFilterable(mark: RelationsMark | undefined, marks: RelationsMarks | undefined): boolean {
  return mark != null ? mark.source.field.config.filterable === true : marks?.endpointsFilterable === true;
}

/** Keep the first entry per key, preserving order — the endpoints are added first. */
function dedupeFilters(filters: TooltipAdHocFilter[]): TooltipAdHocFilter[] {
  const seen = new Set<string>();
  return filters.filter((filter) => {
    const id = `${filter.key}\u0000${filter.value}`;
    if (seen.has(id) || filter.value === '') {
      return false;
    }
    seen.add(id);
    return true;
  });
}

/**
 * A mark's own labels **except** its endpoints — the dimensions that are not topology.
 *
 * These always worked: `connection_type`, `protocol` and friends are real datasource labels
 * already, they pass through under their own names, and their values differ from the
 * endpoints' so each gets a button a user can tell apart. The endpoints are excluded here
 * and added deliberately by the two callers, which want them in different groups.
 *
 * `keys` is the pair this mark actually filters under, and excluding it is what keeps the
 * recovery from double-counting. A query that keeps its originals — `sum by (source, target,
 * cluster, namespace)` — carries its topology twice, so `cluster` is not a dimension beside
 * the endpoints, it *is* the source endpoint: without this it would appear once inside the
 * grouped conjunction and again as its own "Filter for 'prod'" button.
 */
function extraLabelFilters(field: Field | undefined, keys: GraphEndpointKeys): TooltipAdHocFilter[] {
  return Object.entries(field?.labels ?? {})
    .filter(([key]) => !ENDPOINT_LABEL_KEYS.has(key) && key !== keys.source && key !== keys.target)
    .map(([key, value]) => ({ key, value }));
}

/**
 * The filters a hovered **edge** offers.
 *
 * The endpoints go in the *grouped* pair rather than one button each, because an edge **is**
 * the conjunction of its two endpoints: "Filter on this value" then narrows the dashboard to
 * exactly this edge, and "Filter out this value" excludes it. Offering them individually as
 * well — which is what produced four buttons for a two-label mark — adds nothing the node's
 * own tooltip does not already offer, and reads as three ways to do one thing.
 *
 * Endpoints come off the *item* rather than off the field, which keeps this independent of
 * how the response arrived — an edge whose mark has no field, an N-raw-frames response on a
 * host that cannot run the pivot, still offers them. Whether they are offered at all is
 * {@link markFilterable}'s call.
 */
export function edgeFilters(
  item: RelationsLinkItem,
  mark: RelationsMark | undefined,
  keys: GraphEndpointKeys
): TooltipFilters {
  const extra = dedupeFilters(extraLabelFilters(mark?.source.field, keys));
  const whole = dedupeFilters([
    { key: keys.source, value: item.source },
    { key: keys.target, value: item.target },
    ...extra,
  ]);
  return { each: extra, filterFor: whole, filterOut: whole };
}

/**
 * The filters a hovered **node** offers.
 *
 * Nodes had none at all, which is the half of the report that is a plain gap rather than a
 * mapping question. A node's identity is its `field.name` under the wide contract — not a
 * label — so the generic "walk `field.labels`" derivation finds nothing on the very mark a
 * topology is most obviously filtered by. Stating the pairs here is what fills that gap;
 * whether they are offered is {@link markFilterable}'s call.
 *
 * **The two halves are deliberately asymmetric**, because a node is an endpoint in both
 * directions and ad-hoc filters can only be ANDed:
 *
 * - "Filter out this value" negates **every distinct key** the node is an endpoint under —
 *   plus, for a role it does not currently play, the far key of the pairs it sits on, since
 *   a `topk` re-ranks the moment the filter applies and the node would otherwise reappear at
 *   the other end. That is "everything that does not touch this node", the reading a user
 *   means by hiding a node. Several negations ANDed are a valid intersection, so more than
 *   one key is safe here;
 * - "Filter on this value" asserts **one**: the first key the node is a source under, else
 *   the first it is a target under. Asserting two would AND two labels into an empty
 *   dashboard — for a single-level response literally `source=x AND target=x`, i.e.
 *   self-loops. There is no ad-hoc filter for "either endpoint", so the panel offers the
 *   direction it can express rather than a button that returns nothing.
 *
 * The keys come from the **edges touching the node** ({@link toNodeFilterLabels}), which is
 * the only thing that can answer for a mark whose identity is a `field.name`. Three things
 * fall out. A single-level response negates exactly what it always did: every edge says
 * `source`/`target`, so every node negates both, whichever roles it happens to play. A
 * **sink** — a node with only inbound edges — used to assert `source=<leaf>`, which matches
 * nothing; it now asserts its own key. And a **multi-level** flow needs no configuration: a
 * namespace node is level 1's target and level 2's source and both say `namespace`, so it
 * negates one deduped `namespace` and asserts the same.
 *
 * The node's **own** `custom.sourceFilterLabel` still wins over its incidence, per role: it
 * is explicit intent, and a node that has to be told its key is exactly the case the
 * override exists for.
 *
 * `each` carries only the node's non-endpoint labels: the two endpoint directions cannot go
 * there, since `VizTooltipFooter` labels those buttons by value alone and both would read
 * "Filter for '&lt;node&gt;'". That pair of identical buttons is the reported duplication.
 */
export function nodeFilters(
  item: RelationsNodeItem,
  mark: RelationsMark | undefined,
  keys: GraphEndpointKeys,
  incidence: NodeFilterLabels | undefined
): TooltipFilters {
  const field = mark?.source.field;
  const extra = dedupeFilters(extraLabelFilters(field, keys));
  // An override on the node itself is explicit intent about *this* mark and outranks what
  // the edges around it say — and it is all-or-nothing for the same reason
  // `declaredEndpointKeys` is: `keys` has already resolved each half, so a half-configured
  // node keeps the behaviour it had before the incidence map existed.
  const configured =
    customFilterLabel(field, 'sourceFilterLabel') != null || customFilterLabel(field, 'targetFilterLabel') != null;
  const fromEdges = !configured && incidence != null && incidence.negate.length > 0 ? incidence : undefined;
  const assert = fromEdges ? (fromEdges.sources[0] ?? fromEdges.targets[0] ?? keys.source) : keys.source;
  const negate = fromEdges ? fromEdges.negate : [keys.source, keys.target];

  return {
    each: extra,
    filterFor: dedupeFilters([{ key: assert, value: item.id }, ...extra]),
    filterOut: dedupeFilters(negate.map((key) => ({ key, value: item.id })).concat(extra)),
  };
}
