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

/** The label a stat row carries when no reducer named it. */
const SECONDARY_ROW_LABEL = 'Secondary';

/** A stat row's label: the reducer's display name (`Mean`, `Min`, `Last *`), not the word "Value". */
function reducerLabel(calc: string): string {
  return fieldReducers.getIfExists(calc)?.name ?? calc;
}

/** The main stat's label when no reducer produced it. */
const VALUE_ROW_LABEL = 'Value';

/** Build rows for calculations after the first one. */
function secondaryRows(secondaries: MarkStat[] | undefined): TooltipRow[] {
  return (secondaries ?? []).map((stat) => ({
    label: stat.calc != null ? reducerLabel(stat.calc) : SECONDARY_ROW_LABEL,
    value: stat.value,
  }));
}

/** Tooltip content model for the relations series, rendered by the React overlay (`EChartsTooltip`). */
export function buildRelationsTooltipModel(
  marks?: RelationsMarks,
  options?: PanelOptions
): (params: TopLevelFormatterParams) => TooltipModel {
  // The time slider reads raw values, so it does not name a reducer.
  const [calc] = normalizeRelationsCalcs(options?.reduceOptions);
  const statLabel = options != null && resolveRelationsTimeSlider(options) ? VALUE_ROW_LABEL : reducerLabel(calc);

  return (params) => {
    const param = Array.isArray(params) ? params[0] : params;
    const data: unknown = param?.data;
    const color = typeof param?.color === 'string' ? param.color : undefined;

    if (isLinkItem(data)) {
      // `markId` distinguishes parallel edges that share endpoints.
      const mark = data.markId != null ? marks?.links.get(data.markId) : undefined;
      const rows: TooltipRow[] = [
        {
          color,
          label: statLabel,
          value: formatEChartsValue(data.value ?? null, mark?.formatValue ?? formatDerivedMarkValue),
          source: mark?.source,
        },
      ];
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
                // Prefer labels recovered for this edge.
                relationsFilterLabels(mark?.source.field, mark?.filterLabels ?? marks?.endpointLabels)
              ),
            }
          : {}),
      };
    }

    const node = isNodeItem(data) ? data : undefined;
    const mark = node != null ? marks?.nodes.get(node.id) : undefined;

    // Sankey and chord reserve `value` for flow calculations.
    const stat = node?.stat ?? node?.value ?? null;

    const rows: TooltipRow[] = [];
    // Derived nodes have no stat row.
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
    // Show adjacent edges after the node's own rows.
    if (node != null) {
      rows.push(...adjacencyRows(marks?.adjacency?.get(node.id) ?? []));
    }

    return {
      header: { label: node?.name ?? String(param?.name ?? ''), value: '' },
      rows,
      source: mark?.source,
      // Do not create filters for an unknown hover item.
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
