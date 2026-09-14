import { type Field, type GrafanaTheme2, type ValueFormatter } from '@grafana/data';

import { SOURCE_LABEL, TARGET_LABEL, type GraphEndpointKeys } from 'lib/echarts/relations/converters/contract';
import { type NodeGraphData } from 'lib/echarts/relations/converters/model';
import {
  type NodeFilterLabels,
  type RelationsAdjacentEdge,
  type RelationsLinkItem,
  type RelationsMark,
  type RelationsMarks,
  type RelationsNodeItem,
} from 'lib/echarts/relations/tooltip/types';
import { formatEChartsValue, getValueFormatter } from 'lib/echarts/style';
import { type TooltipRow } from 'lib/echarts/tooltip/types';

import { type EChartsRelationsFieldConfig } from 'editor/relations/types';
/**
 * Building the family's mark model for one render: the per-mark lookup an ECharts hover is
 * resolved through, each mark's own display processor and data links, its adjacency, and
 * the label keys its endpoints are filterable under.
 */

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
 * The edges touching each node, keyed by node id.
 *
 * Built from the *visible* model — `getVisibleNodeGraph` has already dropped hidden marks
 * and their orphaned links — and in the model's own link order, which is the response's
 * field order. Deliberately **not** sorted by weight: each edge is a field with its own
 * unit under the wide contract, so ranking a `3.5 s` edge against a `25%` one compares two
 * different measurements and the "biggest" edge would be an artefact of the units.
 *
 * **Every** node gets an entry, not only the statless ones this started for. A node's own
 * measurement and the edges touching it are different facts, and a node that has both has
 * nothing to gain from the second being withheld — it leads with its own value and the
 * edges follow (`buildRelationsTooltipModel`). The walk is the same either way: one pass
 * over the links, formatting each weight once. What it adds is the row objects, two per
 * link, which is the order of the model itself.
 */
function toAdjacency(
  data: NodeGraphData,
  links: ReadonlyMap<string, RelationsMark>
): Map<string, RelationsAdjacentEdge[]> {
  const byNode = new Map<string, RelationsAdjacentEdge[]>();
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
      const rows = byNode.get(id) ?? [];
      rows.push({ node: names.get(other) ?? other, outgoing, value });
      byNode.set(id, rows);
    }
  }
  return byNode;
}

/**
 * A node's edges, one row each: `→ other` for an edge leaving the node,
 * `other →` for one arriving.
 *
 * The arrow carries the direction because the node's own name is already the header, so
 * repeating it on every row (`gateway → api`) would spend the tooltip's width restating what
 * the user hovered. The overflow row is labelled rather than valued: `VizTooltipRow` renders
 * the label in the muted secondary colour, which is what a count of unshown rows is.
 */
export function adjacencyRows(edges: RelationsAdjacentEdge[]): TooltipRow[] {
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
 * A `graph` series emits both node and link hovers through one formatter, so the
 * model has to tell them apart. ECharts sets `dataType` to `'node'` or `'edge'` on
 * the callback params for graph-like series, which is the documented discriminator.
 * https://echarts.apache.org/en/option.html#series-graph.tooltip
 */
export function isLinkItem(value: unknown): value is RelationsLinkItem {
  return typeof value === 'object' && value !== null && 'source' in value && 'target' in value;
}

export function isNodeItem(value: unknown): value is RelationsNodeItem {
  return typeof value === 'object' && value !== null && 'id' in value && !isLinkItem(value);
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
export function customFilterLabel(
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
