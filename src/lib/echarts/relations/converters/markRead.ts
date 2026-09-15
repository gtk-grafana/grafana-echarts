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

/**
 * Reading **one number** out of a mark, and the colour that number resolves to.
 *
 * A mark is a field, so "its value" is a choice: either the field reduced by
 * `reduceOptions.calcs[0]` or the row at one timestamp (the time slider). {@link MarkRead}
 * is that choice, and it is passed down to both readers so a node and an edge always
 * answer the same question.
 */

/**
 * The reducers a mark uses, first one guaranteed: `calcs[0]` is the **main stat** and the
 * rest are extra tooltip rows.
 *
 * Only the first is structurally singular, and it is singular for a reason a cap cannot be
 * put on the others: `calcs[0]` is the number that colours every mark, and on a sankey or chord it is the ribbon and arc thickness — ECharts derives those from the item value — a chart has one
 * geometry. (Not a graph node's size nor a graph edge's width; both of those are per-mark
 * field config. See `todo/relations-node-size-by-value.md`.) Everything after it has nowhere to go
 * but the tooltip, which has as many rows as it needs, so nothing is truncated.
 *
 * `reduceOptions.values` is not honoured: "all values" would mean one mark per row, and a
 * mark is a field by contract. No editor offers it for this family.
 */
export function normalizeRelationsCalcs(reduceOptions: ReduceDataOptions | undefined): string[] {
  const calcs = reduceOptions?.calcs ?? [];
  return calcs.length > 0 ? [...calcs] : [RELATIONS_CALC_DEFAULT];
}

/**
 * How a mark's value is read: **reduced over its rows**, or **taken at one row**.
 *
 * The row dimension is the only thing a mark has more than one of, so this is the whole
 * question the reader asks of it. `reduce` collapses every value to one stat by
 * `reduceOptions.calcs`, `lastNotNull` by default. `at` is the time slider's: one row,
 * chosen by timestamp and resolved **per frame**, because a ragged response shares no row
 * grid. See {@link graphWideTimeline}.
 */
export type MarkRead =
  /**
   * `calcs[0]` is the main stat and the rest are extra tooltip rows, as everywhere else.
   * Also the reading a frame with **no row dimension** keeps under the slider, having no row
   * to select by time — see `readFor`.
   */
  | { kind: 'reduce'; calcs: readonly string[] }
  /** `null` when this frame has no sample at the selected timestamp — every mark reads null. */
  | { kind: 'at'; row: number | null };

/** Reduce a mark's values to one of its stats. On instant data every reducer agrees. */
function reduceValue(field: Field, calc: string): number | null {
  const value: unknown = reduceField({ field, reducers: [calc] })[calc];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** A mark's value under the reading in force — see {@link MarkRead}. */
export function markValue(field: Field, markRead: MarkRead): number | null {
  if (markRead.kind === 'reduce') {
    return reduceValue(field, markRead.calcs[0]);
  }
  return markRead.row == null ? null : numberAt(field, markRead.row);
}

/**
 * The row a mark's data link interpolates against — see `readLinks`.
 *
 * Row 0 under `reduce`: there is no one row a mean came from. Under `at` it is the
 * selected row, and 0 again when the frame has no sample there, so an interpolated link
 * still resolves.
 */
export function sourceRowOf(markRead: MarkRead): number {
  return markRead.kind === 'at' ? (markRead.row ?? 0) : 0;
}

/**
 * A mark's colour, resolved through its own display processor.
 *
 * This is the whole point of the pivot: `field.display` is what `applyFieldOverrides`
 * left behind, so a `byName` override, a fixed colour and a by-value scheme all arrive
 * here already resolved — no separate resolver, all eight modes for free. Falls back to
 * the configured fixed colour when the override pass has not run (unit tests, and any
 * caller upstream of the pipeline).
 */
export function colorOf(field: Field, value: number | null): string | undefined {
  return field.display ? field.display(value).color : field.config.color?.fixedColor;
}

/**
 * The prefix every palette mode's id carries, checked ahead of the registry so a palette
 * added upstream after this build is still recognised as one. See {@link isPaletteColorMode}.
 */
const PALETTE_MODE_PREFIX = 'palette-';

/**
 * Is this colour mode a **palette** — a colour picked by the field's position among its
 * siblings, or by a hash of its name?
 *
 * This is the gate on per-edge colour, and a palette is the one class of mode an edge
 * does not read. For a **node** a palette is exactly right: it reproduces the per-node
 * colouring the family has always drawn. For an **edge** it is not a colour choice at
 * all — a series index says nothing about which two nodes the edge joins — so a palette
 * counts as "nothing configured" and the edge falls through to `relationsLinkColor`.
 * Every other mode is read: a literal colour (`fixed`, `shades`, `gradient`) is a
 * decision about this mark, and a by-value scheme (`thresholds`, `continuous-*`) grades
 * the edge by its own weight, which is a thing only the edge can say. Both therefore
 * beat the endpoint colouring, and under a by-value scheme "Link color" has nothing left
 * to decide — which is what its description now says, since no `showIf` can see
 * `fieldConfig` to hide it.
 *
 * Two tests, because neither is sufficient alone:
 *
 * - the **registry** classifies a known id — `isByValue` marks the value-derived modes
 *   and `getColors` marks the scheme-backed ones, so the pair `isByValue !== true` and
 *   `getColors != null` is exactly the index/name palettes (`palette-classic`,
 *   `-by-name`, `-colorblind`, `-saturated`, 13.3's `palette-categorical-next*`).
 *   `getColors` alone would not do: it is a *method* on `FieldColorSchemeMode`, so the
 *   `continuous-*` modes carry one too.
 * - the **prefix** catches an id this build has never heard of, which the registry
 *   cannot: `getFieldColorMode` answers an unknown id with the `thresholds` mode, so a
 *   palette shipped upstream after this build would otherwise be read as by-value and
 *   would colour every edge — the exact bug this replaced, which was a two-entry list of
 *   `palette-classic` and `palette-classic-by-name` that left `palette-colorblind` and
 *   the categorical palettes silently turning "Link color" off for the whole panel.
 */
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

/**
 * An edge's **own** colour, or `undefined` to leave it to `relationsLinkColor`. See
 * {@link isPaletteColorMode}, and `resolveLinkColor` for where the fall-through lands.
 */
export function edgeColorOf(field: Field, value: number | null): string | undefined {
  return isPaletteColorMode(field.config.color?.mode) ? undefined : colorOf(field, value);
}

/**
 * The mark's stats past the first, one per reducer, as display strings.
 *
 * Formatted through the mark's **own** display processor rather than the panel's shared
 * formatter, so two nodes can carry different units — which the row form cannot express at
 * all. Each keeps the reducer that produced it, so a calc that reduces to nothing on this
 * mark drops its row without shifting the labels of the rows after it.
 *
 * Falls back to the `secondarystat` label the conversion carries for row input — one value,
 * with no calculation behind it — and only when no reducer produced anything: an instant
 * response has no second value to reduce, so that label *is* the secondary stat there.
 */
export function secondaryStatsOf(field: Field, markRead: MarkRead): MarkStat[] {
  const stats: MarkStat[] = [];
  // None of its own at a selected row: every reducer agrees over one value, so the extra
  // calcs would render as duplicate tooltip rows. The label fallback below still applies.
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
