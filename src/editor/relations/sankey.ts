import { type SelectableValue } from '@grafana/data';
import { type RelationsSankeyNodeAlign, type RelationsSankeyOrient } from 'editor/relations/types';
import { type SeriesType } from 'editor/types';

/** Sankey uses the relations node and link model. */
export const sankeySeriesTypes: SeriesType[] = ['sankey'];

/** Editor section for sankey layout controls. */
export const sankeyCategoryName = 'Sankey';

/** ECharts sankey options: https://echarts.apache.org/en/option.html#series-sankey */
export const sankeyOrientPath = 'relationsSankeyOrient';
export const sankeyOrientOptions: Array<SelectableValue<RelationsSankeyOrient>> = [
  { value: 'horizontal', label: 'Horizontal', description: 'Node columns run left to right' },
  { value: 'vertical', label: 'Vertical', description: 'Node rows run top to bottom' },
];
export const SANKEY_ORIENT_DEFAULT: RelationsSankeyOrient = 'horizontal';

export const sankeyNodeAlignPath = 'relationsSankeyNodeAlign';
export const sankeyNodeAlignOptions: Array<SelectableValue<RelationsSankeyNodeAlign>> = [
  { value: 'left', label: 'Left', description: 'Pin each node to the earliest column it can occupy' },
  { value: 'right', label: 'Right', description: 'Pin each node to the latest column it can occupy' },
  { value: 'justify', label: 'Justify', description: 'Push nodes with no outgoing links to the far edge' },
];
/** The default keeps each column tied to its flow depth. */
export const SANKEY_NODE_ALIGN_DEFAULT: RelationsSankeyNodeAlign = 'left';

export const sankeyNodeWidthPath = 'relationsSankeyNodeWidth';
export const sankeyNodeGapPath = 'relationsSankeyNodeGap';
export const SANKEY_NODE_WIDTH_DEFAULT = 20;
export const SANKEY_NODE_GAP_DEFAULT = 8;

export const sankeyCurvenessPath = 'relationsSankeyCurveness';
export const SANKEY_CURVENESS_DEFAULT = 0.5;

export const sankeyLinkOpacityPath = 'relationsSankeyLinkOpacity';
export const SANKEY_LINK_OPACITY_DEFAULT = 0.2;

/** ECharts skips layout passes when a node has no flow. */
export const sankeyLayoutIterationsPath = 'relationsSankeyLayoutIterations';
export const SANKEY_LAYOUT_ITERATIONS_DEFAULT = 32;
