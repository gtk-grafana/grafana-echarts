import { isGraphWideFrames } from 'lib/echarts/converters/graphWide';
import { isLegacyGraphFrames, legacyToWideOperator } from 'lib/echarts/converters/legacyToWide';
import { type PanelDataTransformationsSupplier } from 'lib/grafana/panelDataTransformations';

/**
 * The transformations the relations family needs before it can be drawn or configured.
 *
 * Conditional on the frames, which is what makes it safe to leave on permanently:
 *
 * - already wide (or natively emitted wide) -> `[]`, nothing runs, frame identity is
 *   preserved and `VizPanel.applyFieldConfig` still short-circuits;
 * - row-based node-graph frames -> the conversion, run above the panel so each node and
 *   edge is a field by the time field overrides are applied;
 * - anything else -> `[]`. The panel may be pointed at a frame it cannot draw, and a
 *   transformation is not the place to complain about it.
 *
 * A datasource that later emits `graph-*-wide` natively silently stops triggering the
 * conversion — no dashboard changes, the first branch just starts winning.
 *
 * Note the supplier's context is `{ series }` only, so this cannot consult panel
 * options; the `dataFormat` escape hatch discussed in
 * ../../../todo/graph-wide-migration.md#the-dataformat-panel-option would need the
 * upstream context widened first.
 */
export const relationsDataTransformations: PanelDataTransformationsSupplier = ({ series }) => {
  console.log('raw frame', series);
  return isLegacyGraphFrames(series) && !isGraphWideFrames(series) ? [legacyToWideOperator] : [];
};
