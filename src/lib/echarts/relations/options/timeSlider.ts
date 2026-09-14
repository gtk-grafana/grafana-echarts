import { RELATIONS_TIME_SLIDER_DEFAULT } from 'editor/relations/constants';
import { type PanelOptions } from 'types';

/**
 * The time slider's option: read every mark at **one timestamp** instead of reducing its
 * rows to a stat.
 *
 * **Keep this a leaf.** The editor, the chart module and the **tooltip** all ask this, and
 * the tooltip builder is imported by `options/labels.ts`, so folding the resolver into any
 * module on that side would make the tooltip's read a cycle — one that resolves to
 * `undefined` silently rather than throwing. Its default lives in
 * `editor/relations/constants.ts`, so this module imports nothing from the family.
 */

/**
 * Whether the panel offers a timestamp to read the marks at instead of a reducer — see
 * `ChartTimeSlider`. The strip is drawn only when the data also has stops to step
 * through; that half is `relationsChartModule.getTimeline`.
 */
export function resolveRelationsTimeSlider(options: PanelOptions): boolean {
  return options.relationsTimeSlider ?? RELATIONS_TIME_SLIDER_DEFAULT;
}
