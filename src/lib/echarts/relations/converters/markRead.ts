import {
  type Field,
  formattedValueToString,
  getFieldColorMode,
  type ReduceDataOptions,
  reduceField,
} from '@grafana/data';
import { RELATIONS_CALC_DEFAULT } from 'editor/relations/constants';
import { SECONDARYSTAT_LABEL } from 'lib/echarts/relations/converters/contract';
import { stringFrom } from 'lib/echarts/relations/converters/fieldRead';
import { type MarkStat } from 'lib/echarts/relations/converters/model';
import { numberAt } from 'lib/echarts/relations/converters/toGraphWide';

/** Return the selected reducers or the default reducer. */
export function normalizeRelationsCalcs(reduceOptions: ReduceDataOptions | undefined): string[] {
  const calcs = reduceOptions?.calcs ?? [];
  return calcs.length > 0 ? [...calcs] : [RELATIONS_CALC_DEFAULT];
}

/** Describe how to read a mark value. */
export type MarkRead =
  /** `calcs[0]` is the main stat and the rest are extra tooltip rows, as everywhere else. */
  | { kind: 'reduce'; calcs: readonly string[] }
  /** A null row returns null for every mark. */
  | { kind: 'at'; row: number | null };

/** Reduce a mark's values to one of its stats. On instant data every reducer agrees. */
function reduceValue(field: Field, calc: string): number | null {
  const value: unknown = reduceField({ field, reducers: [calc] })[calc];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Read a mark value. See {@link MarkRead}. */
export function markValue(field: Field, markRead: MarkRead): number | null {
  if (markRead.kind === 'reduce') {
    return reduceValue(field, markRead.calcs[0]);
  }
  return markRead.row == null ? null : numberAt(field, markRead.row);
}

/** The row a mark's data link interpolates against. */
export function sourceRowOf(markRead: MarkRead): number {
  return markRead.kind === 'at' ? (markRead.row ?? 0) : 0;
}

/** Resolve a mark color through its display processor. */
export function colorOf(field: Field, value: number | null): string | undefined {
  return field.display ? field.display(value).color : field.config.color?.fixedColor;
}

/** Prefix used by every palette color mode. */
const PALETTE_MODE_PREFIX = 'palette-';

/** Check whether a color mode uses a palette. */
function isPaletteColorMode(mode: string | undefined): boolean {
  if (mode == null) {
    return true;
  }
  if (mode.startsWith(PALETTE_MODE_PREFIX)) {
    return true;
  }
  const colorMode = getFieldColorMode(mode);
  return colorMode.isByValue !== true && colorMode.getColors != null;
}

/** Return an edge color unless the panel palette controls it. */
export function edgeColorOf(field: Field, value: number | null): string | undefined {
  return isPaletteColorMode(field.config.color?.mode) ? undefined : colorOf(field, value);
}

/** The mark's stats past the first, one per reducer, as display strings. */
export function secondaryStatsOf(field: Field, markRead: MarkRead): MarkStat[] {
  const stats: MarkStat[] = [];
  // Extra reducers duplicate the value when one row is selected.
  for (const calc of markRead.kind === 'reduce' ? markRead.calcs.slice(1) : []) {
    const value = reduceValue(field, calc);
    if (value != null) {
      stats.push({ calc, value: field.display ? formattedValueToString(field.display(value)) : String(value) });
    }
  }
  if (stats.length > 0) {
    return stats;
  }
  const legacy = stringFrom(field.labels?.[SECONDARYSTAT_LABEL]);
  return legacy != null ? [{ value: legacy }] : [];
}
