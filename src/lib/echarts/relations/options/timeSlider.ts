import { RELATIONS_TIME_SLIDER_DEFAULT } from 'editor/relations/constants';
import { type PanelOptions } from 'types';

/** Check whether the time slider reads one timestamp. */

/** Whether the panel offers a timestamp to read the marks at instead of a reducer. */
export function resolveRelationsTimeSlider(options: PanelOptions): boolean {
  return options.relationsTimeSlider ?? RELATIONS_TIME_SLIDER_DEFAULT;
}
