import { type PanelOptionsEditorBuilder } from '@grafana/data';
import { t } from '@grafana/i18n';
import { hasGraphTimeline } from 'lib/echarts/converters/graphWide';
import { RELATIONS_TIME_SLIDER_DEFAULT, RELATIONS_TIME_STEP_DURATION_DEFAULT } from 'lib/echarts/options/timeline';
import { addAdvancedNumberInput } from 'lib/grafana/editor/common/advanced-options';
import { type PanelOptions } from 'types';

/**
 * The time slider: read every mark at **one timestamp** instead of reducing its rows
 * away.
 *
 * Registered in "Value options", beside the picker it replaces, because it is the same
 * question asked differently. A mark is a field and its values run over the frame's row
 * dimension, so `reduceOptions.calcs[0]` answers "which one number stands for this
 * mark's whole timeline" — and on ranged data that throws the timeline away. This
 * answers "show me the graph as it was at 14:32" instead, so the two are alternatives
 * and the picker is hidden while the slider is on (`addRelationsStatOptions`).
 *
 * The slider itself is drawn in the panel body, not here: it is a *selection*, not a
 * setting, and writing it into the options would mark the dashboard dirty on every step
 * of a scrub. See `ChartTimeSlider` and `ChartModule.getTimeline`.
 */
export function addRelationsTimelineOptions(builder: PanelOptionsEditorBuilder<PanelOptions>): void {
  builder.addBooleanSwitch({
    path: 'relationsTimeSlider',
    name: t('relations.timeline.name-time-slider', 'Time slider'),
    description: t(
      'relations.timeline.description-time-slider',
      'Read each mark at one timestamp instead of calculating over the range. Needs ranged data'
    ),
    category: [t('stat.add-standard-data-reduce-options.category-value-options', 'Value options')],
    defaultValue: RELATIONS_TIME_SLIDER_DEFAULT,
    /**
     * Hidden unless this response has somewhere to scrub to — `showIf` is handed the
     * panel's frames for exactly this, the same way "Show node values" gates on
     * `hasNoNodeStats`. Without it the switch appears on every instant panel in a
     * dashboard, where turning it on only hides the reducer picker and posts an advisory.
     *
     * **Except when it is already on**, which is the whole reason this is an `||`. The
     * timeline comes and goes with the data: a query edit, a narrowed dashboard range or a
     * refresh that returns one row would otherwise take the switch away while it was set,
     * leaving the user with a hidden reducer picker and no control to undo it.
     */
    showIf: (options, data) => options.relationsTimeSlider === true || hasGraphTimeline(data),
  });

  /**
   * Milliseconds of **wall clock** per step while playing — not the width of a window
   * the step aggregates over. There is no window: a stop reads the one sample at its
   * timestamp, and the stops are the timestamps the data actually carries, so the step
   * count is data-driven rather than a duration the user divides the range by.
   */
  addAdvancedNumberInput(builder, {
    path: 'relationsTimeStepDuration',
    name: t('relations.timeline.name-step-duration', 'Playback step'),
    description: t(
      'relations.timeline.description-step-duration',
      'Milliseconds between steps while the time slider is playing'
    ),
    defaultValue: RELATIONS_TIME_STEP_DURATION_DEFAULT,
    settings: { min: 50, step: 50, integer: true },
    showIf: (options) => options.relationsTimeSlider === true,
  });
}
