import { type RelationsPanelOptions } from 'editor/relations/options';

/**
 * Every Advanced-gated relations option at its default, per render variant.
 *
 * Spread over the stored options in Default editor mode so a panel that was edited in
 * Advanced mode and switched back renders as an untouched Default panel — `showIf` only
 * hides a control, it does not clear the value. Required of any family that gates options
 * behind Advanced; see `docs/options-modes.md` and `applyPartToWholeEditorModeDefaults`.
 *
 * The three sets stay separately named because `advancedTier.test.ts` asserts a key set
 * per variant. Collected in one module so `options/editorMode.ts` has a single relations
 * import rather than one per variant — and so no variant builder has to hold its own set
 * to avoid an import cycle, which is why they were ever apart.
 */

/**
 * Every Advanced-gated relations option at its default. Spread over the stored
 * options in Default editor mode so a panel that was edited in Advanced mode and
 * switched back renders as an untouched Default panel — `showIf` only hides a
 * control, it does not clear the value. Required of any family that gates options
 * behind Advanced; see `docs/options-modes.md` and
 * `applyPartToWholeEditorModeDefaults`.
 *
 * `relationsFocusAdjacency`, `relationsHideOverlappingLabels` and `animation` are
 * deliberately **absent**: all three are Default-tier controls now, so resetting them
 * here would clear a value the user can still see.
 */
export const ADVANCED_RELATIONS_DEFAULTS: Partial<RelationsPanelOptions> = {
  relationsRoam: undefined,
  relationsZoom: undefined,
  relationsPan: undefined,
  relationsDraggable: undefined,
  relationsRepulsion: undefined,
  relationsEdgeLength: undefined,
  relationsGravity: undefined,
  relationsLayoutAnimation: undefined,
  relationsEdgeArrows: undefined,
  relationsShowEdgeValues: undefined,
  relationsCurveness: undefined,
  relationsLabelOverflow: undefined,
  relationsLabelWidth: undefined,
  relationsLinkColor: undefined,
  // The switch resets, and the state it stored goes with it — `getRelationsViewState`
  // reads nothing without the switch, so a Default-mode panel is never left holding a
  // pan the user cannot see the control for.
  relationsRememberView: undefined,
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
 * See `docs/options-modes.md`.
 */
export const ADVANCED_CHORD_DEFAULTS: Partial<RelationsPanelOptions> = {
  relationsChordStartAngle: undefined,
  relationsChordClockwise: undefined,
  relationsChordPadAngle: undefined,
  relationsChordMinAngle: undefined,
  relationsChordLinkOpacity: undefined,
};
