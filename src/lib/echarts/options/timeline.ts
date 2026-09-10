import { type PanelOptions } from 'types';

/**
 * The time slider's option: read every mark at **one timestamp** instead of reducing its
 * rows to a stat.
 *
 * A leaf module rather than another resolver in `options/graph.ts`: the editor, the chart
 * module and the **tooltip** all ask this, and `options/graph.ts` imports the tooltip
 * builder, so keeping it there would make the tooltip's read a cycle.
 */

/**
 * **Off** by default: reducing the row dimension to one stat is the family's other reading,
 * and the only one an instant response has.
 */
export const RELATIONS_TIME_SLIDER_DEFAULT = false;

/**
 * Whether the panel offers a timestamp to read the marks at instead of a reducer — see
 * `ChartTimeSlider`. The strip is drawn only when the data also has stops to step
 * through; that half is `relationsChartModule.getTimeline`.
 */
export function resolveRelationsTimeSlider(options: PanelOptions): boolean {
  return options.relationsTimeSlider ?? RELATIONS_TIME_SLIDER_DEFAULT;
}
