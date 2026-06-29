import { DataFrame, Field, FieldType, LinkModel } from '@grafana/data';
import { TooltipItemRef } from 'echarts/tooltip';
import { collectTimeSeriesFields, findCategoricalFrame } from 'echarts/converters/frames';

/** Resolves data links for hovered tooltip points (used when pinned). */
export type TooltipLinkResolver = (refs: TooltipItemRef[]) => Array<LinkModel<Field>>;

/** Stable resolver that returns no data links (heatmap cells have no per-cell links). */
export const NO_LINKS = (): Array<LinkModel<Field>> => [];

/**
 * Resolve and de-duplicate data links for a set of (field, row) points.
 */
export function collectDataLinks(points: Array<{ field?: Field; rowIndex: number }>): Array<LinkModel<Field>> {
  const links: Array<LinkModel<Field>> = [];
  const seen = new Set<string>();

  for (const { field, rowIndex } of points) {
    if (!field?.getLinks) {
      continue;
    }
    for (const link of field.getLinks({ valueRowIndex: rowIndex })) {
      const key = `${link.title}|${link.href}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      links.push(link);
    }
  }

  return links;
}

export function resolveTimeSeriesLinks(series: Field[]) {
  return (refs: TooltipItemRef[]) =>
    collectDataLinks(refs.map((ref) => ({ field: series[ref.seriesIndex], rowIndex: ref.dataIndex })));
}

export function resolvePieLinks(series: DataFrame[]) {
  const frame = findCategoricalFrame(series);
  const valueField = frame?.fields.find((field) => field.type === FieldType.number);
  return (refs: TooltipItemRef[]) =>
    collectDataLinks(refs.map((ref) => ({ field: valueField, rowIndex: ref.dataIndex })));
}

export function resolveRadarLinks(series: DataFrame[]) {
  const frame = findCategoricalFrame(series);
  const numericFields = frame ? frame.fields.filter((field) => field.type === FieldType.number) : [];
  return (refs: TooltipItemRef[]) =>
    collectDataLinks(refs.map((ref) => ({ field: numericFields[ref.dataIndex], rowIndex: 0 })));
}

export function resolveLinksFromFrames(frames: DataFrame[], kind: 'timeseries' | 'pie' | 'radar' | 'heatmap') {
  if (kind === 'heatmap') {
    return NO_LINKS;
  }
  if (kind === 'timeseries') {
    return resolveTimeSeriesLinks(collectTimeSeriesFields(frames));
  }
  if (kind === 'pie') {
    return resolvePieLinks(frames);
  }
  return resolveRadarLinks(frames);
}
