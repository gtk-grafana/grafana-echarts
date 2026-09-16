import { FieldType, type VisualizationPresetsSupplier, type VisualizationSuggestion } from '@grafana/data';
import { defaultVizLegendOptions, type VizLegendOptions } from '@grafana/schema';
import { ANIMATION_ENABLED_DEFAULT, seriesTypePath } from 'editor/constants';
import {
  RELATIONS_EDGE_ARROWS_DEFAULT,
  RELATIONS_FOCUS_ADJACENCY_DEFAULT,
  RELATIONS_HIDE_OVERLAPPING_LABELS_DEFAULT,
  RELATIONS_LABEL_OVERFLOW_DEFAULT,
  RELATIONS_LABEL_WIDTH_DEFAULT,
  RELATIONS_LAYOUT_ANIMATION_DEFAULT,
  RELATIONS_LAYOUT_DEFAULT,
  RELATIONS_LINK_COLOR_DEFAULT,
  RELATIONS_NODE_SIZE_DEFAULT,
  RELATIONS_SHOW_EDGE_VALUES_DEFAULT,
  RELATIONS_SHOW_NODE_LABELS_DEFAULT,
  RELATIONS_SHOW_NODE_VALUES_DEFAULT,
  RELATIONS_TIME_SLIDER_DEFAULT,
} from 'editor/relations/constants';
import { type RelationsPanelOptions } from 'editor/relations/options';
import {
  CHORD_CLOCKWISE_DEFAULT,
  CHORD_LINK_OPACITY_DEFAULT,
  CHORD_MIN_ANGLE_DEFAULT,
  CHORD_PAD_ANGLE_DEFAULT,
  CHORD_START_ANGLE_DEFAULT,
} from 'editor/relations/chord';
import {
  SANKEY_CURVENESS_DEFAULT,
  SANKEY_LAYOUT_ITERATIONS_DEFAULT,
  SANKEY_LINK_OPACITY_DEFAULT,
  SANKEY_NODE_ALIGN_DEFAULT,
  SANKEY_NODE_GAP_DEFAULT,
  SANKEY_NODE_WIDTH_DEFAULT,
  SANKEY_ORIENT_DEFAULT,
} from 'editor/relations/sankey';
import { type EChartsRelationsFieldConfig } from 'editor/relations/types';
import { exceedsChordNodeBudget, fitsSankeyTopology, relationsNodeCount } from 'lib/echarts/relations/charts/fitness';
import { previewCardOptions } from 'lib/echarts/charts/suggestionCards';
import { RELATIONS_CIRCULAR_MAX_NODES } from 'lib/echarts/charts/suggestionLimits';
import { type PanelOptions } from 'types';

type ClearableRelationsOption =
  | 'relationsCurveness'
  | 'relationsEdgeLength'
  | 'relationsGravity'
  | 'relationsRepulsion'
  | 'relationsViewCenter'
  | 'relationsViewZoom';

type RelationsResetOptions = Required<Omit<RelationsPanelOptions, ClearableRelationsOption>> & {
  relationsCurveness: number | undefined;
  relationsEdgeLength: number | undefined;
  relationsGravity: number | undefined;
  relationsRepulsion: number | undefined;
  relationsViewCenter: [number, number] | undefined;
  relationsViewZoom: number | undefined;
} & Required<Pick<PanelOptions, typeof seriesTypePath | 'animation' | 'legend'>>;

/** Preset legends stay visible while the graph remains easy to scan. */
export const RELATIONS_PRESET_LEGEND_MAX_NODES = 12;

function presetLegend(nodeCount: number | undefined, placement: VizLegendOptions['placement']): VizLegendOptions {
  return {
    ...defaultVizLegendOptions,
    calcs: [],
    placement,
    showLegend: nodeCount == null || nodeCount <= RELATIONS_PRESET_LEGEND_MAX_NODES,
  };
}

/** Reset every visual option that can affect a Relations render. */
export const RELATIONS_PRESET_BASE = {
  [seriesTypePath]: 'graph',
  relationsLayout: RELATIONS_LAYOUT_DEFAULT,
  relationsShowNodeLabels: RELATIONS_SHOW_NODE_LABELS_DEFAULT,
  relationsShowNodeValues: RELATIONS_SHOW_NODE_VALUES_DEFAULT,
  relationsNodeSize: RELATIONS_NODE_SIZE_DEFAULT,
  relationsZoom: false,
  relationsPan: false,
  relationsDraggable: false,
  relationsRepulsion: undefined,
  relationsEdgeLength: undefined,
  relationsLayoutAnimation: RELATIONS_LAYOUT_ANIMATION_DEFAULT,
  relationsGravity: undefined,
  relationsEdgeArrows: RELATIONS_EDGE_ARROWS_DEFAULT,
  relationsShowEdgeValues: RELATIONS_SHOW_EDGE_VALUES_DEFAULT,
  relationsCurveness: undefined,
  relationsFocusAdjacency: RELATIONS_FOCUS_ADJACENCY_DEFAULT,
  relationsHideOverlappingLabels: RELATIONS_HIDE_OVERLAPPING_LABELS_DEFAULT,
  relationsLabelOverflow: RELATIONS_LABEL_OVERFLOW_DEFAULT,
  relationsLabelWidth: RELATIONS_LABEL_WIDTH_DEFAULT,
  relationsTimeSlider: RELATIONS_TIME_SLIDER_DEFAULT,
  relationsLinkColor: RELATIONS_LINK_COLOR_DEFAULT,
  relationsRememberView: false,
  relationsViewZoom: undefined,
  relationsViewCenter: undefined,
  relationsSankeyOrient: SANKEY_ORIENT_DEFAULT,
  relationsSankeyNodeAlign: SANKEY_NODE_ALIGN_DEFAULT,
  relationsSankeyNodeWidth: SANKEY_NODE_WIDTH_DEFAULT,
  relationsSankeyNodeGap: SANKEY_NODE_GAP_DEFAULT,
  relationsSankeyCurveness: SANKEY_CURVENESS_DEFAULT,
  relationsSankeyLinkOpacity: SANKEY_LINK_OPACITY_DEFAULT,
  relationsSankeyLayoutIterations: SANKEY_LAYOUT_ITERATIONS_DEFAULT,
  relationsChordStartAngle: CHORD_START_ANGLE_DEFAULT,
  relationsChordClockwise: CHORD_CLOCKWISE_DEFAULT,
  relationsChordPadAngle: CHORD_PAD_ANGLE_DEFAULT,
  relationsChordMinAngle: CHORD_MIN_ANGLE_DEFAULT,
  relationsChordLinkOpacity: CHORD_LINK_OPACITY_DEFAULT,
  animation: { enabled: ANIMATION_ENABLED_DEFAULT },
  legend: presetLegend(undefined, 'bottom'),
} satisfies RelationsResetOptions;

const cardOptions = previewCardOptions({ options: { relationsShowNodeLabels: false } });

function preset(
  name: string,
  description: string,
  options: Partial<RelationsResetOptions>
): VisualizationSuggestion<PanelOptions, EChartsRelationsFieldConfig> {
  return {
    name,
    description,
    options: { ...RELATIONS_PRESET_BASE, ...options },
    cardOptions,
  };
}

function graphDensityOptions(nodeCount: number | undefined): Partial<RelationsResetOptions> {
  if (nodeCount != null && nodeCount > 50) {
    return { relationsNodeSize: 10, relationsShowNodeLabels: false };
  }
  if (nodeCount != null && nodeCount > 20) {
    return { relationsNodeSize: 16 };
  }
  return {};
}

const serviceTopology = (nodeCount?: number) =>
  preset('Service topology', 'Show service dependencies and their direction.', {
    [seriesTypePath]: 'graph',
    relationsLayout: 'force',
    relationsEdgeArrows: true,
    relationsFocusAdjacency: true,
    relationsPan: true,
    relationsZoom: true,
    relationsShowNodeLabels: true,
    relationsShowEdgeValues: false,
    relationsTimeSlider: false,
    legend: presetLegend(nodeCount, 'bottom'),
    ...graphDensityOptions(nodeCount),
  });

const circularNetwork = (nodeCount?: number) =>
  preset('Circular network', 'Arrange network relationships in a stable circle.', {
    [seriesTypePath]: 'graph',
    relationsLayout: 'circular',
    relationsFocusAdjacency: true,
    relationsPan: true,
    relationsZoom: true,
    relationsShowEdgeValues: false,
    relationsTimeSlider: false,
    legend: presetLegend(nodeCount, 'bottom'),
    ...graphDensityOptions(nodeCount),
  });

const weightedFlow = (nodeCount?: number) =>
  preset('Weighted flow', 'Show how weighted flow moves through a process.', {
    [seriesTypePath]: 'sankey',
    relationsSankeyOrient: 'horizontal',
    relationsLinkColor: 'gradient',
    relationsFocusAdjacency: true,
    relationsShowNodeLabels: true,
    relationsShowEdgeValues: false,
    relationsTimeSlider: false,
    legend: presetLegend(nodeCount, 'bottom'),
  });

const mutualRelations = (nodeCount?: number) =>
  preset('Mutual relations', 'Show dense or cyclic traffic between pairs.', {
    [seriesTypePath]: 'chord',
    relationsLinkColor: 'gradient',
    relationsFocusAdjacency: true,
    relationsHideOverlappingLabels: true,
    relationsShowNodeLabels: true,
    relationsTimeSlider: false,
    legend: presetLegend(nodeCount, 'bottom'),
  });

const timeNetwork = (nodeCount?: number) =>
  preset('Time network', 'Show how a network changes over a time range.', {
    [seriesTypePath]: 'graph',
    relationsLayout: 'circular',
    relationsTimeSlider: true,
    relationsShowEdgeValues: true,
    relationsFocusAdjacency: true,
    relationsPan: true,
    relationsZoom: true,
    legend: presetLegend(nodeCount, 'right'),
    ...graphDensityOptions(nodeCount),
  });

export const relationsPresetsSupplier: VisualizationPresetsSupplier<PanelOptions, EChartsRelationsFieldConfig> = ({
  dataSummary,
}) => {
  const nodeCount = dataSummary == null ? undefined : relationsNodeCount(dataSummary);
  const presets = [serviceTopology(nodeCount)];
  if (nodeCount == null || (nodeCount >= 2 && nodeCount <= RELATIONS_CIRCULAR_MAX_NODES)) {
    presets.push(circularNetwork(nodeCount));
  }
  if (dataSummary == null || fitsSankeyTopology(dataSummary)) {
    presets.push(weightedFlow(nodeCount));
  }
  if (dataSummary == null || !exceedsChordNodeBudget(dataSummary)) {
    presets.push(mutualRelations(nodeCount));
  }
  if (
    dataSummary?.hasFieldType(FieldType.time) &&
    dataSummary.isInstant === false &&
    nodeCount != null &&
    nodeCount >= 2 &&
    nodeCount <= RELATIONS_CIRCULAR_MAX_NODES
  ) {
    presets.push(timeNetwork(nodeCount));
  }
  return presets;
};
