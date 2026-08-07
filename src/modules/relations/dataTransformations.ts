import { debug, LOG_LEVELS } from 'development';
import { deriveNodesOperator } from 'lib/echarts/converters/deriveNodes';
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
 *   datasource returns) -> the pivot, so all N edges reach the panel as **named** marks;
 * - already wide (or natively emitted wide) -> nothing to reshape;
 * - row-based node-graph frames -> the conversion, run above the panel so each node and
 *   edge is a field by the time field overrides are applied;
 * - anything else -> `[]`. The panel may be pointed at a frame it cannot draw, and a
 *   transformation is not the place to complain about it.
 *
 * **Every branch that claims a response then derives its missing nodes.** All three shapes
 * are allowed to describe edges alone, and two of them routinely do — `longToWide` pivots
 * edges only, and `sum by (source, target)` is the canonical time-series graph query — so
 * without `deriveNodes` the marks that reach the override pass are the edges and nothing
 * else, and every node in the panel is one no field config can address. It runs last
 * because it completes the wide form rather than producing it: it reads the roles the
 * others just established.
 *
 * That is also why the already-wide branch no longer returns `[]`. It still costs a
 * response that declares all its nodes nothing — `deriveNodes` returns the input array
 * itself when there is nothing missing, so frame identity is preserved and
 * `VizPanel.applyFieldConfig` still short-circuits.
 *
 * **Exactly one converter claims a response, and the order is load-bearing.** The two
 * shapes are disjoint — a long series carries no `source`/`target` *columns*, a row frame
 * carries no endpoint *labels* — but the already-wide test cannot come first: a long
 * response passes it, because `isEdgesWideFrame` shape-matches any numeric field with
 * endpoint labels and a `Value` field has them.
 *
 * What testing "already wide" first would cost is **identity**, not topology. The reader
 * collects every frame that looks like edges (`graphWide.ts`), so all N edges draw either
 * way; but N raw frames whose value field is called `Value` are N marks sharing one id,
 * and only a transformation running before `applyFieldOverrides` can give each edge a
 * `field.name` of its own — an override target, a picker entry, a `byName`/`byRegexp`
 * match. Flipping the order would trade N override targets for zero. `longEdgeSeries` in
 * turn declines any response where something else is already the edges frame, so the
 * branches cannot both be right.
 *
 * A datasource that later emits `graph-*-wide` natively silently stops triggering any
 * conversion — no dashboard changes, the second branch just starts winning.
 *
 * Note the supplier's context is `{ series }` only, so this cannot consult panel options at
 * all — one of the two reasons the `dataFormat` panel option discussed in
 * ../../../todo/graph-wide-migration.md#the-dataformat-panel-option was never built: it is
 * mostly unneeded now that `meta.type` is authoritative in both directions, and the residual
 * ambiguous case it would help with is unreachable from here regardless. That ceiling is
 * also why the pivot reads the contract's canonical label keys rather than configurable ones.
 */
export const relationsDataTransformations: PanelDataTransformationsSupplier = ({ series }) => {
  debug('relationsDataTransformations', LOG_LEVELS.debug, { series });
  if (isLongGraphFrames(series)) {
    return [longToWideOperator, deriveNodesOperator];
  }
  if (isGraphWideFrames(series)) {
    return [deriveNodesOperator];
  }
  return isLegacyGraphFrames(series) ? [legacyToWideOperator, deriveNodesOperator] : [];
};
