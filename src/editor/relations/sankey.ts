import { type SelectableValue } from '@grafana/data';
import { type SeriesType } from 'editor/types';
import { type RelationsSankeyNodeAlign, type RelationsSankeyOrient } from 'editor/relations/types';
/**
 * Sankey render type of the relations family. A sankey reuses the node/link model
 * verbatim (`frameToGraphWide`); only its layout options, the cycle-breaking pass
 * (`converters/dag.ts`) and its editor options are sankey-specific. See
 * `getSankeySeries`.
 */
export const sankeySeriesTypes: SeriesType[] = ['sankey'];

/**
 * Editor category grouping the sankey layout options (orientation, node alignment).
 * Like the funnel's dedicated category, sankey is an entirely ECharts type with no
 * core-parity baseline, so its primary controls get an always-visible category
 * (gated only on `isSankeyVariant`) rather than the shared "Advanced" one.
 */
export const sankeyCategoryName = 'Sankey';

/** Panel option path for the sankey flow direction. Maps to ECharts `series.sankey.orient`. */
export const sankeyOrientPath = 'relationsSankeyOrient';
/** Sankey flow-direction options (Horizontal / Vertical). */
export const sankeyOrientOptions: Array<SelectableValue<RelationsSankeyOrient>> = [
  { value: 'horizontal', label: 'Horizontal', description: 'Node columns run left to right' },
  { value: 'vertical', label: 'Vertical', description: 'Node rows run top to bottom' },
];
/** Default sankey orient: horizontal (matches ECharts). Omitted from the series at this default. */
export const SANKEY_ORIENT_DEFAULT: RelationsSankeyOrient = 'horizontal';

/** Panel option path for the sankey column alignment. Maps to ECharts `series.sankey.nodeAlign`. */
export const sankeyNodeAlignPath = 'relationsSankeyNodeAlign';
/**
 * Sankey node-alignment options, **Left first and Justify last** — ordered by how much
 * the choice rearranges the data rather than by ECharts' own ordering.
 *
 * `left` reads as the plain answer: every node sits in the earliest column its inputs
 * allow, so a node's column *is* its depth in the flow and two sankeys of the same data
 * are comparable. `justify` instead pushes every node with no outgoing links to the far
 * edge, which stretches terminal nodes away from the step that produced them — useful,
 * but a rearrangement, so it comes last.
 */
export const sankeyNodeAlignOptions: Array<SelectableValue<RelationsSankeyNodeAlign>> = [
  { value: 'left', label: 'Left', description: 'Pin each node to the earliest column it can occupy' },
  { value: 'right', label: 'Right', description: 'Pin each node to the latest column it can occupy' },
  { value: 'justify', label: 'Justify', description: 'Push nodes with no outgoing links to the far edge' },
];
/**
 * Default sankey node alignment: **left**, departing from ECharts' `justify`.
 *
 * A column then means the node's depth in the flow, which is what a reader takes a
 * sankey's horizontal axis to mean. Under `justify` a leaf two steps in is drawn in the
 * last column beside leaves five steps in, so the axis stops carrying depth at all.
 *
 * Emitted explicitly rather than omitted, since it is no longer the ECharts default —
 * see `getSankeySeries`.
 */
export const SANKEY_NODE_ALIGN_DEFAULT: RelationsSankeyNodeAlign = 'left';

/**
 * Panel option paths for the sankey node box geometry (ECharts
 * `series.sankey.nodeWidth` / `nodeGap`). Advanced-only; unset falls back to the
 * ECharts defaults below, so the keys are omitted.
 */
export const sankeyNodeWidthPath = 'relationsSankeyNodeWidth';
export const sankeyNodeGapPath = 'relationsSankeyNodeGap';
/** ECharts' own `nodeWidth` default, in px. Omitted from the series at this value. */
export const SANKEY_NODE_WIDTH_DEFAULT = 20;
/** ECharts' own `nodeGap` default, in px. Omitted from the series at this value. */
export const SANKEY_NODE_GAP_DEFAULT = 8;

/**
 * Panel option path for the sankey ribbon curvature (ECharts
 * `series.sankey.lineStyle.curveness`). Advanced-only. Distinct from the graph
 * variant's `relationsCurveness` because the two have **different ECharts
 * defaults** — 0.5 here, 0 there — so one shared option could not omit its key at
 * both.
 */
export const sankeyCurvenessPath = 'relationsSankeyCurveness';
/** ECharts' own sankey `lineStyle.curveness` default. Omitted at this value. */
export const SANKEY_CURVENESS_DEFAULT = 0.5;

/**
 * Panel option path for ribbon translucency (ECharts
 * `series.sankey.lineStyle.opacity`). Advanced-only; overlapping ribbons are the
 * norm in a sankey, so this is the main legibility lever.
 */
export const sankeyLinkOpacityPath = 'relationsSankeyLinkOpacity';
/** ECharts' own sankey `lineStyle.opacity` default. Omitted at this value. */
export const SANKEY_LINK_OPACITY_DEFAULT = 0.2;

/**
 * Panel option path for the layout relaxation pass count (ECharts
 * `series.sankey.layoutIterations`) — how many times node positions are refined to
 * reduce ribbon crossings. Advanced-only.
 *
 * Note ECharts disables iteration entirely when any node's computed value is 0
 * (`sankeyLayout.ts` sets `iterations = 0` in that case), so this can be inert on
 * data with a zero-flow node.
 */
export const sankeyLayoutIterationsPath = 'relationsSankeyLayoutIterations';
/** ECharts' own `layoutIterations` default. Omitted at this value. */
export const SANKEY_LAYOUT_ITERATIONS_DEFAULT = 32;
