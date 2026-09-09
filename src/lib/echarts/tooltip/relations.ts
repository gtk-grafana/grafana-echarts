import { type Field, fieldReducers, type GrafanaTheme2, type ValueFormatter } from '@grafana/data';
import { type TopLevelFormatterParams } from 'echarts/types/dist/shared';
import { type EChartsRelationsFieldConfig } from 'editor/types';
import {
  ENDPOINT_LABEL_KEYS,
  type GraphEndpointKeys,
  normalizeRelationsCalcs,
  SOURCE_LABEL,
  TARGET_LABEL,
} from 'lib/echarts/converters/graphWide';
import { type MarkStat, type NodeGraphData } from 'lib/echarts/converters/relationsModel';
import { formatEChartsValue, getValueFormatter } from 'lib/echarts/style';
import {
  type NodeFilterLabels,
  type RelationsAdjacentEdge,
  type RelationsLinkItem,
  type RelationsMark,
  type RelationsMarks,
  type RelationsNodeItem,
  type TooltipAdHocFilter,
  type TooltipFilters,
  type TooltipModel,
  type TooltipRow,
} from 'lib/echarts/tooltip/types';
import { type PanelOptions } from 'types';

/**
 * How a mark with **no field of its own** formats: plainly, with no unit.
 *
 * A safety net rather than a path with traffic. A node derived from an edge's endpoints is
 * the only mark that can reach it, and one now carries no stat at all — no value, no row —
 * so the tooltip omits the row and the node label stays one line before this is consulted.
 *
 * It stays because the alternative fallback is actively wrong: the panel-level formatter is
 * `getRepresentativeFormatter`, the first numeric field of the first frame, which is the
 * "unit decided by frame order" rule the field contract exists to remove. Measured on the
 * proof dashboard when derived nodes still carried their degree — with a `ms` override on
 * the first edge, every one of them read `2 ms`.
 */
export const formatDerivedMarkValue: ValueFormatter = (value) => ({ text: String(value) });

/**
 * The label a stat row carries when no reducer named it.
 *
 * Only reachable on the one path that does not come from a reducer at all: the
 * `secondarystat` label the row-form conversion carries, where an instant response has no
 * second value to reduce and so no calculation to name. See `secondaryStatsOf`.
 */
const SECONDARY_ROW_LABEL = 'Secondary';

/**
 * A stat row's label: the **reducer's** display name (`Mean`, `Min`, `Last *`), not the
 * word "Value".
 *
 * Every stat slot is a reducer the user picked from the panel's Calculation setting, so
 * labelling them `Value` and `Secondary` threw away the one thing the row does not otherwise
 * say. Rows reading `Mean`, `Min` and `Max` are self-describing; rows reading `Value` and
 * `Secondary` need the options pane to decode. Falls back to the raw id for a reducer the
 * registry does not know, which is the same reading the pie's centre readout and the table
 * legend give it.
 */
function reducerLabel(calc: string): string {
  return fieldReducers.getIfExists(calc)?.name ?? calc;
}

/**
 * A mark's stats past the first, one row each, shared by the node and edge branches so one
 * "Calculation" setting reads the same on both.
 *
 * **One row per reducer, with no cap.** `calcs[0]` is the main stat and is singular because
 * it is the number that sizes a node and weighs an edge; everything after it is a tooltip row
 * and nothing else, so a third or fourth calculation has somewhere to go. Picking one used to
 * be silently discarded by the reader and clamped away by the editor.
 *
 * The reader already formatted each value through the mark's own display processor
 * (`secondaryStatsOf`) and kept the reducer that produced it, so this is only the labelling.
 */
function secondaryRows(secondaries: MarkStat[] | undefined): TooltipRow[] {
  return (secondaries ?? []).map((stat) => ({
    label: stat.calc != null ? reducerLabel(stat.calc) : SECONDARY_ROW_LABEL,
    value: stat.value,
  }));
}

/**
 * A `graph` series emits both node and link hovers through one formatter, so the
 * model has to tell them apart. ECharts sets `dataType` to `'node'` or `'edge'` on
 * the callback params for graph-like series, which is the documented discriminator.
 * https://echarts.apache.org/en/option.html#series-graph.tooltip
 */
function isLinkItem(value: unknown): value is RelationsLinkItem {
  return typeof value === 'object' && value !== null && 'source' in value && 'target' in value;
}

function isNodeItem(value: unknown): value is RelationsNodeItem {
  return typeof value === 'object' && value !== null && 'id' in value && !isLinkItem(value);
}

/** A mark that has a field of its own; a derived node has neither and is skipped. */
type FieldedMark = {
  id: string;
  markKey?: string;
  field?: Field;
  sourceRowIndex?: number;
  /** Edges only — see {@link RelationsMark.filterLabels}. */
  filterLabels?: GraphEndpointKeys;
};

/**
 * Keyed by `markKey ?? id`, which is the same expression the three render variants put on
 * each item's `markId`.
 *
 * The fallback is the normal case and keeps the readable name in the item. `markKey` only
 * exists when the reader collected several marks sharing one `field.name` — N raw frames
 * whose value field is called `Value` — and without it this map would be last-write-wins,
 * so every one of those edges would format with the last one's unit and surface its
 * `config.links`. That is precisely the "the tooltip formats with somebody else's field"
 * bug the per-mark lookup exists to kill. Nodes never carry one: node ids are the ECharts
 * graph keys and are unique by construction.
 */
function toMarkMap(marks: FieldedMark[], theme: GrafanaTheme2, timeZone?: string): Map<string, RelationsMark> {
  const byKey = new Map<string, RelationsMark>();
  for (const { id, markKey, field, sourceRowIndex, filterLabels } of marks) {
    if (field != null) {
      byKey.set(markKey ?? id, {
        formatValue: getValueFormatter(field, theme, timeZone),
        // A wide frame reduces to a single row, so the row is the mark's own `0`;
        // the fallback only matters for a fixture that omitted it.
        source: { field, rowIndex: sourceRowIndex ?? 0 },
        ...(filterLabels ? { filterLabels } : {}),
      });
    }
  }
  return byKey;
}

/**
 * How many edges a statless node's tooltip lists before it stops counting.
 *
 * A cap rather than a scroll because the relations tooltip is a Single-mode tooltip:
 * `isTooltipScrollable` only scrolls in Multi mode with a `maxHeight` set, so an uncapped
 * list would run a hub node's tooltip off the screen with no way to reach its end. Ten rows
 * fill the box and still fit beside the cursor.
 */
const MAX_ADJACENT_EDGE_ROWS = 10;

/**
 * The edges touching each node with no stat of its own, keyed by node id.
 *
 * Built from the *visible* model — `getVisibleNodeGraph` has already dropped hidden marks
 * and their orphaned links — and in the model's own link order, which is the response's
 * field order. Deliberately **not** sorted by weight: each edge is a field with its own
 * unit under the wide contract, so ranking a `3.5 s` edge against a `25%` one compares two
 * different measurements and the "biggest" edge would be an artefact of the units.
 *
 * Only statless nodes get an entry. That is the case the list exists for, and it keeps the
 * work proportional to those nodes rather than formatting every edge twice per render.
 */
function toAdjacency(
  data: NodeGraphData,
  links: ReadonlyMap<string, RelationsMark>
): Map<string, RelationsAdjacentEdge[]> {
  const byNode = new Map<string, RelationsAdjacentEdge[]>();
  const statless = new Set(data.nodes.filter((node) => node.value == null).map((node) => node.id));
  if (statless.size === 0) {
    return byNode;
  }
  // The endpoints are ids; a declared node's `displayName` makes its name a different
  // string, and the row should read the same as the node's own header.
  const names = new Map(data.nodes.map((node) => [node.id, node.name]));

  for (const link of data.links) {
    // The edge's own field formats its weight, exactly as the edge's own tooltip does —
    // keyed the same way (`markKey ?? id`), so parallel edges keep their separate units.
    const mark = links.get(link.markKey ?? link.id);
    const value = formatEChartsValue(link.value ?? null, mark?.formatValue ?? formatDerivedMarkValue);

    const ends = [{ id: link.source, other: link.target, outgoing: true }];
    // A self-loop is one edge. Listing it under both directions would print it twice.
    if (link.target !== link.source) {
      ends.push({ id: link.target, other: link.source, outgoing: false });
    }
    for (const { id, other, outgoing } of ends) {
      if (!statless.has(id)) {
        continue;
      }
      const rows = byNode.get(id) ?? [];
      rows.push({ node: names.get(other) ?? other, outgoing, value });
      byNode.set(id, rows);
    }
  }
  return byNode;
}

/**
 * A statless node's edges, one row each: `→ other` for an edge leaving the node,
 * `other →` for one arriving.
 *
 * The arrow carries the direction because the node's own name is already the header, so
 * repeating it on every row (`gateway → api`) would spend the tooltip's width restating what
 * the user hovered. The overflow row is labelled rather than valued: `VizTooltipRow` renders
 * the label in the muted secondary colour, which is what a count of unshown rows is.
 */
function adjacencyRows(edges: RelationsAdjacentEdge[]): TooltipRow[] {
  const rows: TooltipRow[] = edges
    .slice(0, MAX_ADJACENT_EDGE_ROWS)
    .map((edge) => ({ label: edge.outgoing ? `→ ${edge.node}` : `${edge.node} →`, value: edge.value }));
  const remaining = edges.length - rows.length;
  if (remaining > 0) {
    rows.push({ label: `+${remaining} more`, value: '' });
  }
  return rows;
}

/**
 * Each mark's own display processor and link source, built once per render.
 *
 * This is what closes "tooltip unit decided by frame order" and gaps 1-3 of
 * `todo/relations-data-links.md` at the same time, because both had the same cause:
 * the tooltip resolved *one* field for the whole series (the frame's first numeric
 * column), so every node formatted with that field's unit and surfaced that field's
 * links. A mark is a field now, so each one answers for itself — two nodes can carry
 * different units, and a `byName` `links` override paints a link on exactly one node.
 */
export function getRelationsTooltipMarks(data: NodeGraphData, theme: GrafanaTheme2, timeZone?: string): RelationsMarks {
  const links = toMarkMap(data.links, theme, timeZone);
  return {
    nodes: toMarkMap(data.nodes, theme, timeZone),
    links,
    adjacency: toAdjacency(data, links),
    nodeFilterLabels: toNodeFilterLabels(data),
    endpointsFilterable: data.links.some((link) => link.field?.config.filterable === true),
    ...(data.endpointLabels ? { endpointLabels: data.endpointLabels } : {}),
  };
}

/**
 * The keys each node is an endpoint under, from the edges touching it — see
 * {@link RelationsMarks.nodeFilterLabels}.
 *
 * The same walk over `data.links` {@link toAdjacency} does, and for the same reason: an edge
 * is the only mark that carries an endpoint *pair*, so anything a node needs to know about
 * its own endpoints has to be collected from its incidence. Each edge's pair is resolved
 * exactly as the edge's own tooltip resolves it, so a node and the edges around it can never
 * disagree about which label the topology lives under.
 *
 * Deduped per role, keeping first-appearance order: a namespace node whose two incident
 * edges both say `namespace` is one key, not two, and the first is still the one
 * "Filter on this value" asserts.
 */
function toNodeFilterLabels(data: NodeGraphData): Map<string, NodeFilterLabels> {
  /** The four roles a node can hold a key in: its own two, and the far end of each. */
  interface Roles {
    sources: string[];
    targets: string[];
    /** Target keys of the pairs it is a *source* of — its missing target role. */
    farTargets: string[];
    /** Source keys of the pairs it is a *target* of — its missing source role. */
    farSources: string[];
  }
  const roles = new Map<string, Roles>();
  const entry = (id: string): Roles => {
    const existing = roles.get(id);
    if (existing) {
      return existing;
    }
    const created: Roles = { sources: [], targets: [], farTargets: [], farSources: [] };
    roles.set(id, created);
    return created;
  };
  const push = (keys: string[], key: string): void => {
    if (!keys.includes(key)) {
      keys.push(key);
    }
  };

  for (const link of data.links) {
    const keys = relationsFilterLabels(link.field, link.filterLabels ?? data.endpointLabels);
    const source = entry(link.source);
    push(source.sources, keys.source);
    push(source.farTargets, keys.target);
    const target = entry(link.target);
    push(target.targets, keys.target);
    push(target.farSources, keys.source);
  }

  const byNode = new Map<string, NodeFilterLabels>();
  for (const [id, { sources, targets, farTargets, farSources }] of roles) {
    // A role the node does not play is filled from the far end of the pairs it is on — see
    // `NodeFilterLabels.negate` for why the negation cannot just skip it.
    const negate = [...(sources.length > 0 ? sources : farSources)];
    for (const key of targets.length > 0 ? targets : farTargets) {
      push(negate, key);
    }
    byNode.set(id, { sources, targets, negate });
  }
  return byNode;
}

/**
 * The two label keys **this mark's** endpoints are offered under as ad-hoc filters.
 *
 * The contract's own `source` / `target` is what the *frame* carries, and it is a **topology
 * carrier** rather than necessarily a dimension the datasource has ever heard of. A "Filter
 * for" built from the frame adds `source="web-api"` to the dashboard, and a datasource whose
 * metric is labelled `client`/`server` returns nothing.
 *
 * Three sources, most specific first:
 *
 * 1. the mark's own `custom.sourceFilterLabel` / `custom.targetFilterLabel` — **deprecated**,
 *    override-only, and set by nothing in this repo; see `addRelationsFilterConfig`. It is
 *    still first because it is explicit intent, and a dashboard that set it must keep
 *    working while it exists. It was the last resort for a query that really *destroyed* the
 *    original key — `sum by (source, target) (label_replace(…, "source", "$1", "client",
 *    "(.*)"))` renames the label and then aggregates the original away — but keeping that
 *    original in the outer aggregation is both easier and more correct, so 2 has taken over
 *    every use;
 * 2. `fromData`, what the response said about **this** mark: the edge's own recovered or
 *    declared pair (`RelationLink.filterLabels`), else the response-wide
 *    `RelationsMarks.endpointLabels`. This is what makes the setting unnecessary for
 *    almost every query — `sum by (client, server)` draws and filters with nothing
 *    configured, and `sum by (source, target, cluster, namespace)` recovers `cluster` /
 *    `namespace` per edge, which is the only route a multi-level flow has;
 * 3. the contract's canonical pair, which is also the right answer for a response that
 *    really did group by `source`/`target`.
 *
 * Resolved per mark rather than once per render, twice over: two marks can carry different
 * overrides, and — since the recovery is per edge — two marks of the *same frame* can
 * answer differently with nothing configured at all. The second is now the only one that
 * happens: it is what retired 1, since a multi-level flow's levels relabel from different
 * originals and one configured pair is wrong for all but one of them.
 *
 * Each half resolves independently, so half a (deprecated) override is honoured on the half
 * it names and the other half still comes off the response.
 */
export function relationsFilterLabels(
  field?: Field,
  fromData?: GraphEndpointKeys
): {
  source: string;
  target: string;
} {
  return {
    source: customFilterLabel(field, 'sourceFilterLabel') ?? fromData?.source ?? SOURCE_LABEL,
    target: customFilterLabel(field, 'targetFilterLabel') ?? fromData?.target ?? TARGET_LABEL,
  };
}

/**
 * One of the mark's two filter-label keys, read defensively: `FieldConfig['custom']` is
 * `any`, and these keys are plugin-declared rather than guaranteed by any type — the same
 * narrowing `customOf` does in the reader. An empty string is "unset", which is what
 * clearing the text input leaves behind.
 */
function customFilterLabel(
  field: Field | undefined,
  key: keyof Pick<EChartsRelationsFieldConfig, 'sourceFilterLabel' | 'targetFilterLabel'>
): string | undefined {
  const custom: unknown = field?.config.custom;
  if (typeof custom !== 'object' || custom === null || !(key in custom)) {
    return undefined;
  }
  const value: unknown = Reflect.get(custom, key);
  return typeof value === 'string' && value !== '' ? value : undefined;
}

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
function markFilterable(mark: RelationsMark | undefined, marks: RelationsMarks | undefined): boolean {
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
function edgeFilters(
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
function nodeFilters(
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

/**
 * Tooltip content model for the relations series, rendered by the React overlay
 * (`EChartsTooltip`).
 *
 * A relations hover is always a single node or a single link — there is no shared
 * axis pointer — so this is built in the series formatter rather than via an
 * axis-triggered tooltip, matching the hierarchy and pie families.
 *
 * - **Node**: name as header; the main stat, plus `Subtitle` and secondary rows when
 *   present. A node with **no** stat lists the edges touching it instead, each with that
 *   edge's own weight — see {@link adjacencyRows}.
 * - **Link**: `source → target` as header; the resolved weight as the stat row.
 *
 * Each stat row is labelled with the **reducer** that produced it rather than with
 * `Value` / `Secondary` — see {@link reducerLabel}, and `reduceOptions` for where the
 * two come from.
 *
 * Values format with the **hovered mark's own** field, and the footer resolves that
 * field's data links; see {@link getRelationsTooltipMarks}. A node derived from an
 * edge's endpoints has no field, so it formats through {@link formatDerivedMarkValue}
 * and surfaces no data links — `todo/relations-data-links.md` gap 4, which the contract
 * does not close, and which the derived-node pre-pass closes instead
 * (`docs/relations-derived-nodes.md`). Its **filters** it does get: they come off the item's
 * own endpoints rather than off a field, and their `filterable` opt-in comes off the edges
 * that named it — see {@link nodeFilters} and {@link markFilterable}. Having no field it has
 * no stat either, so its rows are its edges.
 *
 * The endpoint keys the filters are written under come off the hovered mark as well —
 * see {@link relationsFilterLabels}.
 */
export function buildRelationsTooltipModel(
  marks?: RelationsMarks,
  options?: PanelOptions
): (params: TopLevelFormatterParams) => TooltipModel {
  // Resolved once per render rather than per hover: the same reducer names the main row on
  // every mark, and this is the same normalization the reader reduced them with. The rows
  // after it name themselves — each carries the reducer that produced it (`MarkStat`), so a
  // calc that reduces to nothing on one mark cannot shift the labels below it on the next.
  const [calc] = normalizeRelationsCalcs(options?.reduceOptions);
  const statLabel = reducerLabel(calc);

  return (params) => {
    const param = Array.isArray(params) ? params[0] : params;
    const data: unknown = param?.data;
    const color = typeof param?.color === 'string' ? param.color : undefined;

    if (isLinkItem(data)) {
      // The edge's own field: its unit formats the weight and its `config.links`
      // fill the footer. Keyed by `markId` because two parallel edges share their
      // endpoints — see `RelationsLinkItem.markId`.
      const mark = data.markId != null ? marks?.links.get(data.markId) : undefined;
      const rows: TooltipRow[] = [
        {
          color,
          label: statLabel,
          value: formatEChartsValue(data.value ?? null, mark?.formatValue ?? formatDerivedMarkValue),
          source: mark?.source,
        },
      ];
      // An edge reduces over every picked calculation just as a node does, so `calcs[1..]`
      // report here too — the same rows, formatted the same way. See `secondaryStatsOf`.
      rows.push(...secondaryRows(data.secondaries));
      return {
        header: { label: `${data.source} → ${data.target}`, value: '' },
        rows,
        source: mark?.source,
        ...(markFilterable(mark, marks)
          ? {
              filters: edgeFilters(
                data,
                mark,
                // The edge's *own* recovered pair first: two edges of one frame can filter
                // under different keys, which is what a multi-level flow is. See
                // `relationsFilterLabels`.
                relationsFilterLabels(mark?.source.field, mark?.filterLabels ?? marks?.endpointLabels)
              ),
            }
          : {}),
      };
    }

    const node = isNodeItem(data) ? data : undefined;
    const mark = node != null ? marks?.nodes.get(node.id) : undefined;

    // `stat` first: the sankey and chord variants carry the main stat there rather than
    // in `value`, which they leave to ECharts' flow computation. See `RelationsNodeItem`.
    const stat = node?.stat ?? node?.value ?? null;

    const rows: TooltipRow[] = [];
    // No stat, no row. A node the response only implied has nothing to report
    // (`converters/deriveNodes.ts`), and rendering the field's empty-value text under a
    // `Value` label would read as a measurement that failed rather than one that was never
    // asked for. The header, the subtitle and the data-link footer all still render.
    if (stat != null) {
      rows.push({
        color,
        label: statLabel,
        value: formatEChartsValue(stat, mark?.formatValue ?? formatDerivedMarkValue),
        source: mark?.source,
      });
    }
    if (node?.subtitle != null) {
      rows.push({ label: 'Subtitle', value: node.subtitle });
    }
    rows.push(...secondaryRows(node?.secondaries));
    // No stat of its own, so report what the node *does* know: the edges touching it, with
    // each edge's own weight. A derived node carries `null` by design, so without this its
    // tooltip was its name and nothing else — see `RelationsAdjacentEdge`. Last, so a node
    // that has a subtitle or a `secondarystat` still leads with those.
    if (stat == null && node != null) {
      rows.push(...adjacencyRows(marks?.adjacency?.get(node.id) ?? []));
    }

    return {
      header: { label: node?.name ?? String(param?.name ?? ''), value: '' },
      rows,
      source: mark?.source,
      // Only for something that really is a node item: the formatter also fields the
      // odd hover that carries no recognisable item at all, and a filter on nothing
      // would be a button that adds `source=""`.
      ...(node != null && markFilterable(mark, marks)
        ? {
            filters: nodeFilters(
              node,
              mark,
              relationsFilterLabels(mark?.source.field, marks?.endpointLabels),
              marks?.nodeFilterLabels?.get(node.id)
            ),
          }
        : {}),
    };
  };
}
