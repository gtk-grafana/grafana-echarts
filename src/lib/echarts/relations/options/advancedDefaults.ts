import { ANIMATION_ENABLED_DEFAULT } from 'editor/constants';
import { type RelationsPanelOptions } from 'editor/relations/options';

/**
 * Every Advanced-gated relations option at its default, per render variant.
 *
 * Spread over the stored options in Default editor mode so a panel that was edited in
 * Advanced mode and switched back renders as an untouched Default panel — `showIf` only
 * hides a control, it does not clear the value. Required of any family that gates options
 * behind Advanced; see `docs/options-modes.md` and `applyPartToWholeEditorModeDefaults`.
 *
 * The four sets stay separately named because `advancedTier.test.ts` asserts a key set per
 * variant. Collected in one module so `options/editorMode.ts` has a single relations
 * import rather than one per variant, and so no variant builder holds its own set — which
 * would put `editorMode.ts` and the builders in an import cycle.
 *
 * **The tier and the editor *section* are separate questions.** These options are spread
 * across the Labels / Layout / Interaction / Edges / Sankey / Chord sections rather than a
 * single "Advanced" one, so membership here is decided by each option's `showIf` gate and
 * nothing else. `advancedTier.test.ts` probes those gates directly rather than reading a
 * category, which is what keeps the two lists tied together.
 */

/**
 * The graph variant's Advanced-gated options at their defaults.
 *
 * Deliberately **absent**, because each is a Default-tier control the user can still
 * see, so resetting it would read as the editor forgetting what they set:
 * `relationsFocusAdjacency`, `relationsHideOverlappingLabels`, `relationsLabelOverflow`,
 * `relationsLinkColor`, `relationsShowEdgeValues`, `relationsEdgeArrows`, `relationsLayout`,
 * `relationsNodeSize`, `relationsShowNodeLabels`, `relationsShowNodeValues`, and the three
 * view switches `relationsZoom` / `relationsPan` / `relationsRememberView`.
 */
export const ADVANCED_RELATIONS_DEFAULTS: Partial<RelationsPanelOptions> = {
  relationsDraggable: undefined,
  relationsRepulsion: undefined,
  relationsEdgeLength: undefined,
  relationsGravity: undefined,
  relationsLayoutAnimation: undefined,
  relationsCurveness: undefined,
  relationsLabelWidth: undefined,
};

/**
 * The **shared** options the family gates behind Advanced — currently just
 * `animation.enabled`, a plain Advanced opt-in reset like every other family's (see
 * `ADVANCED_CARTESIAN_DEFAULTS`).
 *
 * A fourth set rather than an entry in `ADVANCED_RELATIONS_DEFAULTS`, because that one
 * is typed `Partial<RelationsPanelOptions>` — the family's own slice, which does not
 * declare shared keys, and deliberately so: the narrow type is what keeps `src/types.ts`
 * off this family's import graph. Left unannotated here for the same reason.
 */
export const ADVANCED_RELATIONS_SHARED_DEFAULTS = {
  animation: { enabled: ANIMATION_ENABLED_DEFAULT },
};

/**
 * Sankey-specific Advanced-gated options at their defaults, merged into
 * `ADVANCED_RELATIONS_DEFAULTS` so Default editor mode resets them like every other
 * family's Advanced tier. `orient` and `nodeAlign` are absent deliberately: they are
 * Default-tier controls, not Advanced-gated. See `docs/options-modes.md`.
 */
export const ADVANCED_SANKEY_DEFAULTS: Partial<RelationsPanelOptions> = {
  relationsSankeyNodeWidth: undefined,
  relationsSankeyNodeGap: undefined,
  relationsSankeyCurveness: undefined,
  relationsSankeyLinkOpacity: undefined,
  relationsSankeyLayoutIterations: undefined,
};

/**
 * Chord-specific Advanced-gated options at their defaults, merged into the relations
 * family's reset in `applyEditorModeDefaults` so Default editor mode clears them.
 *
 * All five, because the whole "Chord" section is Advanced-gated — unlike "Sankey",
 * whose two layout controls are Default-tier and so stay out of this set.
 * See `docs/options-modes.md`.
 */
export const ADVANCED_CHORD_DEFAULTS: Partial<RelationsPanelOptions> = {
  relationsChordStartAngle: undefined,
  relationsChordClockwise: undefined,
  relationsChordPadAngle: undefined,
  relationsChordMinAngle: undefined,
  relationsChordLinkOpacity: undefined,
};
