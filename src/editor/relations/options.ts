import {
  type RelationsGraphLayout,
  type RelationsLabelOverflow,
  type RelationsLinkColor,
  type RelationsSankeyNodeAlign,
  type RelationsSankeyOrient,
} from 'editor/relations/types';

/**
 * Panel options for the relations family.
 * ECharts graph, sankey, and chord options: https://echarts.apache.org/en/option.html#series
 */
export interface RelationsPanelOptions {
  /** Maximum mark count. Empty uses the automatic limit. */
  relationsMaxMarks?: number;
  /** Graph layout. Fixed layout uses `none`. */
  relationsLayout?: RelationsGraphLayout;
  /** Shows node names. */
  relationsShowNodeLabels?: boolean;
  /** Adds the node value to its label. */
  relationsShowNodeValues?: boolean;
  /** Default graph node diameter in pixels. */
  relationsNodeSize?: number;
  /** Shows the panel zoom controls. */
  relationsZoom?: boolean;
  /** Lets the user pan the graph or sankey. */
  relationsPan?: boolean;
  /** Lets the user drag graph or sankey nodes. */
  relationsDraggable?: boolean;
  /** Sets `series.graph.force.repulsion`. */
  relationsRepulsion?: number;
  /** Sets `series.graph.force.edgeLength` in pixels. */
  relationsEdgeLength?: number;
  /** Draws each force layout step. */
  relationsLayoutAnimation?: boolean;
  /** Sets `series.graph.force.gravity`. */
  relationsGravity?: number;
  /** Draws an arrow at the target end of each graph edge. */
  relationsEdgeArrows?: boolean;
  /** Shows edge values on graph and sankey links. */
  relationsShowEdgeValues?: boolean;
  /** Sets graph edge curvature from 0 to 1. */
  relationsCurveness?: number;
  /** Fades marks outside the hovered adjacency. */
  relationsFocusAdjacency?: boolean;
  /** Hides node labels that overlap other labels. */
  relationsHideOverlappingLabels?: boolean;
  /** Controls label overflow at `relationsLabelWidth`. */
  relationsLabelOverflow?: RelationsLabelOverflow;
  /** Sets the node label width in pixels. */
  relationsLabelWidth?: number;
  /** Reads every mark at one selected timestamp. */
  relationsTimeSlider?: boolean;
  /** Uses the source, target, or both endpoints to color a link. */
  relationsLinkColor?: RelationsLinkColor;
  /** Saves pan and zoom changes in the panel options. */
  relationsRememberView?: boolean;
  /** Saved view scale. The panel writes this value. */
  relationsViewZoom?: number;
  /** Saved view center. The panel writes this value. */
  relationsViewCenter?: [number, number];
  /** Sets the sankey flow direction. */
  relationsSankeyOrient?: RelationsSankeyOrient;
  /** Sets the sankey column alignment. */
  relationsSankeyNodeAlign?: RelationsSankeyNodeAlign;
  /** Sets the sankey node width in pixels. */
  relationsSankeyNodeWidth?: number;
  /** Sets the gap between sankey nodes in pixels. */
  relationsSankeyNodeGap?: number;
  /** Sets sankey ribbon curvature from 0 to 1. */
  relationsSankeyCurveness?: number;
  /** Sets sankey ribbon opacity from 0 to 1. */
  relationsSankeyLinkOpacity?: number;
  /** Sets the number of sankey layout passes. */
  relationsSankeyLayoutIterations?: number;
  /** Sets the chord ring start angle in degrees. */
  relationsChordStartAngle?: number;
  /** Sets the chord arc direction. */
  relationsChordClockwise?: boolean;
  /** Sets the gap between chord arcs in degrees. */
  relationsChordPadAngle?: number;
  /** Sets the minimum chord arc angle in degrees. */
  relationsChordMinAngle?: number;
  /** Sets chord ribbon opacity from 0 to 1. */
  relationsChordLinkOpacity?: number;
}
