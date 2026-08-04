import { type SelectableValue } from '@grafana/data';
import {
  type RelationsSankeyNodeAlign,
  type RelationsSankeyOrient,
  type SeriesType,
  type SeriesTypeOption,
} from 'editor/types';

/**
 * Sankey render type of the relations family. A sankey reuses the node/link model
 * verbatim (`frameToGraphWide`); only its layout options, the cycle-breaking pass
 * (`converters/dag.ts`) and its editor options are sankey-specific. See
 * `getSankeySeries`.
 */
export const sankeySeriesTypes: SeriesType[] = ['sankey'];

/**
 * Whether the stored relations `seriesType` selects the sankey variant. Passed as
 * an option's `showIf` to reveal sankey-only controls. Typed on the minimal
 * `seriesType` shape so it satisfies the builders' `(options: PanelOptions) =>
 * boolean` predicate. Mirrors `isFunnelVariant`.
 */
export const isSankeyVariant = (options: { seriesType?: SeriesTypeOption }): boolean => options.seriesType === 'sankey';

/**
 * Whether the stored relations `seriesType` selects the graph variant. Graph is the
 * family default, so an unset / `'Auto'` value counts as graph (mirrors
 * `resolveAutoSeriesType('relations') === 'graph'`).
 *
 * Written as an explicit membership test rather than `!isSankeyVariant` — the
 * inverse of "is sankey" would also match `chord` once that variant lands, silently
 * showing graph-only controls (layout, force tuning, edge arrows) on a chord panel.
 */
export const isGraphVariant = (options: { seriesType?: SeriesTypeOption }): boolean =>
  options.seriesType == null || options.seriesType === 'Auto' || options.seriesType === 'graph';

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
/** Sankey node-alignment options (Justify / Left / Right). */
export const sankeyNodeAlignOptions: Array<SelectableValue<RelationsSankeyNodeAlign>> = [
  { value: 'justify', label: 'Justify', description: 'Push nodes with no outgoing links to the far edge' },
  { value: 'left', label: 'Left', description: 'Pin each node to the earliest column it can occupy' },
  { value: 'right', label: 'Right', description: 'Pin each node to the latest column it can occupy' },
];
/** Default sankey node alignment: justify (matches ECharts). Omitted at this default. */
export const SANKEY_NODE_ALIGN_DEFAULT: RelationsSankeyNodeAlign = 'justify';

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
