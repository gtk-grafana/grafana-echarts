import { type RelationsChartContext } from 'lib/echarts/charts/types';
import { type RelationsMarks } from 'lib/echarts/tooltip/types';

/**
 * The render context the family's option builders take: the chart context plus the
 * per-mark lookup the tooltip and the node labels read.
 *
 * At the family root rather than under `options/` because all three variants' builders
 * and the tooltip take it — it is the family's shared parameter, not a graph option.
 */

/** The chart context plus the per-mark lookup the tooltip and node labels read. */
export interface RelationsSeriesContext extends RelationsChartContext {
  /**
   * Each mark's own display processor and data-link source, so a hovered node or
   * edge formats with its own unit and surfaces its own `config.links`. Built once
   * per render by `getRelationsTooltipMarks`; optional so a unit test can build a
   * series without one and fall back to the panel formatter.
   */
  marks?: RelationsMarks;
}
