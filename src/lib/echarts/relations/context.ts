import { type RelationsChartContext } from 'lib/echarts/charts/types';

import { type RelationsMarks } from 'lib/echarts/relations/tooltip/types';

/** The chart context plus the per-mark lookup the tooltip and node labels read. */
export interface RelationsSeriesContext extends RelationsChartContext {
  /** Display and data-link metadata for each mark. */
  marks?: RelationsMarks;
}
