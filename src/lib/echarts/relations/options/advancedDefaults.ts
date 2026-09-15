import { ANIMATION_ENABLED_DEFAULT } from 'editor/constants';
import { type RelationsPanelOptions } from 'editor/relations/options';

/** Every Advanced-gated relations option at its default, per render variant. */

/** The graph variant's Advanced-gated options at their defaults. */
export const ADVANCED_RELATIONS_DEFAULTS: Partial<RelationsPanelOptions> = {
  relationsDraggable: undefined,
  relationsRepulsion: undefined,
  relationsEdgeLength: undefined,
  relationsGravity: undefined,
  relationsLayoutAnimation: undefined,
  relationsCurveness: undefined,
  relationsLabelWidth: undefined,
};

/** The shared options the family gates behind Advanced. */
export const ADVANCED_RELATIONS_SHARED_DEFAULTS = {
  animation: { enabled: ANIMATION_ENABLED_DEFAULT },
};

/** Sankey options reset by default editor mode. */
export const ADVANCED_SANKEY_DEFAULTS: Partial<RelationsPanelOptions> = {
  relationsSankeyNodeWidth: undefined,
  relationsSankeyNodeGap: undefined,
  relationsSankeyCurveness: undefined,
  relationsSankeyLinkOpacity: undefined,
  relationsSankeyLayoutIterations: undefined,
};

/** Chord options reset by default editor mode. */
export const ADVANCED_CHORD_DEFAULTS: Partial<RelationsPanelOptions> = {
  relationsChordStartAngle: undefined,
  relationsChordClockwise: undefined,
  relationsChordPadAngle: undefined,
  relationsChordMinAngle: undefined,
  relationsChordLinkOpacity: undefined,
};
