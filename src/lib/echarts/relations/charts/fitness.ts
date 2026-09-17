import { type PanelDataSummary, VisualizationSuggestionScore } from '@grafana/data';
import {
  RELATIONS_CHORD_MAX_NODES,
  RELATIONS_MAX_EDGES,
  RELATIONS_SANKEY_MAX_LEVELS,
  RELATIONS_SANKEY_MAX_NODES,
} from 'lib/echarts/charts/suggestionLimits';
import { RELATIONS_MARK_LIMITS } from 'lib/echarts/relations/constants';
import { isLegacyEdgesFrame, isLegacyGraphFrames } from 'lib/echarts/relations/converters/legacyToWide';
import { relationsMarkCounts, relationsTopology } from 'lib/echarts/relations/charts/topology';
import { type RelationsBudgetVariant } from 'lib/echarts/relations/types';

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

/** Check whether a preset variant can draw the complete response within its automatic budget. */
export const fitsRelationsMarkBudget = (summary: PanelDataSummary, variant: RelationsBudgetVariant): boolean => {
  const counts = relationsMarkCounts(summary);
  if (counts == null) {
    return true;
  }
  const limits = RELATIONS_MARK_LIMITS[variant];
  const linkCount = variant === 'sankey' ? counts.sankeyLinkCount : counts.linkCount;
  return counts.nodeCount <= limits.maxNodes && counts.nodeCount + linkCount <= limits.maxMarks;
};

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
