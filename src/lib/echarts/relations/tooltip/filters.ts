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

/** Check whether a mark can create ad hoc filters. */
export function markFilterable(mark: RelationsMark | undefined, marks: RelationsMarks | undefined): boolean {
  return mark != null ? mark.source.field.config.filterable === true : marks?.endpointsFilterable === true;
}

/** Keep the first unique filter and preserve order. */
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

/** A mark's own labels except its endpoints. */
function extraLabelFilters(field: Field | undefined, keys: GraphEndpointKeys): TooltipAdHocFilter[] {
  return Object.entries(field?.labels ?? {})
    .filter(([key]) => !ENDPOINT_LABEL_KEYS.has(key) && key !== keys.source && key !== keys.target)
    .map(([key, value]) => ({ key, value }));
}

/** The filters a hovered edge offers. */
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

/** The filters a hovered node offers. */
export function nodeFilters(
  item: RelationsNodeItem,
  mark: RelationsMark | undefined,
  keys: GraphEndpointKeys,
  incidence: NodeFilterLabels | undefined
): TooltipFilters {
  const field = mark?.source.field;
  const extra = dedupeFilters(extraLabelFilters(field, keys));
  // Node overrides take precedence over edge-derived labels.
  const configured =
    customFilterLabel(field, 'sourceFilterLabel') != null || customFilterLabel(field, 'targetFilterLabel') != null;
  const fromEdges =
    !configured && incidence != null && (incidence.sources.length > 0 || incidence.targets.length > 0)
      ? incidence
      : undefined;
  const key = fromEdges ? (fromEdges.sources[0] ?? fromEdges.targets[0] ?? keys.source) : keys.source;
  const whole = dedupeFilters([{ key, value: item.id }, ...extra]);

  return {
    each: extra,
    filterFor: whole,
    filterOut: whole,
  };
}
