import { type Field, fieldReducers, type GrafanaTheme2, type ValueFormatter } from '@grafana/data';
import { type TopLevelFormatterParams } from 'echarts/types/dist/shared';
import {
  ENDPOINT_LABEL_PAIRS,
  type GraphEndpointKeys,
  normalizeRelationsCalcs,
  SOURCE_LABEL,
  TARGET_LABEL,
} from 'lib/echarts/converters/graphWide';
import { type MarkStat, type NodeGraphData } from 'lib/echarts/converters/relationsModel';
import { formatEChartsValue, getValueFormatter } from 'lib/echarts/style';
import {
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
type FieldedMark = { id: string; markKey?: string; field?: Field; sourceRowIndex?: number };

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
  for (const { id, markKey, field, sourceRowIndex } of marks) {
    if (field != null) {
      byKey.set(markKey ?? id, {
        formatValue: getValueFormatter(field, theme, timeZone),
        // A wide frame reduces to a single row, so the row is the mark's own `0`;
        // the fallback only matters for a fixture that omitted it.
        source: { field, rowIndex: sourceRowIndex ?? 0 },
      });
    }
  }
  return byKey;
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
  return {
    nodes: toMarkMap(data.nodes, theme, timeZone),
    links: toMarkMap(data.links, theme, timeZone),
    ...(data.endpointLabels ? { endpointLabels: data.endpointLabels } : {}),
  };
}

/**
 * The two label keys a mark's endpoints are offered under as ad-hoc filters.
 *
 * The contract's own `source` / `target` is what the *frame* carries, and it is a **topology
 * carrier** rather than necessarily a dimension the datasource has ever heard of. A "Filter
 * for" built from the frame adds `source="web-api"` to the dashboard, and a datasource whose
 * metric is labelled `client`/`server` returns nothing.
 *
 * Three sources, most specific first:
 *
 * 1. the panel's own `relationsSourceFilterLabel` / `relationsTargetFilterLabel`. Explicit
 *    intent wins, and it is the only answer for a query that *destroyed* the original key —
 *    `sum by (source, target) (label_replace(…, "source", "$1", "client", "(.*)"))` renames
 *    the label and then aggregates the original away, so no response can recover it;
 * 2. `endpointLabels`, the pair the response itself carried — either still on the edge
 *    fields, or declared by the pivot that rewrote them (`GRAPH_META_CUSTOM`). This is
 *    what makes the setting unnecessary for the query that *doesn't* destroy the key:
 *    `sum by (client, server)` now draws, and filters, with nothing configured;
 * 3. the contract's canonical pair, which is also the right answer for a response that
 *    really did group by `source`/`target`.
 */
export function relationsFilterLabels(
  options?: Pick<PanelOptions, 'relationsSourceFilterLabel' | 'relationsTargetFilterLabel'>,
  fromData?: GraphEndpointKeys
): {
  source: string;
  target: string;
} {
  return {
    source: options?.relationsSourceFilterLabel || fromData?.source || SOURCE_LABEL,
    target: options?.relationsTargetFilterLabel || fromData?.target || TARGET_LABEL,
  };
}

/** Keep the first entry per key, preserving order — the endpoints are added first. */
function dedupeFilters(filters: TooltipAdHocFilter[]): TooltipAdHocFilter[] {
  const seen = new Set<string>();
  return filters.filter((filter) => {
    const id = `${filter.key} ${filter.value}`;
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
 */
function extraLabelFilters(field: Field | undefined): TooltipAdHocFilter[] {
  return Object.entries(field?.labels ?? {})
    .filter(([key]) => !ENDPOINT_LABEL_KEYS.has(key))
    .map(([key, value]) => ({ key, value }));
}

/**
 * Every key any recognised pair uses as an endpoint, so a mark's *other* labels can be told
 * apart from its topology whichever pair the response carried.
 */
const ENDPOINT_LABEL_KEYS = new Set(ENDPOINT_LABEL_PAIRS.flatMap((pair) => [pair.source, pair.target]));

/**
 * The filters a hovered **edge** offers.
 *
 * The endpoints go in the *grouped* pair rather than one button each, because an edge **is**
 * the conjunction of its two endpoints: "Filter on this value" then narrows the dashboard to
 * exactly this edge, and "Filter out this value" excludes it. Offering them individually as
 * well — which is what produced four buttons for a two-label mark — adds nothing the node's
 * own tooltip does not already offer, and reads as three ways to do one thing.
 *
 * Endpoints come off the *item* rather than off the field, so an edge whose mark has no
 * field — an N-raw-frames response on a host that cannot run the pivot — still offers them.
 */
function edgeFilters(
  item: RelationsLinkItem,
  mark: RelationsMark | undefined,
  keys: { source: string; target: string }
): TooltipFilters {
  const extra = dedupeFilters(extraLabelFilters(mark?.source.field));
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
 * label — so the generic "walk `field.labels`" derivation finds nothing, and a node *derived*
 * from an edge's endpoints has no field to walk. Both are the marks a topology is most
 * obviously filtered by.
 *
 * **The two halves are deliberately asymmetric**, because a node is an endpoint in both
 * directions and ad-hoc filters can only be ANDed:
 *
 * - "Filter out this value" negates **both** keys, which is exactly "everything that does not
 *   touch this node" — the useful reading, and the one a user means by hiding a node;
 * - "Filter on this value" asserts the **source** key alone, i.e. this node's outgoing edges.
 *   Asserting both would be `source=x AND target=x` — self-loops, which is nobody's question.
 *   There is no ad-hoc filter for "either endpoint", so the panel offers the direction it can
 *   express rather than a button that returns an empty dashboard.
 *
 * `each` carries only the node's non-endpoint labels: the two endpoint directions cannot go
 * there, since `VizTooltipFooter` labels those buttons by value alone and both would read
 * "Filter for '&lt;node&gt;'". That pair of identical buttons is the reported duplication.
 */
function nodeFilters(
  item: RelationsNodeItem,
  mark: RelationsMark | undefined,
  keys: { source: string; target: string }
): TooltipFilters {
  const extra = dedupeFilters(extraLabelFilters(mark?.source.field));
  return {
    each: extra,
    filterFor: dedupeFilters([{ key: keys.source, value: item.id }, ...extra]),
    filterOut: dedupeFilters([{ key: keys.source, value: item.id }, { key: keys.target, value: item.id }, ...extra]),
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
 *   present.
 * - **Link**: `source → target` as header; the resolved weight as the stat row.
 *
 * Each stat row is labelled with the **reducer** that produced it rather than with
 * `Value` / `Secondary` — see {@link reducerLabel}, and `reduceOptions` for where the
 * two come from.
 *
 * Values format with the **hovered mark's own** field, and the footer resolves that
 * field's data links; see {@link getRelationsTooltipMarks}. A node derived from an
 * edge's endpoints has no field, so it formats through {@link formatDerivedMarkValue}
 * and shows no footer — `todo/relations-data-links.md` gap 4, which the contract does
 * not close. Its **filters** it does get, though: they come off the item's own
 * endpoints rather than off a field. See {@link nodeFilters}.
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
  const filterKeys = relationsFilterLabels(options, marks?.endpointLabels);

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
        filters: edgeFilters(data, mark, filterKeys),
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

    return {
      header: { label: node?.name ?? String(param?.name ?? ''), value: '' },
      rows,
      source: mark?.source,
      // Only for something that really is a node item: the formatter also fields the
      // odd hover that carries no recognisable item at all, and a filter on nothing
      // would be a button that adds `source=""`.
      ...(node != null ? { filters: nodeFilters(node, mark, filterKeys) } : {}),
    };
  };
}
