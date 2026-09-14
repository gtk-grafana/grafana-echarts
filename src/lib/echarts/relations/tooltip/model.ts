import { fieldReducers } from '@grafana/data';
import { type TopLevelFormatterParams } from 'echarts/types/dist/shared';
import { normalizeRelationsCalcs } from 'lib/echarts/relations/converters/markRead';
import { type MarkStat } from 'lib/echarts/relations/converters/model';
import { resolveRelationsTimeSlider } from 'lib/echarts/relations/options/timeSlider';
import { edgeFilters, markFilterable, nodeFilters } from 'lib/echarts/relations/tooltip/filters';
import {
  adjacencyRows,
  formatDerivedMarkValue,
  isLinkItem,
  isNodeItem,
  relationsFilterLabels,
} from 'lib/echarts/relations/tooltip/marks';
import { type RelationsMarks } from 'lib/echarts/relations/tooltip/types';
import { formatEChartsValue } from 'lib/echarts/style';
import { type TooltipModel, type TooltipRow } from 'lib/echarts/tooltip/types';
import { type PanelOptions } from 'types';

/**
 * Building the `TooltipModel` the React overlay renders for a hovered relations mark:
 * its header, its stat rows, its adjacency table and its filter footer.
 *
 * The top of the family's tooltip stack — it reads the mark out of `marks.ts` and the
 * footer's buttons out of `filters.ts`.
 */

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
 * The main stat's label when **no reducer produced it** — the time slider's reading, where
 * the value is the one sample at the selected timestamp.
 *
 * `Last *` under a slider would name a calculation the panel did not run and the user
 * cannot see a control for — the switch hides the picker precisely because at one row there
 * is nothing to reduce. `Value` is what core's tooltips call an unnamed measurement.
 */
const VALUE_ROW_LABEL = 'Value';

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
 * two come from. Under the time slider no reducer ran, and the main row is labelled
 * `Value` — see {@link VALUE_ROW_LABEL}.
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
  //
  // Under the time slider no reducer ran, so none is named — see {@link VALUE_ROW_LABEL}.
  // Keyed on the switch rather than on whether a stop is selected, so the label does not
  // flicker between `Value` and `Last *` as a refresh takes the timeline away: the switch
  // is also what hides the picker, and the two must agree.
  const [calc] = normalizeRelationsCalcs(options?.reduceOptions);
  const statLabel = options != null && resolveRelationsTimeSlider(options) ? VALUE_ROW_LABEL : reducerLabel(calc);

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
    // The edges touching the node, with each edge's own weight — **last**, and for every
    // node rather than only the statless ones.
    //
    // The list started as the answer to a derived node's empty tooltip: a node the response
    // only implied carries `null` by design (`converters/deriveNodes.ts`), so without it the
    // tooltip was a name and nothing else. Withholding it from a node that *does* measure
    // something was the wrong half of that: the two are different facts, and a node hover on
    // a topology is a fair place to ask "and what is it connected to". So the node's own
    // measurement leads, the subtitle and the extra reducers follow, and the edges come
    // after — nothing the node says about itself is displaced by them.
    if (node != null) {
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
