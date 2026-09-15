import { ReducerID, type SelectableValue } from '@grafana/data';

import { type RelationsLabelOverflow, type RelationsSeriesType } from 'editor/relations/types';

/** Relations variants use one node and link model. */
export const relationsSeriesTypes: RelationsSeriesType[] = ['graph', 'sankey', 'chord'];

/** Chart types shown in the panel editor. */
export const relationsSeriesTypeOptions: Array<SelectableValue<RelationsSeriesType>> = [
  { value: 'graph', label: 'Graph' },
  { value: 'sankey', label: 'Sankey' },
  { value: 'chord', label: 'Chord' },
];

/** Editor section names. Their first use sets their order. */
export const relationsCategoryName = 'Relations';
export const relationsLabelsCategoryName = 'Labels';
export const relationsLayoutCategoryName = 'Layout';
export const relationsInteractionCategoryName = 'Interaction';
export const relationsEdgesCategoryName = 'Edges';

/** Default reducer for a mark timeline. */
export const RELATIONS_CALC_DEFAULT = ReducerID.median;

/** Default graph node diameter in pixels. */
export const RELATIONS_NODE_SIZE_DEFAULT = 20;
/** Default link color mode. A mark color still takes priority. */
export const RELATIONS_LINK_COLOR_DEFAULT = 'gradient';
/** Default graph layout when the data has no fixed positions. */
export const RELATIONS_LAYOUT_DEFAULT = 'force';
/** Node labels are visible by default. */
export const RELATIONS_SHOW_NODE_LABELS_DEFAULT = true;
/** Node values are hidden by default. */
export const RELATIONS_SHOW_NODE_VALUES_DEFAULT = false;
/** Edge values are hidden by default. */
export const RELATIONS_SHOW_EDGE_VALUES_DEFAULT = false;
/** Arrowheads show edge direction when a gradient is not available. */
export const RELATIONS_EDGE_ARROWS_DEFAULT = true;
/** Hover emphasizes adjacent marks by default. */
export const RELATIONS_FOCUS_ADJACENCY_DEFAULT = true;
/**
 * Overlapping labels are hidden by default.
 * https://echarts.apache.org/en/option.html#series-graph.labelLayout
 */
export const RELATIONS_HIDE_OVERLAPPING_LABELS_DEFAULT = true;
/** Long node names end with an ellipsis by default. */
export const RELATIONS_LABEL_OVERFLOW_DEFAULT: RelationsLabelOverflow = 'truncate';
/** Default label width in pixels. */
export const RELATIONS_LABEL_WIDTH_DEFAULT = 120;
/**
 * Default force repulsion. This value leaves room for labels.
 * https://echarts.apache.org/en/option.html#series-graph.force.repulsion
 */
export const RELATIONS_REPULSION_DEFAULT = 400;
/** Default force link length in pixels. */
export const RELATIONS_EDGE_LENGTH_DEFAULT = 200;
/**
 * Force layout steps are hidden by default.
 * https://echarts.apache.org/en/option.html#series-graph.force.layoutAnimation
 */
export const RELATIONS_LAYOUT_ANIMATION_DEFAULT = false;
/** The time slider is off by default. */
export const RELATIONS_TIME_SLIDER_DEFAULT = false;
