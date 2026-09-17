import { type RelationsGraphReadResult } from 'lib/echarts/relations/converters/nodeGraph';

/** A Relations variant with one performance budget. */
export type RelationsBudgetVariant = 'force' | 'circular' | 'fixed' | 'sankey' | 'chord';

/** Automatic node and mark limits for one Relations variant. */
export interface RelationsMarkLimit {
  maxNodes: number;
  maxMarks: number;
}

/** Counts and ceilings for data that exceeds a Relations budget. */
export interface RelationsMarkLimitIssue {
  reason: 'mark-limit';
  variant: RelationsBudgetVariant;
  nodeCount: number;
  linkCount: number;
  markCount: number;
  maxNodes: number;
  maxMarks: number;
}

/** A graph or a data problem that prevents the selected series from drawing the graph. */
export type VisibleRelationsGraphResult =
  | RelationsGraphReadResult
  | { kind: 'issue'; reason: 'hidden-marks' }
  | { kind: 'issue'; reason: 'mark-limit'; details: RelationsMarkLimitIssue };
