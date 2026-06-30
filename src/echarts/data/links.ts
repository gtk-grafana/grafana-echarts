import { DataFrame, Field, FieldType, LinkModel } from '@grafana/data';
import { TooltipItemRef } from 'echarts/tooltip';
import { collectTimeSeriesFields, findCategoricalFrame } from 'echarts/converters/frames';

/** Resolves data links for hovered tooltip points (used when pinned). */
export type TooltipLinkResolver = (refs: TooltipItemRef[]) => Array<LinkModel<Field>>;

/** Stable resolver that returns no data links */
// @todo fix heatmap tooltip links and delete this
export const NO_LINKS = (): Array<LinkModel<Field>> => [];

/**
 * Resolve data links for a set of (field, row) points.
 */
export function collectDataLinks(points: Array<{ field?: Field; rowIndex: number }>): Array<LinkModel<Field>> {
  const links: Array<LinkModel<Field>> = [];

  for (const { field, rowIndex } of points) {
    if (!field?.getLinks) {
      continue;
    }
    for (const link of field.getLinks({ valueRowIndex: rowIndex })) {

      links.push(link);
    }
  }

  return links;
}

export function resolveTimeSeriesLinks(series: Field[]) {
  return (refs: TooltipItemRef[]) =>
    collectDataLinks(refs.map((ref) => ({ field: series[ref.seriesIndex], rowIndex: ref.rowIndex })));
}

export function resolveCategoricalLinks(series: DataFrame[]) {
  const frame = findCategoricalFrame(series);
  const numericFields = frame ? frame.fields.filter((field) => field.type === FieldType.number) : [];
  return (refs: TooltipItemRef[]) =>
    collectDataLinks(refs.map((ref) => ({ field: numericFields[ref.rowIndex], rowIndex: ref.rowIndex })));
}

export function resolveLinksFromFrames(frames: DataFrame[], kind: 'cartesian' | 'pie' | 'radar' | 'heatmap') {
  if (kind === 'heatmap') {
    return resolveTimeSeriesLinks(collectTimeSeriesFields(frames));
  }
  if (kind === 'cartesian') {
    return resolveTimeSeriesLinks(collectTimeSeriesFields(frames));
  }
  if (kind === 'radar' || kind === 'pie') {
    return resolveCategoricalLinks(frames);
  }

  throw new Error('link format not implemented!')
}
