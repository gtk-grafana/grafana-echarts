import { type PanelDataSummary, VisualizationSuggestionScore } from '@grafana/data';
import {
  RELATIONS_CHORD_MAX_NODES,
  RELATIONS_MAX_EDGES,
  RELATIONS_SANKEY_MAX_LEVELS,
  RELATIONS_SANKEY_MAX_NODES,
} from 'lib/echarts/charts/suggestionLimits';
import { isLegacyEdgesFrame, isLegacyGraphFrames } from 'lib/echarts/relations/converters/legacyToWide';
import { relationsTopology } from 'lib/echarts/relations/charts/topology';

/**
 * Score node-graph data for the Relations family.
 *
 * `Best` uses Grafana's `nodeGraph` hint. `Good` uses the legacy `source` and
 * `target` edge shape available before panel transformations run. Large responses
 * are withheld when a force layout cannot converge within a frame budget.
 */
export const scoreRelations = (summary: PanelDataSummary): VisualizationSuggestionScore | undefined => {
  const frames = summary.rawFrames ?? [];
  const isPreferred = summary.hasPreferredVisualisationType('nodeGraph');
  if (!isPreferred && !isLegacyGraphFrames(frames)) {
    return undefined;
  }
  const edgesFrame = frames.find(isLegacyEdgesFrame);
  if (edgesFrame != null && edgesFrame.length > RELATIONS_MAX_EDGES) {
    return undefined;
  }
  return isPreferred ? VisualizationSuggestionScore.Best : VisualizationSuggestionScore.Good;
};

/** Return the best available node count for Relations preset sizing. */
export const relationsNodeCount = (summary: PanelDataSummary): number | undefined =>
  relationsTopology(summary)?.nodeCount;

/** Check whether a Chord ring has enough room for the graph nodes. */
export const exceedsChordNodeBudget = (summary: PanelDataSummary): boolean =>
  (relationsNodeCount(summary) ?? 0) > RELATIONS_CHORD_MAX_NODES;

/** Check whether Sankey can show the graph as a readable directed flow. */
export const fitsSankeyTopology = (summary: PanelDataSummary): boolean => {
  const topology = relationsTopology(summary);
  return (
    topology == null ||
    (!topology.hasCycle &&
      topology.nodeCount <= RELATIONS_SANKEY_MAX_NODES &&
      topology.levels <= RELATIONS_SANKEY_MAX_LEVELS)
  );
};
