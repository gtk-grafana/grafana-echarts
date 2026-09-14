import { ReducerID, type SelectableValue } from '@grafana/data';

import { type RelationsLabelOverflow, type RelationsSeriesType } from 'editor/relations/types';
/**
 * The relations family's editor constants: its render-variant list, its editor
 * category, and every option default that is **family-wide** rather than tied to one
 * variant. The two variant-specific sets live beside this file (`sankey.ts`,
 * `chord.ts`), and the variant predicates in `variants.ts`.
 *
 * These are deliberately on the Grafana-neutral `editor/` side rather than in
 * `lib/echarts/relations/options/`: an editor supplier needs a default to label a
 * control with, and having the defaults in the ECharts option builders made seven
 * editor files import an ECharts module for a number. Mirrors how `sankey.ts` and
 * `chord.ts` have always held theirs.
 */

/**
 * Relations types: nodes plus the links between them, built from the field-based graph
 * contract. All three ECharts series consume the identical node/link input, so they are
 * render variants of one family rather than separate panels. See
 * echarts/relations/converters/graphWide.ts.
 */
export const relationsSeriesTypes: RelationsSeriesType[] = ['graph', 'sankey', 'chord'];
/**
 * Relations render types offered by the relations family panel, selected per panel
 * via the panel-level `seriesType`. `graph` draws an arbitrary topology; `sankey`
 * lays the same nodes and links out as weighted flow ribbons, which requires an
 * acyclic edge set (broken automatically — see `converters/dag.ts`); `chord` draws a
 * ring of arcs joined by ribbons, and accepts cycles directly.
 */
export const relationsSeriesTypeOptions: Array<SelectableValue<RelationsSeriesType>> = [
  { value: 'graph', label: 'Graph' },
  { value: 'sankey', label: 'Sankey' },
  { value: 'chord', label: 'Chord' },
];
/** Editor category holding the relations family's Default-tier options. */
export const relationsCategoryName = 'Relations';

/**
 * The relations family's animation default: **on**, and a Default-tier control rather
 * than an Advanced one.
 *
 * The reasoning above is about *density*, and a relations panel is not dense in the way
 * that argument is about: a mark is a whole field here, so a graph is tens of marks
 * where a cartesian panel is tens of thousands of points. What the animation buys is
 * also worth more — arcs and ribbons growing into place on load is how a chord or
 * sankey reads as one connected flow rather than a static picture.
 *
 * The force graph's *jiggle* is a separate thing entirely and stays off: that is
 * `force.layoutAnimation`, which draws every simulation step and is unaffected by this.
 * See `RELATIONS_LAYOUT_ANIMATION_DEFAULT`.
 */
export const RELATIONS_ANIMATION_ENABLED_DEFAULT = true;

/** Reducer used when the panel has no `reduceOptions.calcs`. */
export const RELATIONS_CALC_DEFAULT = ReducerID.lastNotNull;

/** Default node diameter in px, used when a node has no `custom.nodeRadius`. */
export const RELATIONS_NODE_SIZE_DEFAULT = 20;
/**
 * Default link colour mode: a gradient from the source node's colour to the target's.
 *
 * An edge joins two marks, so its natural colour is theirs, and a gradient is the one
 * mode that reads the direction off the edge itself without an arrowhead. An edge whose
 * own field carries a non-palette colour overrides this per edge — see `isPaletteColorMode`.
 */
export const RELATIONS_LINK_COLOR_DEFAULT = 'gradient';
/** Default graph layout when the data does not pin positions. */
export const RELATIONS_LAYOUT_DEFAULT = 'force';
/** Node labels on by default — an unlabelled topology is hard to read. */
export const RELATIONS_SHOW_NODE_LABELS_DEFAULT = true;
/** Node values off by default: a second label line on every node is a lot of ink. */
export const RELATIONS_SHOW_NODE_VALUES_DEFAULT = false;
/** Edge values off by default: one number per link buries a graph of any size. */
export const RELATIONS_SHOW_EDGE_VALUES_DEFAULT = false;
/**
 * Arrowheads on by default.
 *
 * An edge is directed by contract (`source`/`target`), and on a force layout the
 * arrowhead is the *only* thing that says which way — the source-to-target gradient
 * cannot be oriented without knowing the node positions. See `makeEdgeGradientResolver`.
 */
export const RELATIONS_EDGE_ARROWS_DEFAULT = true;
/**
 * Adjacency highlighting on by default, and out of the Advanced tier.
 *
 * Reading one node's neighbourhood out of a dense topology is the main thing a
 * relations panel is hovered for, and it is also ECharts' own chord default. Note the
 * chord variant emits the key either way — see `getChordEmphasis`.
 */
export const RELATIONS_FOCUS_ADJACENCY_DEFAULT = true;
/**
 * Overlapping node labels are dropped by default (ECharts `labelLayout.hideOverlap`).
 *
 * The first thing that goes wrong on a graph past a handful of nodes is that the labels
 * pile up into an unreadable smear, and a label that is 40% covered is worse than no
 * label — the node keeps its symbol, its colour and its tooltip either way. This is the
 * chord variant's answer to the pie's `avoidLabelOverlap` as well: `series.chord` has no
 * such option, but its labels go through the same label-layout stage.
 *
 * Reaches **edge values too**, but not through the same stage: a graph edge's label is
 * arbitrated by the family, because the stage measures it before the link geometry has
 * settled and would let it outrank a node's name. See `getRelationsLabelLayout` and
 * `registerEdgeLabelLayout`.
 * https://echarts.apache.org/en/option.html#series-graph.labelLayout
 */
export const RELATIONS_HIDE_OVERLAPPING_LABELS_DEFAULT = true;
/** Long node names are ellipsised rather than allowed to run into a neighbour. */
export const RELATIONS_LABEL_OVERFLOW_DEFAULT: RelationsLabelOverflow = 'truncate';
/** Width in px at which `relationsLabelOverflow` bites. */
export const RELATIONS_LABEL_WIDTH_DEFAULT = 120;
/**
 * Force repulsion, **far** above ECharts' own `[0, 50]`.
 *
 * ECharts' default is tuned for the tens-of-nodes demo graphs in its gallery; on a
 * service topology it packs the nodes into a knot in the middle of the panel with every
 * label on top of every other. 400 spreads them to where the labels have room.
 * https://echarts.apache.org/en/option.html#series-graph.force.repulsion
 */
export const RELATIONS_REPULSION_DEFAULT = 400;
/** Target link length in px; likewise well above ECharts' 30. */
export const RELATIONS_EDGE_LENGTH_DEFAULT = 200;
/**
 * The force simulation's steps are **not** drawn by default, unlike ECharts.
 *
 * `layoutAnimation` renders every iteration, so the graph visibly settles from its seed
 * — which on a dashboard refreshing every 30s reads as the nodes jiggling for no reason,
 * since the topology did not change. Off, the same iterations run in one synchronous
 * pass and only the settled layout is painted.
 * https://echarts.apache.org/en/option.html#series-graph.force.layoutAnimation
 */
export const RELATIONS_LAYOUT_ANIMATION_DEFAULT = false;

/**
 * The time slider is **off** by default: reducing the row dimension to one stat is the
 * family's other reading, and the only one an instant response has. The resolver that
 * reads it is `lib/echarts/relations/options/timeSlider.ts`.
 */
export const RELATIONS_TIME_SLIDER_DEFAULT = false;
