import { type SeriesType, type SeriesTypeOption } from 'editor/types';

/**
 * Chord render type of the relations family. A chord reuses the node/link model
 * verbatim (`frameToNodeGraph`) and, unlike sankey, has **no DAG restriction** — it
 * takes a cyclic service graph directly, so it needs no cycle-breaking pass. Only
 * its layout options are chord-specific. See `getChordSeries`.
 *
 * `series.chord` is new in ECharts **6.0.0** and unrelated to the `chord` series that
 * existed in ECharts 2 and was removed in 3.x, so pre-3.x examples do not apply.
 * Every option below was checked against the installed 6.1.0 source rather than the
 * option reference; two of them contradict what a sankey-by-analogy guess would give
 * (see `CHORD_PAD_ANGLE_DEFAULT`).
 */
export const chordSeriesTypes: SeriesType[] = ['chord'];

/**
 * Whether the stored relations `seriesType` selects the chord variant. Passed as an
 * option's `showIf` to reveal chord-only controls. Typed on the minimal `seriesType`
 * shape so it satisfies the builders' `(options: PanelOptions) => boolean` predicate.
 */
export const isChordVariant = (options: { seriesType?: SeriesTypeOption }): boolean => options.seriesType === 'chord';

/**
 * Editor category grouping the chord layout options. Like the funnel's and sankey's,
 * chord has no core-parity baseline, so its controls get their own category rather
 * than the shared "Advanced" one — except that chord's are *all* Advanced-gated
 * beyond the shared label switch, so this category holds only the ring geometry.
 */
export const chordCategoryName = 'Chord';

/**
 * Panel option path for the ring's starting angle in degrees (ECharts
 * `series.chord.startAngle`). Advanced-only.
 */
export const chordStartAnglePath = 'relationsChordStartAngle';
/** ECharts' own `startAngle` default (degrees, 90 = twelve o'clock). Omitted at this value. */
export const CHORD_START_ANGLE_DEFAULT = 90;

/**
 * Panel option path for the arc layout direction (ECharts `series.chord.clockwise`).
 * Advanced-only; only `false` is emitted.
 */
export const chordClockwisePath = 'relationsChordClockwise';
/** ECharts' own `clockwise` default. Omitted at this value. */
export const CHORD_CLOCKWISE_DEFAULT = true;

/**
 * Panel option path for the angular gap between adjacent node arcs (ECharts
 * `series.chord.padAngle`, in degrees). Advanced-only.
 *
 * **This is the chord analogue of a "node gap", and it is angular, not pixel-based.**
 * `series.chord` has no `nodeWidth` or `nodeGap` at all — those are sankey keys, and
 * assuming them by analogy would have wired two options that silently do nothing.
 * Ring thickness is `series.chord.radius` (a `['70%', '80%']` tuple), left at the
 * ECharts default rather than flattened into a single control.
 */
export const chordPadAnglePath = 'relationsChordPadAngle';
/** ECharts' own `padAngle` default, in degrees. Omitted at this value. */
export const CHORD_PAD_ANGLE_DEFAULT = 3;

/**
 * Panel option path for the minimum arc angle in degrees (ECharts
 * `series.chord.minAngle`), so a low-flow node stays visible instead of collapsing
 * to nothing. Advanced-only; mirrors the pie's minimum slice angle.
 */
export const chordMinAnglePath = 'relationsChordMinAngle';
/** ECharts' own `minAngle` default. Omitted at this value. */
export const CHORD_MIN_ANGLE_DEFAULT = 0;

/**
 * Panel option path for ribbon translucency (ECharts
 * `series.chord.lineStyle.opacity`). Advanced-only; a chord is dense by nature, so
 * this is its main legibility lever.
 */
export const chordLinkOpacityPath = 'relationsChordLinkOpacity';
/** ECharts' own chord `lineStyle.opacity` default. Omitted at this value. */
export const CHORD_LINK_OPACITY_DEFAULT = 0.2;
