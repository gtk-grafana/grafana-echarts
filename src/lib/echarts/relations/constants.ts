import { type RelationsBudgetVariant, type RelationsMarkLimit } from 'lib/echarts/relations/types';

/** Automatic node and mark limits for data that reaches ECharts. */
export const RELATIONS_MARK_LIMITS: Readonly<Record<RelationsBudgetVariant, Readonly<RelationsMarkLimit>>> = {
  force: { maxNodes: 200, maxMarks: 500 },
  circular: { maxNodes: 500, maxMarks: 1000 },
  fixed: { maxNodes: 500, maxMarks: 1000 },
  sankey: { maxNodes: 100, maxMarks: 400 },
  chord: { maxNodes: 40, maxMarks: 200 },
};
