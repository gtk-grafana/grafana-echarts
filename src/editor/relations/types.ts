import { type EChartsFieldConfig, type SeriesType } from 'editor/types';

/** Relations chart types that use the graph data contracts. */
export type RelationsSeriesType = Extract<SeriesType, 'graph' | 'sankey' | 'chord'>;

/** Values for ECharts `series.graph.layout`. */
export type RelationsGraphLayout = 'force' | 'circular' | 'none';

/** Values for ECharts link color inheritance. */
export type RelationsLinkColor = 'source' | 'target' | 'gradient';

/** Values for ECharts label overflow. */
export type RelationsLabelOverflow = 'none' | 'truncate' | 'break' | 'breakAll';

/** Values for ECharts `series.sankey.orient`. */
export type RelationsSankeyOrient = 'horizontal' | 'vertical';

/** Values for ECharts `series.sankey.nodeAlign`. */
export type RelationsSankeyNodeAlign = 'justify' | 'left' | 'right';

/** Values for ECharts `lineStyle.type`. */
export type RelationsLineType = 'solid' | 'dashed' | 'dotted';

/**
 * Per-mark field configuration for relations charts.
 * Grafana field configuration: https://grafana.com/developers/plugin-tools/how-to-guides/panel-plugins/custom-field-config
 */
export interface EChartsRelationsFieldConfig extends EChartsFieldConfig {
  /** Node diameter in pixels. */
  nodeRadius?: number;
  /** Second line in the node tooltip. */
  subtitle?: string;
  /** Fixed node position. Both coordinates are required. */
  fixedX?: number;
  fixedY?: number;
  /** Grafana icon name. The panel stores but does not render it. */
  icon?: string;
  /** Edge stroke width. */
  lineWidth?: number;
  /** Edge stroke pattern. */
  lineType?: RelationsLineType;
  /** Edge curvature from 0 to 1. */
  curveness?: number;
  /**
   * Source label used by ad hoc filters.
   * @deprecated Keep the original endpoint label in the query instead.
   */
  sourceFilterLabel?: string;
  /**
   * Target label used by ad hoc filters.
   * @deprecated Keep the original endpoint label in the query instead.
   */
  targetFilterLabel?: string;
}
