import { type RelationsChartContext } from 'lib/echarts/charts/types';
import { RELATIONS_MARK_LIMITS } from 'lib/echarts/relations/constants';
import { toSankeyLinks } from 'lib/echarts/relations/converters/dag';
import { type NodeGraphData } from 'lib/echarts/relations/converters/model';
import { getGraphLayout } from 'lib/echarts/relations/options/layout';
import { type RelationsBudgetVariant, type RelationsMarkLimitIssue } from 'lib/echarts/relations/types';

/** Select the budget that matches the ECharts series and graph layout. */
export function resolveRelationsBudgetVariant(
  data: NodeGraphData,
  ctx: Pick<RelationsChartContext, 'seriesType' | 'options'>
): RelationsBudgetVariant {
  if (ctx.seriesType !== 'graph') {
    return ctx.seriesType;
  }
  const layout = getGraphLayout(data, ctx.options);
  return layout === 'none' ? 'fixed' : layout;
}

/** Read a saved Advanced or API mark limit when it is a positive integer. */
function getConfiguredRelationsMaxMarks(options: RelationsChartContext['options']): number | undefined {
  const configured = options.relationsMaxMarks;
  const activeMode = options.editorMode === 'advanced' || options.editorMode === 'api';
  if (!activeMode || !Number.isInteger(configured) || configured == null || configured < 1) {
    return undefined;
  }
  return configured;
}

/** Use a saved Advanced or API mark limit when it is a positive integer. */
export function resolveRelationsMaxMarks(automaticMaxMarks: number, options: RelationsChartContext['options']): number {
  return getConfiguredRelationsMaxMarks(options) ?? automaticMaxMarks;
}

/** Return an issue when the visible data exceeds its node or mark ceiling. */
export function getRelationsMarkLimitIssue(
  data: NodeGraphData,
  ctx: Pick<RelationsChartContext, 'seriesType' | 'options'>
): RelationsMarkLimitIssue | undefined {
  const variant = resolveRelationsBudgetVariant(data, ctx);
  const automatic = RELATIONS_MARK_LIMITS[variant];
  // Sankey draws only the links that remain after its DAG conversion.
  const linkCount = variant === 'sankey' ? toSankeyLinks(data.links).links.length : data.links.length;
  const nodeCount = data.nodes.length;
  const markCount = nodeCount + linkCount;
  const configuredMaxMarks = getConfiguredRelationsMaxMarks(ctx.options);
  const maxNodes = configuredMaxMarks ?? automatic.maxNodes;
  const maxMarks = configuredMaxMarks ?? automatic.maxMarks;

  return nodeCount > maxNodes || markCount > maxMarks
    ? { reason: 'mark-limit', variant, nodeCount, linkCount, markCount, maxNodes, maxMarks }
    : undefined;
}
