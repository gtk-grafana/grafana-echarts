import { type SeriesTypeOption } from 'editor/types';

/**
 * The relations family's render-variant predicates, kept together because they are a
 * **partition** and only read as one: every option in
 * `lib/grafana/editor/relations/*` gates on one or a union of these, and the
 * exhaustiveness claim (`layout.test.ts`) can only be made against the whole set.
 *
 * All three are typed on the minimal `seriesType` shape so they satisfy the builders'
 * `(options: PanelOptions) => boolean` predicate. Mirrors `isFunnelVariant`.
 */

/**
 * Whether the stored relations `seriesType` selects the graph variant. Graph is the
 * family default, so an unset / `'Auto'` value counts as graph (mirrors
 * `resolveAutoSeriesType('relations') === 'graph'`).
 *
 * Written as an explicit membership test rather than `!isSankeyVariant` — the
 * inverse of "is sankey" would also match `chord`, silently showing graph-only
 * controls (layout, force tuning, edge arrows) on a chord panel.
 */
export const isGraphVariant = (options: { seriesType?: SeriesTypeOption }): boolean =>
  options.seriesType == null || options.seriesType === 'Auto' || options.seriesType === 'graph';

/**
 * Whether the stored relations `seriesType` selects the sankey variant. Passed as
 * an option's `showIf` to reveal sankey-only controls.
 */
export const isSankeyVariant = (options: { seriesType?: SeriesTypeOption }): boolean => options.seriesType === 'sankey';

/**
 * Whether the stored relations `seriesType` selects the chord variant. Passed as an
 * option's `showIf` to reveal chord-only controls.
 */
export const isChordVariant = (options: { seriesType?: SeriesTypeOption }): boolean => options.seriesType === 'chord';
