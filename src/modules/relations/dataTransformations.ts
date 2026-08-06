import { debug, LOG_LEVELS } from 'development';
import { isGraphWideFrames } from 'lib/echarts/converters/graphWide';
import { isLegacyGraphFrames, legacyToWideOperator } from 'lib/echarts/converters/legacyToWide';
import { isLongGraphFrames, longToWideOperator } from 'lib/echarts/converters/longToWide';
import { type PanelDataTransformationsSupplier } from 'lib/grafana/panelDataTransformations';

/**
 * The transformations the relations family needs before it can be drawn or configured.
 *
 * Conditional on the frames, which is what makes it safe to leave on permanently:
 *
 * - a long response (one series per frame, endpoints in labels — what every labelled
 *   datasource returns) -> the pivot, so all N edges reach the panel instead of one;
 * - already wide (or natively emitted wide) -> `[]`, nothing runs, frame identity is
 *   preserved and `VizPanel.applyFieldConfig` still short-circuits;
 * - row-based node-graph frames -> the conversion, run above the panel so each node and
 *   edge is a field by the time field overrides are applied;
 * - anything else -> `[]`. The panel may be pointed at a frame it cannot draw, and a
 *   transformation is not the place to complain about it.
 *
 * **Exactly one converter claims a response, and the order is load-bearing.** The two
 * shapes are disjoint — a long series carries no `source`/`target` *columns*, a row frame
 * carries no endpoint *labels* — but the already-wide test cannot come first: a long
 * response passes it, because `isEdgesWideFrame` shape-matches any numeric field with
 * endpoint labels and a `Value` field has them. Testing "already wide" ahead of the pivot
 * would leave the panel reading the first frame only, i.e. a one-edge graph, which is the
 * bug the pivot exists to fix. `longEdgeSeries` in turn declines any response where
 * something else is already the edges frame, so the branches cannot both be right.
 *
 * A datasource that later emits `graph-*-wide` natively silently stops triggering any
 * conversion — no dashboard changes, the second branch just starts winning.
 *
 * Note the supplier's context is `{ series }` only, so this cannot consult panel options;
 * the `dataFormat` escape hatch discussed in
 * ../../../todo/graph-wide-migration.md#the-dataformat-panel-option would need the
 * upstream context widened first. That ceiling is also why the pivot reads the contract's
 * canonical label keys rather than configurable ones.
 */
export const relationsDataTransformations: PanelDataTransformationsSupplier = ({ series }) => {
  debug('relationsDataTransformations', LOG_LEVELS.debug, { series });
  if (isLongGraphFrames(series)) {
    return [longToWideOperator];
  }
  if (isGraphWideFrames(series)) {
    return [];
  }
  return isLegacyGraphFrames(series) ? [legacyToWideOperator] : [];
};
